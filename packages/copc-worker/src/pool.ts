import type {
  CompressedPointCloudNode,
  CopcDecodingMetadata,
  CartesianTransformDefinition,
  PointCloudNodeFilter,
  PointCloudNode,
} from "cesiumjs-copc-core";
import type { DecoderWorkerRequest, DecoderWorkerResponse, WorkerStatistics } from "./protocol.js";

/**
 * The subset of `Worker` this pool depends on.
 *
 * Depending on the interface rather than the global class keeps the pool testable in
 * Node, where `Worker` does not exist, and lets an embedder supply its own worker
 * implementation through {@link CopcDecodeWorkerPoolOptions.workerFactory}.
 */
export interface WorkerLike {
  onmessage: ((event: MessageEvent<DecoderWorkerResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(message: DecoderWorkerRequest, transfer?: Transferable[]): void;
  terminate(): void;
}

/** Creates one worker. Called once per pool slot during {@link CopcDecodeWorkerPool.create}. */
export type DecoderWorkerFactory = () => WorkerLike;

export interface CopcDecodeWorkerPoolOptions {
  /** Header-derived decoding metadata, broadcast to every worker at startup. */
  readonly metadata: CopcDecodingMetadata;
  /** Omit when the source needs no projection. Decoded nodes then carry no `cartesian`. */
  readonly cartesianTransform?: CartesianTransformDefinition;
  /** Defaults to one fewer than the reported core count, clamped to 1 through 4. */
  readonly workerCount?: number;
  /** Override for tests or for bundlers that resolve the worker URL differently. */
  readonly workerFactory?: DecoderWorkerFactory;
}

interface PendingRequest {
  readonly resolve: (response: DecoderWorkerResponse) => void;
  readonly reject: (reason?: unknown) => void;
  readonly signal?: AbortSignal;
  readonly abort?: () => void;
}

type RpcRequest =
  | Omit<Extract<DecoderWorkerRequest, { type: "initialize" }>, "id">
  | Omit<Extract<DecoderWorkerRequest, { type: "load" }>, "id">
  | Omit<Extract<DecoderWorkerRequest, { type: "filter" }>, "id">;

class WorkerClient {
  readonly #worker: WorkerLike;
  readonly #pending = new Map<number, PendingRequest>();
  #nextId = 1;
  #destroyed = false;
  active = 0;

  constructor(factory: DecoderWorkerFactory) {
    this.#worker = factory();
    this.#worker.onmessage = (event) => this.#handleMessage(event.data);
    this.#worker.onerror = (event) => {
      this.#rejectAll(new Error(event.message || "COPC decoder worker failed"));
    };
  }

  async initialize(
    metadata: CopcDecodingMetadata,
    cartesianTransform?: CartesianTransformDefinition,
  ): Promise<void> {
    await this.#request({
      type: "initialize",
      metadata,
      ...(cartesianTransform === undefined ? {} : { cartesianTransform }),
    });
  }

  async decodeNode(
    node: CompressedPointCloudNode,
    dimensions: readonly string[],
    signal?: AbortSignal,
  ): Promise<{ node: PointCloudNode; statistics: WorkerStatistics }> {
    this.active += 1;
    try {
      const response = await this.#request({ type: "load", node, dimensions }, signal);
      if (response.type !== "success" || !response.node) {
        throw new Error("Decoder worker returned an empty point node");
      }
      return {
        node: response.node,
        statistics: response.statistics ?? { decodedNodes: 0, decodeMilliseconds: 0 },
      };
    } finally {
      this.active -= 1;
    }
  }

  async filterNode(
    node: PointCloudNode,
    filter: PointCloudNodeFilter | undefined,
    signal?: AbortSignal,
  ): Promise<PointCloudNode> {
    this.active += 1;
    try {
      const response = await this.#request(
        {
          type: "filter",
          node,
          ...(filter === undefined ? {} : { filter }),
        },
        signal,
      );
      if (response.type !== "success" || !response.node) {
        throw new Error("Decoder worker returned an empty filtered node");
      }
      return response.node;
    } finally {
      this.active -= 1;
    }
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    const id = this.#nextId++;
    this.#worker.postMessage({ type: "destroy", id });
    this.#worker.terminate();
    this.#rejectAll(new DOMException("Decoder worker pool destroyed", "AbortError"));
  }

  #request(request: RpcRequest, signal?: AbortSignal): Promise<DecoderWorkerResponse> {
    if (this.#destroyed) return Promise.reject(new Error("Decoder worker has been destroyed"));
    if (signal?.aborted) return Promise.reject(signal.reason);
    const id = this.#nextId++;
    return new Promise((resolve, reject) => {
      const abortSignal = signal;
      const abort = abortSignal
        ? () => {
            this.#pending.delete(id);
            this.#worker.postMessage({ type: "cancel", id });
            reject(abortSignal.reason);
          }
        : undefined;
      if (abort && abortSignal) abortSignal.addEventListener("abort", abort, { once: true });
      this.#pending.set(id, {
        resolve,
        reject,
        ...(signal === undefined ? {} : { signal }),
        ...(abort === undefined ? {} : { abort }),
      });
      const message = { ...request, id } as DecoderWorkerRequest;
      const transfer =
        message.type === "load" && message.node.bytes.buffer instanceof ArrayBuffer
          ? [message.node.bytes.buffer]
          : undefined;
      this.#worker.postMessage(message, transfer);
    });
  }

  #handleMessage(response: DecoderWorkerResponse): void {
    const pending = this.#pending.get(response.id);
    if (!pending) return;
    this.#pending.delete(response.id);
    if (pending.signal && pending.abort) pending.signal.removeEventListener("abort", pending.abort);
    if (response.type === "error") {
      const error = new Error(response.error.message);
      error.name = response.error.name;
      if (response.error.stack) error.stack = response.error.stack;
      pending.reject(error);
    } else {
      pending.resolve(response);
    }
  }

  #rejectAll(error: unknown): void {
    for (const pending of this.#pending.values()) pending.reject(error);
    this.#pending.clear();
  }
}

