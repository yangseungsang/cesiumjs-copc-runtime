import type {
  CompressedPointCloudNode,
  CartesianTransformDefinition,
  CopcDecodingMetadata,
  PointCloudNodeFilter,
  PointCloudNode,
} from "cesiumjs-copc-core";

/**
 * Message contract between the worker pool on the main thread and the decoder worker.
 *
 * Every request carries an `id` that the matching response echoes back, because a
 * single worker interleaves several in-flight jobs and `postMessage` gives no other
 * way to pair a reply with its request. Ids are allocated per worker rather than
 * globally, so two workers can be handling id 3 at the same time.
 *
 * Buffer ownership is asymmetric and easy to get wrong:
 *
 * - a `load` request transfers the compressed bytes, so the main thread must not read
 *   `node.bytes` after posting;
 * - a `filter` request does not transfer, so the decoded node is structure-cloned and
 *   both sides keep a usable copy;
 * - every response transfers the result buffers back, so the worker must not touch a
 *   node it has replied with.
 */

/** Decode work reported alongside a single successful response. */
export interface WorkerStatistics {
  /**
   * Nodes decoded while serving this one request, which is `1` for a successful
   * `load`. The pool accumulates these into a running total.
   */
  readonly decodedNodes: number;
  /**
   * Milliseconds spent decoding and applying the CRS transform. Time the request
   * spent queued before the worker picked it up is not included.
   */
  readonly decodeMilliseconds: number;
}

/**
 * Request sent from the pool to a worker.
 *
 * `initialize` must arrive before any `load`. The decoder needs the header scale and
 * offset to turn raw point records into coordinates, and rejects a `load` that
 * arrives first. The pool enforces the ordering by awaiting initialization for every
 * worker before it hands the pool to callers.
 */
export type DecoderWorkerRequest =
  | {
      readonly type: "initialize";
      readonly id: number;
      /** Header-derived scale, offset, and point record layout for this COPC file. */
      readonly metadata: CopcDecodingMetadata;
      /**
       * CRS transform applied inside the worker so the main thread never blocks on
       * projection work. Omitted when the source needs no transform, in which case
       * responses carry no `cartesian` positions.
       */
      readonly cartesianTransform?: CartesianTransformDefinition;
    }
  | {
      readonly type: "load";
      readonly id: number;
      /** Compressed LAZ chunk. Its backing buffer is transferred, not copied. */
      readonly node: CompressedPointCloudNode;
      /** Dimensions to materialize. Anything not listed is skipped while decoding. */
      readonly dimensions: readonly string[];
    }
  | {
      readonly type: "filter";
      readonly id: number;
      /** Already-decoded node. Copied rather than transferred, unlike `load`. */
      readonly node: PointCloudNode;
      /** Omitting the filter asks the worker to return the node unfiltered. */
      readonly filter?: PointCloudNodeFilter;
    }
  /**
   * Abandons one in-flight job. The worker may already have finished and replied, so
   * the pool has to tolerate a `success` arriving for an id it has cancelled.
   */
  | { readonly type: "cancel"; readonly id: number }
  /** Final message. The worker aborts everything in flight and closes itself. */
  | { readonly type: "destroy"; readonly id: number };

/**
 * Response sent from a worker back to the pool.
 *
 * Errors are flattened into plain fields rather than posted as `Error` instances,
 * because structured clone drops the prototype and any custom properties. The pool
 * rebuilds an `Error` from these fields so that `name` still distinguishes an
 * `AbortError` from a real failure.
 */
export type DecoderWorkerResponse =
  | {
      readonly type: "success";
      readonly id: number;
      /** Absent for requests that produce no node, such as `initialize`. */
      readonly node?: PointCloudNode;
      /** Present only for `load`. */
      readonly statistics?: WorkerStatistics;
    }
  | {
      readonly type: "error";
      readonly id: number;
      readonly error: { readonly name: string; readonly message: string; readonly stack?: string };
    };
