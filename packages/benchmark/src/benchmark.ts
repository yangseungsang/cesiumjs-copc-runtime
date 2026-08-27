import { CopcSource, formatNodeId, type HierarchyEntry } from "cesiumjs-copc-core";

/**
 * Reproducible streaming and decode benchmark for a remote COPC file.
 *
 * This measures the network and decode path in Node, deliberately not the renderer.
 * Excluding WebGL keeps the measurement reproducible within one environment. Results
 * still depend on CPU, network location, and server behaviour, so they are not
 * comparable across machines without the controls described in `docs/benchmarks.md`.
 * Browser measurement follows the separate protocol in that document.
 */

export interface BenchmarkOptions {
  /** Stop selecting nodes once this many points are queued. Defaults to 1,000,000. */
  readonly targetPoints?: number;
  /** Hard cap on selected nodes, so a shallow file cannot pull the entire dataset. */
  readonly maximumNodes?: number;
  /** Parallel node loads after the first. Defaults to 4, matching the runtime queue. */
  readonly concurrency?: number;
  /** Dimensions to decode. Widening this raises decode cost, so keep it fixed when comparing runs. */
  readonly dimensions?: readonly string[];
}

export interface BenchmarkResult {
  readonly url: string;
  /** Absent when the server does not report `Content-Length`. */
  readonly fileBytes?: number;
  /** Points in the whole file, from the header. Compare against `decodedPoints`. */
  readonly totalPoints: number;
  /** Header and VLR read, measured from process start. */
  readonly metadataMilliseconds: number;
  /** Hierarchy page traversal only, excluding the metadata read. */
  readonly hierarchyMilliseconds: number;
  /** Wall clock from start until the first node finished decoding. */
  readonly timeToFirstPointMilliseconds: number;
  /** Covers all node loads including the first, so it overlaps time to first point. */
  readonly decodeMilliseconds: number;
  readonly decodedPoints: number;
  readonly decodedNodes: number;
  /** Derived from `decodedPoints` and `decodeMilliseconds`, so it includes fetch time. */
  readonly pointsPerSecond: number;
  /** HTTP requests actually issued, after coalescing. */
  readonly networkRequests: number;
  /** Ranges the runtime asked for, before coalescing. */
  readonly logicalRangeRequests: number;
  /** Logical ranges that were merged into a neighbour instead of issued separately. */
  readonly coalescedRangeRequests: number;
  readonly rangeCacheHits: number;
  readonly persistentRangeCacheHits: number;
  /** Bytes received from the network. The headline number for streaming efficiency. */
  readonly networkBytes: number;
  readonly compressedCacheBytes: number;
  readonly heapUsedBytes: number;
  readonly residentSetBytes: number;
  /** Deepest octree node reached, which shows how far refinement actually went. */
  readonly deepestNode: string;
}

/**
 * Runs one benchmark pass against a remote COPC URL.
 *
 * Run this from a cold process. Reusing a process carries DNS, TLS session, and
 * allocator state across runs and quietly inflates later results.
 */
export async function benchmarkCopc(
  url: string,
  options: BenchmarkOptions = {},
): Promise<BenchmarkResult> {
  const targetPoints = options.targetPoints ?? 1_000_000;
  const maximumNodes = options.maximumNodes ?? 32;
  const concurrency = options.concurrency ?? 4;
  if (targetPoints <= 0 || maximumNodes <= 0 || concurrency <= 0) {
    throw new RangeError("Benchmark limits and concurrency must be positive");
  }

  const started = performance.now();
  const source = await CopcSource.fromUrl(url);
  try {
    const metadata = await source.metadata();
    const metadataFinished = performance.now();
    const nodes = await collectBenchmarkNodes(source, targetPoints, maximumNodes);
    const hierarchyFinished = performance.now();
    const dimensions = options.dimensions ?? [
      "Red",
      "Green",
      "Blue",
      "Intensity",
      "Classification",
    ];
    const first = nodes[0];
    if (!first) throw new Error("COPC hierarchy does not contain a root node");
    const firstData = await source.loadNode(first.id, dimensions);
    const firstPointFinished = performance.now();
    const rest = await mapConcurrent(nodes.slice(1), concurrency, (node) =>
      source.loadNode(node.id, dimensions),
    );
    const decodeFinished = performance.now();
    const decodedPoints =
      firstData.pointCount + rest.reduce((total, node) => total + node.pointCount, 0);
    const decodeMilliseconds = decodeFinished - hierarchyFinished;
    const memory = process.memoryUsage();
    const statistics = source.statistics;
    const deepest = nodes.reduce((best, node) => (node.id.depth > best.id.depth ? node : best));
    return {
      url,
      ...(statistics.contentLength === undefined ? {} : { fileBytes: statistics.contentLength }),
      totalPoints: metadata.pointCount,
      metadataMilliseconds: metadataFinished - started,
      hierarchyMilliseconds: hierarchyFinished - metadataFinished,
      timeToFirstPointMilliseconds: firstPointFinished - started,
      decodeMilliseconds,
      decodedPoints,
      decodedNodes: nodes.length,
      pointsPerSecond: decodedPoints / Math.max(decodeMilliseconds / 1_000, Number.EPSILON),
      networkRequests: statistics.requests,
      logicalRangeRequests: statistics.logicalRequests,
      coalescedRangeRequests: statistics.coalescedRequests,
      rangeCacheHits: statistics.cacheHits,
      persistentRangeCacheHits: statistics.persistentCacheHits,
      networkBytes: statistics.bytesReceived,
      compressedCacheBytes: statistics.cachedBytes,
      heapUsedBytes: memory.heapUsed,
      residentSetBytes: memory.rss,
      deepestNode: formatNodeId(deepest.id),
    };
  } finally {
    source.destroy();
  }
}

/**
 * Selects nodes breadth first, taking the densest children first at each level.
 *
 * This deliberately mimics what a camera pulling back to frame the whole dataset
 * would request, rather than walking one branch to the leaves. A depth-first walk
 * would report decode throughput for a handful of dense leaf nodes and hide the
 * hierarchy page fetches that dominate a real first view.
 */
async function collectBenchmarkNodes(
  source: CopcSource,
  targetPoints: number,
  maximumNodes: number,
): Promise<HierarchyEntry[]> {
  const root = await source.root();
  const queue = [root];
  const selected: HierarchyEntry[] = [];
  let pointCount = 0;
  while (queue.length > 0 && selected.length < maximumNodes && pointCount < targetPoints) {
    const node = queue.shift()!;
    selected.push(node);
    pointCount += node.pointCount;
    const children = await source.getHierarchy(node.id);
    queue.push(...[...children].sort((a, b) => b.pointCount - a.pointCount));
  }
  return selected;
}

/**
 * Runs `transform` over `values` with a fixed number of in-flight calls, preserving
 * input order in the result.
 *
 * A plain `Promise.all` would open every node request at once and measure how the
 * server handles a burst rather than how the runtime streams. The worker loop keeps
 * exactly `concurrency` requests outstanding, which is what the real request queue
 * does.
 */
async function mapConcurrent<T, R>(
  values: readonly T[],
  concurrency: number,
  transform: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (next < values.length) {
      const index = next++;
      results[index] = await transform(values[index]!);
    }
  });
  await Promise.all(workers);
  return results;
}