/**
 * Fixed-size pool of decoder workers.
 *
 * Work is dispatched to whichever worker currently has the fewest jobs in flight
 * rather than by round-robin, because node decode time varies by more than an order
 * of magnitude with point count and dimension selection. Round-robin would keep
 * queueing work behind a worker that drew a large node.
 *
 * The pool is created through {@link CopcDecodeWorkerPool.create} so that every
 * worker is initialized before any caller can submit a decode.
 */
export class CopcDecodeWorkerPool {
  readonly #workers: WorkerClient[];
  #decodedNodes = 0;
  #decodeMilliseconds = 0;
  #destroyed = false;

  private constructor(workers: WorkerClient[]) {
    this.#workers = workers;
  }

  /**
   * Spawns the workers and initializes all of them before resolving.
   *
   * If any worker fails to initialize the whole pool is destroyed and the error is
   * rethrown, so a caller never receives a pool where some workers would reject every
   * decode.
   */
  static async create(options: CopcDecodeWorkerPoolOptions): Promise<CopcDecodeWorkerPool> {
    const count = options.workerCount ?? defaultWorkerCount();
    if (!Number.isInteger(count) || count < 1) throw new RangeError("workerCount must be positive");
    const factory = options.workerFactory ?? defaultWorkerFactory;
    const workers = Array.from({ length: count }, () => new WorkerClient(factory));
    const pool = new CopcDecodeWorkerPool(workers);
    try {
      await Promise.all(
        workers.map((worker) => worker.initialize(options.metadata, options.cartesianTransform)),
      );
      return pool;
    } catch (error) {
      pool.destroy();
      throw error;
    }
  }

  /**
   * Decodes one compressed node on the least busy worker.
   *
   * The caller loses ownership of `node.bytes`: its buffer is transferred to the
   * worker and must not be read afterwards. Aborting through `signal` rejects with
   * the signal reason and tells the worker to stop, but a decode that has already
   * finished still posts its result back to the pool, which drops it. Cancellation is
   * therefore best effort.
   */
  async decodeNode(
    node: CompressedPointCloudNode,
    dimensions: readonly string[],
    signal?: AbortSignal,
  ): Promise<PointCloudNode> {
    if (this.#destroyed) throw new Error("Decoder worker pool has been destroyed");
    const worker = this.#workers.reduce((best, candidate) =>
      candidate.active < best.active ? candidate : best,
    );
    const result = await worker.decodeNode(node, dimensions, signal);
    this.#decodedNodes += result.statistics.decodedNodes;
    this.#decodeMilliseconds += result.statistics.decodeMilliseconds;
    return result.node;
  }

  /**
   * Applies a point filter off the main thread and returns a compacted node.
   *
   * Unlike {@link decodeNode} the input is copied rather than transferred, so the
   * caller keeps its node. That copy is the price of being able to re-filter the same
   * decoded node when the filter changes.
   */
  async filterNode(
    node: PointCloudNode,
    filter: PointCloudNodeFilter | undefined,
    signal?: AbortSignal,
  ): Promise<PointCloudNode> {
    if (this.#destroyed) throw new Error("Decoder worker pool has been destroyed");
    const worker = this.#workers.reduce((best, candidate) =>
      candidate.active < best.active ? candidate : best,
    );
    return worker.filterNode(node, filter, signal);
  }

  /** Totals accumulated across every worker since the pool was created. */
  get statistics(): WorkerStatistics {
    return { decodedNodes: this.#decodedNodes, decodeMilliseconds: this.#decodeMilliseconds };
  }

  /** Terminates every worker and rejects all in-flight work. Safe to call twice. */
  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    for (const worker of this.#workers) worker.destroy();
  }
}

function defaultWorkerFactory(): WorkerLike {
  if (typeof Worker === "undefined")
    throw new Error("Web Workers are not available in this environment");
  return new Worker(new URL("./decoder-worker.js", import.meta.url), { type: "module" });
}

/**
 * Leaves one core for the main thread so decoding never starves rendering, and caps
 * at four so a many-core machine does not spend resident memory on workers the
 * request queue will rarely saturate. Assumes two cores when `navigator` is absent,
 * which is the Node test environment. Override with `workerCount` when profiling
 * shows a different shape.
 */
function defaultWorkerCount(): number {
  const cores = typeof navigator === "undefined" ? 2 : navigator.hardwareConcurrency;
  return Math.max(1, Math.min(4, cores - 1));
}
