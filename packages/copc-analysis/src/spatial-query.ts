import type {
  Bounds3,
  PointAttributeArray,
  PointCloudNode,
  PointCloudSource,
} from "cesiumjs-copc-core";

export interface SpatialQueryOptions {
  /** Dimensions to decode. Narrowing this is the cheapest way to speed up a query. */
  readonly dimensions?: readonly string[];
  /**
   * Stop descending past this octree depth. Deeper levels subdivide the same extent
   * into more nodes, so capping depth bounds how many requests a wide box can issue,
   * at the cost of resolution.
   */
  readonly maximumDepth?: number;
  /**
   * Stop once this many points have been yielded. Guards against a wide box pulling
   * most of the file.
   */
  readonly pointLimit?: number;
  /**
   * Propagated into `loadNode`, so an abort is observed at the traversal checkpoints
   * between nodes and at the abort checks the source and decoder perform around
   * decompression. It does not interrupt a decompression call already in progress.
   */
  readonly signal?: AbortSignal;
}

/**
 * Streams points inside an axis-aligned box expressed in the COPC source CRS.
 *
 * Bounds are in source CRS units, not degrees or ECEF metres, because the whole point
 * of running analysis against COPC directly is to stay in the coordinate space the
 * data was captured in.
 *
 * This is a generator rather than a function returning an array so a caller can start
 * consuming after the first intersecting node instead of waiting for the traversal to
 * finish. Nodes arrive breadth first, so early results are coarse and later ones
 * refine them. Code that needs a complete answer must drain the generator.
 *
 * Traversal prunes on the hierarchy bounding boxes first and only then decodes and
 * point-tests the survivors, so a small box costs a small number of range requests
 * rather than a full download.
 */
export async function* queryBounds(
  source: PointCloudSource,
  bounds: Bounds3,
  options: SpatialQueryOptions = {},
): AsyncGenerator<PointCloudNode> {
  validateBounds(bounds);
  const maximumDepth = options.maximumDepth ?? Number.POSITIVE_INFINITY;
  const pointLimit = options.pointLimit ?? Number.POSITIVE_INFINITY;
  if (maximumDepth < 0 || pointLimit <= 0) throw new RangeError("Query limits must be positive");
  const signal = options.signal;
  const queue = [await source.root()];
  let matchedPoints = 0;

  while (queue.length > 0 && matchedPoints < pointLimit) {
    signal?.throwIfAborted();
    const entry = queue.shift()!;
    if (!boundsIntersect(entry.bounds, bounds)) continue;
    const node = await source.loadNode(entry.id, options.dimensions, signal);
    const filtered = filterNode(node, bounds, pointLimit - matchedPoints);
    if (filtered.pointCount > 0) {
      matchedPoints += filtered.pointCount;
      yield filtered;
    }
    if (entry.id.depth < maximumDepth && matchedPoints < pointLimit) {
      signal?.throwIfAborted();
      queue.push(...(await source.getHierarchy(entry.id)));
    }
  }
}

/**
 * Tests whether two axis-aligned boxes overlap, touching faces included.
 *
 * Both boxes must be in the same CRS. Comparison is inclusive so a point exactly on a
 * shared face is not silently dropped by the hierarchy prune before the point test
 * ever sees it.
 */
export function boundsIntersect(left: Bounds3, right: Bounds3): boolean {
  return (
    left[0] <= right[3] &&
    left[3] >= right[0] &&
    left[1] <= right[4] &&
    left[4] >= right[1] &&
    left[2] <= right[5] &&
    left[5] >= right[2]
  );
}

function filterNode(node: PointCloudNode, bounds: Bounds3, limit: number): PointCloudNode {
  const indices: number[] = [];
  for (let i = 0; i < node.pointCount && indices.length < limit; i += 1) {
    const x = node.positions[i * 3]!;
    const y = node.positions[i * 3 + 1]!;
    const z = node.positions[i * 3 + 2]!;
    if (
      x >= bounds[0] &&
      x <= bounds[3] &&
      y >= bounds[1] &&
      y <= bounds[4] &&
      z >= bounds[2] &&
      z <= bounds[5]
    ) {
      indices.push(i);
    }
  }
  const positions = new Float64Array(indices.length * 3);
  const colors = node.colors ? new Uint8Array(indices.length * 3) : undefined;
  const attributes: Record<string, PointAttributeArray> = {};
  for (let target = 0; target < indices.length; target += 1) {
    const source = indices[target]!;
    positions[target * 3] = node.positions[source * 3]!;
    positions[target * 3 + 1] = node.positions[source * 3 + 1]!;
    positions[target * 3 + 2] = node.positions[source * 3 + 2]!;
    if (colors && node.colors) {
      colors[target * 3] = node.colors[source * 3]!;
      colors[target * 3 + 1] = node.colors[source * 3 + 1]!;
      colors[target * 3 + 2] = node.colors[source * 3 + 2]!;
    }
  }
  for (const [name, values] of Object.entries(node.attributes)) {
    const filtered = new Float64Array(indices.length);
    for (let target = 0; target < indices.length; target += 1) {
      filtered[target] = values[indices[target]!]!;
    }
    attributes[name] = filtered;
  }
  return {
    id: node.id,
    pointCount: indices.length,
    positions,
    attributes,
    ...(colors === undefined ? {} : { colors }),
  };
}

function validateBounds(bounds: Bounds3): void {
  if (bounds.some((value) => !Number.isFinite(value))) {
    throw new RangeError("Query bounds must contain finite numbers");
  }
  if (bounds[0] > bounds[3] || bounds[1] > bounds[4] || bounds[2] > bounds[5]) {
    throw new RangeError("Query minimum bounds must not exceed maximum bounds");
  }
}
