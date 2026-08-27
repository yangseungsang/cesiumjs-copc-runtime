import {
  BufferPoint,
  BufferPointCollection,
  BufferPointMaterial,
  Cartesian2,
  Cartesian3,
  Color,
  Intersect,
  JulianDate,
  type Clock,
  type Scene,
} from "cesium";
import { budgetFor, classifyDevice } from "cesiumjs-copc-runtime";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CopcPointCloud, type CopcPointCloudOptions } from "./copc-point-cloud.js";

type FrameState = Parameters<CopcPointCloud["update"]>[0];

const ROOT_BOUNDS = [-122.5, 45, 0, -122.4, 45.1, 100] as const;
const URL_UNDER_TEST = "https://example.test/cloud.copc.laz";

const harness = vi.hoisted(() => ({
  config: {
    crs: "EPSG:4326" as string | undefined,
    /** Node key to point count. Absent keys are treated as missing nodes. */
    nodes: {} as Record<string, number>,
    hierarchyError: undefined as Error | undefined,
    nodeError: undefined as Error | undefined,
  },
  sources: [] as Array<{ destroyed: boolean; hierarchyCalls: string[]; nodeCalls: string[] }>,
  collections: [] as Array<{
    primitives: unknown[];
    show: boolean;
    destroyed: boolean;
    updates: number;
  }>,
  validateUrl: vi.fn(),
}));

vi.mock("cesium", async (importOriginal) => {
  const actual = await importOriginal<typeof import("cesium")>();
  /** Stands in for Cesium's collection so update() never needs a WebGL context. */
  class FakePrimitiveCollection {
    show = true;
    destroyed = false;
    updates = 0;
    readonly primitives: Array<{ destroy(): void }> = [];

    constructor() {
      harness.collections.push(this);
    }

    add(primitive: { destroy(): void }) {
      this.primitives.push(primitive);
      return primitive;
    }

    remove(primitive: { destroy(): void }): boolean {
      const index = this.primitives.indexOf(primitive);
      if (index < 0) return false;
      this.primitives.splice(index, 1);
      // Mirrors destroyPrimitives: true, which the primitive relies on.
      primitive.destroy();
      return true;
    }

    update(): void {
      this.updates += 1;
    }

    destroy(): undefined {
      this.destroyed = true;
      for (const primitive of this.primitives.splice(0)) primitive.destroy();
      return undefined;
    }
  }
  return { ...actual, PrimitiveCollection: FakePrimitiveCollection };
});

vi.mock("cesiumjs-copc-core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("cesiumjs-copc-core")>();
  const { boundsForNode, childNodeIds, formatNodeId, parseNodeId } = actual;

  const entry = (key: string) => ({
    id: parseNodeId(key),
    pointCount: harness.config.nodes[key]!,
    bounds: boundsForNode(ROOT_BOUNDS, parseNodeId(key)),
    spacing: 1 / 2 ** parseNodeId(key).depth,
  });

  class FakeCopcSource {
    destroyed = false;
    readonly hierarchyCalls: string[] = [];
    readonly nodeCalls: string[] = [];

    static async fromUrl(): Promise<FakeCopcSource> {
      const source = new FakeCopcSource();
      harness.sources.push(source);
      return source;
    }

    static validateUrl = harness.validateUrl;

    async metadata() {
      return {
        bounds: ROOT_BOUNDS,
        spacing: 1,
        pointCount: 1000,
        pointDataRecordFormat: 3,
        dimensions: ["X", "Y", "Z", "Red", "Green", "Blue"],
        ...(harness.config.crs === undefined ? {} : { crs: harness.config.crs }),
        gpsTimeRange: [0, 100] as const,
      };
    }

    async root() {
      return entry("0-0-0-0");
    }

    async getHierarchy(id: { depth: number; x: number; y: number; z: number }) {
      this.hierarchyCalls.push(formatNodeId(id));
      if (harness.config.hierarchyError) throw harness.config.hierarchyError;
      return childNodeIds(id)
        .map(formatNodeId)
        .filter((key) => key in harness.config.nodes)
        .map(entry);
    }

    async loadNode(
      id: { depth: number; x: number; y: number; z: number },
      _dimensions?: readonly string[],
      signal?: AbortSignal,
    ) {
      const key = formatNodeId(id);
      this.nodeCalls.push(key);
      signal?.throwIfAborted();
      if (harness.config.nodeError) throw harness.config.nodeError;
      return synthesizeNode(id, harness.config.nodes[key]!, boundsForNode(ROOT_BOUNDS, id));
    }

    async loadCompressedNode(): Promise<never> {
      throw new Error("Worker decoding is disabled in these tests");
    }

    decodingMetadata() {
      return {
        header: {
          pointDataRecordFormat: 3,
          pointDataRecordLength: 34,
          scale: [0.01, 0.01, 0.01],
          offset: [0, 0, 0],
        },
        extraBytes: [],
      };
    }

    get statistics() {
      return {
        requests: 4,
        logicalRequests: 5,
        cacheHits: 1,
        persistentCacheHits: 2,
        coalescedRequests: 3,
        bytesReceived: 2048,
        networkMilliseconds: 12,
        cachedBytes: 512,
      };
    }

    destroy(): void {
      this.destroyed = true;
    }
  }

  return { ...actual, CopcSource: FakeCopcSource };
});

/** Builds a node whose points march diagonally across the node bounds. */
function synthesizeNode(
  id: { depth: number; x: number; y: number; z: number },
  pointCount: number,
  bounds: readonly [number, number, number, number, number, number],
) {
  const positions = new Float64Array(pointCount * 3);
  const colors = new Uint8Array(pointCount * 3);
  const Classification = new Uint8Array(pointCount);
  const Intensity = new Uint16Array(pointCount);
  const GpsTime = new Float64Array(pointCount);
  for (let i = 0; i < pointCount; i += 1) {
    const t = pointCount === 1 ? 0 : i / (pointCount - 1);
    positions[i * 3] = bounds[0] + (bounds[3] - bounds[0]) * t;
    positions[i * 3 + 1] = bounds[1] + (bounds[4] - bounds[1]) * t;
    positions[i * 3 + 2] = bounds[2] + (bounds[5] - bounds[2]) * t;
    colors[i * 3] = 10;
    colors[i * 3 + 1] = 20;
    colors[i * 3 + 2] = 30;
    Classification[i] = i % 2 === 0 ? 2 : 6;
    Intensity[i] = i % 2 === 0 ? 0 : 65_535;
    GpsTime[i] = i;
  }
  return { id, pointCount, positions, colors, attributes: { Classification, Intensity, GpsTime } };
}

function frameStateStub(overrides: { visibility?: Intersect; viewportHeight?: number } = {}) {
  const center = Cartesian3.fromDegrees(-122.45, 45.05, 50);
  const positionWC = Cartesian3.fromDegrees(-122.45, 45.05, 5_000);
  const directionWC = Cartesian3.normalize(
    Cartesian3.subtract(center, positionWC, new Cartesian3()),
    new Cartesian3(),
  );
  return {
    camera: { directionWC, positionWC, frustum: { fovy: Math.PI / 3 } },
    context: { drawingBufferHeight: overrides.viewportHeight ?? 1080 },
    cullingVolume: {
      computeVisibility: () => overrides.visibility ?? Intersect.INTERSECTING,
    },
  } satisfies FrameState;
}

function clockStub(start: JulianDate) {
  const listeners = new Set<() => void>();
  const clock = {
    currentTime: start,
    onTick: {
      addEventListener(listener: () => void) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
  };
  return {
    clock: clock as unknown as Clock,
    listenerCount: () => listeners.size,
    advanceTo(time: JulianDate) {
      clock.currentTime = time;
      for (const listener of listeners) listener();
    },
  };
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function createCloud(options: CopcPointCloudOptions = {}): Promise<CopcPointCloud> {
  return CopcPointCloud.fromUrl(URL_UNDER_TEST, {
    useWorkers: false,
    uploadTimeBudgetMilliseconds: 1_000,
    maximumScreenSpaceError: 1e9,
    pointBudget: 1_000_000,
    sourceCrs: "EPSG:4326",
    ...options,
  });
}

/** Drives frames until every queued load and GPU build has drained. */
async function renderUntilStable(
  cloud: CopcPointCloud,
  frameState: FrameState,
  frames = 10,
): Promise<void> {
  for (let index = 0; index < frames; index += 1) {
    await flush();
    cloud.update(frameState);
    if (cloud.statistics.loadingNodes === 0 && cloud.statistics.buildingNodes === 0) break;
  }
  await flush();
  cloud.update(frameState);
}

function renderedCollections(): BufferPointCollection[] {
  return (harness.collections.at(-1)?.primitives ?? []) as BufferPointCollection[];
}

function materialAt(collection: BufferPointCollection, index: number): BufferPointMaterial {
  const point = new BufferPoint();
  const material = new BufferPointMaterial();
  collection.get(index, point);
  point.getMaterial(material);
  return material;
}

beforeEach(() => {
  harness.config.crs = "EPSG:4326";
  harness.config.nodes = { "0-0-0-0": 8 };
  harness.config.hierarchyError = undefined;
  harness.config.nodeError = undefined;
  harness.sources.length = 0;
  harness.collections.length = 0;
  harness.validateUrl.mockReset().mockResolvedValue({ copcValid: true });
});

describe("CopcPointCloud construction", () => {
  it("falls back to the device budget when no limits are supplied", async () => {
    const budget = budgetFor(classifyDevice());
    const cloud = await CopcPointCloud.fromUrl(URL_UNDER_TEST, {
      useWorkers: false,
      sourceCrs: "EPSG:4326",
    });

    expect(cloud.deviceTier).toBe(classifyDevice());
    expect(cloud.pointBudget).toBe(budget.pointBudget);
    expect(cloud.maximumScreenSpaceError).toBe(budget.maximumScreenSpaceError);
    expect(cloud.pointSize).toBe(2);
    expect(cloud.opacity).toBe(1);
    expect(cloud.colorBy).toBe("rgb");
    cloud.destroy();
  });

  it("rejects out-of-range construction options", async () => {
    await expect(createCloud({ opacity: 1.5 })).rejects.toThrow(RangeError);
    await expect(createCloud({ outlineWidth: -1 })).rejects.toThrow(RangeError);
    await expect(createCloud({ minimumRefinementCoverage: 2 })).rejects.toThrow(RangeError);
    await expect(createCloud({ uploadTimeBudgetMilliseconds: Number.NaN })).rejects.toThrow(
      RangeError,
    );
  });

  it("requires a CRS and releases the source when none is available", async () => {
    harness.config.crs = undefined;

    await expect(CopcPointCloud.fromUrl(URL_UNDER_TEST, { useWorkers: false })).rejects.toThrow(
      "COPC CRS is missing",
    );
    expect(harness.sources[0]?.destroyed).toBe(true);
  });

  it("delegates URL validation to the source", async () => {
    const headers = { Authorization: "Bearer test" };

    await CopcPointCloud.validateUrl(URL_UNDER_TEST, { headers });

    expect(harness.validateUrl).toHaveBeenCalledWith(URL_UNDER_TEST, { headers });
  });

  it("validates mutable render properties", async () => {
    const cloud = await createCloud();

    expect(() => (cloud.pointSize = 0)).toThrow(RangeError);
    expect(() => (cloud.pointSize = Number.POSITIVE_INFINITY)).toThrow(RangeError);
    expect(() => (cloud.opacity = -0.1)).toThrow(RangeError);
    expect(() => (cloud.outlineWidth = -2)).toThrow(RangeError);

    cloud.pointSize = 4;
    expect(cloud.pointSize).toBe(4);
    cloud.outlineColor = Color.RED;
    expect(cloud.outlineColor.toCssColorString()).toBe("rgb(255,0,0)");
    cloud.destroy();
  });
});

describe("CopcPointCloud update loop", () => {
  it("renders the root node and reports it in statistics", async () => {
    const cloud = await createCloud();
    const frameState = frameStateStub();

    await renderUntilStable(cloud, frameState);

    expect(cloud.statistics.loadedNodes).toBe(1);
    expect(cloud.statistics.visibleNodes).toBe(1);
    expect(cloud.statistics.visiblePoints).toBe(8);
    expect(cloud.statistics.decodedNodes).toBe(1);
    expect(cloud.statistics.gpuBytes).toBeGreaterThan(0);
    expect(renderedCollections()).toHaveLength(1);
    cloud.destroy();
  });

  it("passes through source network counters", async () => {
    const cloud = await createCloud();

    expect(cloud.statistics).toMatchObject({
      networkRequests: 4,
      logicalRangeRequests: 5,
      rangeCacheHits: 1,
      persistentRangeCacheHits: 2,
      coalescedRangeRequests: 3,
      networkBytes: 2048,
      networkMilliseconds: 12,
      compressedCacheBytes: 512,
    });
    cloud.destroy();
  });

  it("skips selection work entirely while hidden", async () => {
    const cloud = await createCloud();
    const frameState = frameStateStub();
    await renderUntilStable(cloud, frameState);

    cloud.show = false;
    cloud.update(frameState);

    expect(harness.collections.at(-1)?.show).toBe(false);
    // Visible counters keep their last value because selection never ran.
    expect(cloud.statistics.visibleNodes).toBe(1);
    cloud.destroy();
  });

  it("keeps the prefetched root hidden while it is outside the culling volume", async () => {
    const cloud = await createCloud();

    await renderUntilStable(cloud, frameStateStub({ visibility: Intersect.OUTSIDE }));

    // The root is fetched eagerly at construction, so it is resident but unselected.
    expect(cloud.statistics.loadedNodes).toBe(1);
    expect(cloud.statistics.visibleNodes).toBe(0);
    expect(cloud.statistics.visiblePoints).toBe(0);
    expect(renderedCollections()[0]?.show).toBe(false);
    cloud.destroy();
  });

  it("requests hierarchy for a selected leaf whose children are unknown", async () => {
    harness.config.nodes = { "0-0-0-0": 8, "1-0-0-0": 4 };
    const cloud = await createCloud({
      maximumScreenSpaceError: 0.000_1,
      minimumRefinementCoverage: 0,
    });

    await renderUntilStable(cloud, frameStateStub());

    // Refining into "1-0-0-0" exposes a leaf with no cached children.
    expect(harness.sources[0]?.hierarchyCalls).toContain("1-0-0-0");
    cloud.destroy();
  });

  it("refines into children once their hierarchy is known", async () => {
    harness.config.nodes = { "0-0-0-0": 8, "1-0-0-0": 4, "1-1-1-1": 4 };
    const cloud = await createCloud({
      maximumScreenSpaceError: 0.000_1,
      minimumRefinementCoverage: 0,
    });

    await renderUntilStable(cloud, frameStateStub(), 16);

    expect(harness.sources[0]?.nodeCalls).toEqual(
      expect.arrayContaining(["0-0-0-0", "1-0-0-0", "1-1-1-1"]),
    );
    expect(cloud.statistics.loadedNodes).toBe(3);
    cloud.destroy();
  });

  it("spreads a large GPU build across frames within the upload budget", async () => {
    harness.config.nodes = { "0-0-0-0": 600 };
    const cloud = await createCloud({ uploadTimeBudgetMilliseconds: 0 });
    const frameState = frameStateStub();

    await flush();
    cloud.update(frameState);
    expect(cloud.statistics.buildingNodes).toBe(1);
    expect(cloud.statistics.loadedNodes).toBe(0);

    await renderUntilStable(cloud, frameState);
    expect(cloud.statistics.buildingNodes).toBe(0);
    expect(cloud.statistics.loadedNodes).toBe(1);
    expect(cloud.statistics.mainThreadBuildMilliseconds).toBeGreaterThanOrEqual(0);
    cloud.destroy();
  });

  it("derives the bounding sphere from the root bounds and caches it", async () => {
    const cloud = await createCloud();

    const sphere = cloud.boundingSphere;

    expect(cloud.boundingSphere).toBe(sphere);
    expect(sphere.radius).toBeGreaterThan(0);
    const center = Cartesian3.fromDegrees(-122.45, 45.05, 50);
    expect(Cartesian3.distance(sphere.center, center)).toBeLessThan(sphere.radius);
    cloud.destroy();
  });

  it("records a node load failure without rejecting the frame", async () => {
    harness.config.nodeError = new Error("decode failed");
    const cloud = await createCloud();

    await renderUntilStable(cloud, frameStateStub());

    expect(cloud.lastError).toBe(harness.config.nodeError);
    expect(cloud.statistics.loadedNodes).toBe(0);
    cloud.destroy();
  });
});

describe("CopcPointCloud appearance", () => {
  it("colors points by classification", async () => {
    const cloud = await createCloud();
    const frameState = frameStateStub();
    await renderUntilStable(cloud, frameState);

    cloud.colorBy = "classification";

    const collection = renderedCollections()[0]!;
    expect(cloud.colorBy).toBe("classification");
    expect(materialAt(collection, 0).color.toCssColorString()).toBe("rgb(121,85,72)");
    expect(materialAt(collection, 1).color.toCssColorString()).toBe("rgb(244,67,54)");
    cloud.destroy();
  });

  it("colors points by intensity across the 16-bit range", async () => {
    const cloud = await createCloud();
    await renderUntilStable(cloud, frameStateStub());

    cloud.colorBy = "intensity";

    const collection = renderedCollections()[0]!;
    const low = materialAt(collection, 0).color;
    const high = materialAt(collection, 1).color;
    expect(low.toCssColorString()).not.toBe(high.toCssColorString());
    cloud.destroy();
  });

  it("uses the decoded RGB channels by default", async () => {
    const cloud = await createCloud();
    await renderUntilStable(cloud, frameStateStub());

    expect(materialAt(renderedCollections()[0]!, 0).color.toCssColorString()).toBe("rgb(10,20,30)");
    cloud.destroy();
  });

  it("multiplies point alpha by the configured opacity", async () => {
    const cloud = await createCloud();
    await renderUntilStable(cloud, frameStateStub());

    cloud.opacity = 0.5;

    expect(cloud.opacity).toBe(0.5);
    expect(materialAt(renderedCollections()[0]!, 0).color.alpha).toBeCloseTo(0.5, 2);
    cloud.destroy();
  });

  it("applies outline settings to every rendered point", async () => {
    const cloud = await createCloud();
    await renderUntilStable(cloud, frameStateStub());

    cloud.outlineWidth = 3;
    cloud.outlineColor = Color.BLUE;

    const material = materialAt(renderedCollections()[0]!, 0);
    expect(material.outlineWidth).toBe(3);
    expect(material.outlineColor.toCssColorString()).toBe("rgb(0,0,255)");
    cloud.destroy();
  });
});

describe("CopcPointCloud filtering", () => {
  it("rebuilds rendered nodes with only the points the filter accepts", async () => {
    const cloud = await createCloud();
    const frameState = frameStateStub();
    await renderUntilStable(cloud, frameState);
    expect(cloud.statistics.visiblePoints).toBe(8);

    cloud.filter = { classifications: [2] };
    await renderUntilStable(cloud, frameState, 16);

    expect(cloud.filter).toEqual({ classifications: [2] });
    expect(cloud.statistics.visiblePoints).toBe(4);
    cloud.destroy();
  });

  it("reuses the retained source data instead of refetching on filter changes", async () => {
    const cloud = await createCloud();
    const frameState = frameStateStub();
    await renderUntilStable(cloud, frameState);
    const loadsBefore = harness.sources[0]!.nodeCalls.length;

    cloud.filter = { intensity: [1, 65_535] };
    await renderUntilStable(cloud, frameState, 16);

    expect(harness.sources[0]!.nodeCalls).toHaveLength(loadsBefore);
    expect(cloud.statistics.visiblePoints).toBe(4);
    cloud.destroy();
  });

  it("returns to the full point set when the filter is cleared", async () => {
    const cloud = await createCloud();
    const frameState = frameStateStub();
    await renderUntilStable(cloud, frameState);

    cloud.filter = { classifications: [2] };
    await renderUntilStable(cloud, frameState, 16);
    cloud.filter = undefined;
    await renderUntilStable(cloud, frameState, 16);

    expect(cloud.statistics.visiblePoints).toBe(8);
    cloud.destroy();
  });
});

describe("CopcPointCloud picking", () => {
  it("resolves a picked point to geographic coordinates and attributes", async () => {
    const cloud = await createCloud({ allowPicking: true });
    await renderUntilStable(cloud, frameStateStub());
    const collection = renderedCollections()[0]!;
    const scene = { pick: () => ({ collection, index: 1 }) } as unknown as Scene;

    const picked = cloud.pick(scene, new Cartesian2(10, 10));

    expect(picked?.node).toBe("0-0-0-0");
    expect(picked?.index).toBe(1);
    expect(picked?.longitude).toBeCloseTo(-122.5 + 0.1 / 7, 6);
    expect(picked?.latitude).toBeCloseTo(45 + 0.1 / 7, 6);
    expect(picked?.height).toBeCloseTo(100 / 7, 3);
    expect(picked?.attributes).toEqual({ Classification: 6, Intensity: 65_535, GpsTime: 1 });
    cloud.destroy();
  });

  it("ignores picks that do not land on a rendered collection", async () => {
    const cloud = await createCloud();
    await renderUntilStable(cloud, frameStateStub());
    const position = new Cartesian2(10, 10);
    const foreign = renderedCollections()[0];

    expect(cloud.pick({ pick: () => undefined } as unknown as Scene, position)).toBeUndefined();
    expect(
      cloud.pick({ pick: () => ({ collection: foreign }) } as unknown as Scene, position),
    ).toBeUndefined();
    expect(
      cloud.pick(
        { pick: () => ({ collection: {}, index: 0 }) as never } as unknown as Scene,
        position,
      ),
    ).toBeUndefined();
    expect(
      cloud.pick(
        { pick: () => ({ collection: foreign, index: 99 }) } as unknown as Scene,
        position,
      ),
    ).toBeUndefined();
    cloud.destroy();
  });
});

describe("CopcPointCloud clock binding", () => {
  const start = JulianDate.fromIso8601("2024-01-01T00:00:00Z");
  const stop = JulianDate.fromIso8601("2024-01-01T01:00:00Z");

  it("rejects ranges that do not increase", async () => {
    const cloud = await createCloud();
    const { clock } = clockStub(start);

    expect(() =>
      cloud.bindClock(clock, { start: stop, stop: start, gpsStart: 0, gpsStop: 1 }),
    ).toThrow(RangeError);
    expect(() => cloud.bindClock(clock, { start, stop, gpsStart: 5, gpsStop: 5 })).toThrow(
      RangeError,
    );
    expect(() =>
      cloud.bindClock(clock, { start, stop, gpsStart: 0, gpsStop: 1, window: 0 }),
    ).toThrow(RangeError);
    expect(() =>
      cloud.bindClock(clock, { start, stop, gpsStart: 0, gpsStop: 1, steps: 1.5 }),
    ).toThrow(RangeError);
    cloud.destroy();
  });

  it("drives a GPS time filter from the clock and detaches on unsubscribe", async () => {
    const cloud = await createCloud();
    const stub = clockStub(start);

    const unsubscribe = cloud.bindClock(stub.clock, { start, stop, gpsStart: 0, gpsStop: 100 });

    expect(stub.listenerCount()).toBe(1);
    expect(cloud.filter).toEqual({ gpsTime: [0, 0] });

    stub.advanceTo(JulianDate.addSeconds(start, 1800, new JulianDate()));
    expect(cloud.filter).toEqual({ gpsTime: [0, 50] });

    unsubscribe();
    expect(stub.listenerCount()).toBe(0);
    cloud.destroy();
  });

  it("keeps a trailing window when one is configured", async () => {
    const cloud = await createCloud();
    const stub = clockStub(start);

    cloud.bindClock(stub.clock, { start, stop, gpsStart: 0, gpsStop: 100, window: 10 });
    stub.advanceTo(JulianDate.addSeconds(start, 1800, new JulianDate()));

    expect(cloud.filter).toEqual({ gpsTime: [40, 50] });
    cloud.destroy();
  });

  it("replaces a previous binding when the clock is bound again", async () => {
    const cloud = await createCloud();
    const first = clockStub(start);
    const second = clockStub(start);

    cloud.bindClock(first.clock, { start, stop, gpsStart: 0, gpsStop: 100 });
    cloud.bindClock(second.clock, { start, stop, gpsStart: 0, gpsStop: 100 });

    expect(first.listenerCount()).toBe(0);
    expect(second.listenerCount()).toBe(1);
    cloud.destroy();
  });
});

describe("CopcPointCloud detail focus", () => {
  it("rejects a degenerate focus direction", async () => {
    const cloud = await createCloud();

    expect(() => cloud.setDetailFocus(new Cartesian3(0, 0, 0))).toThrow(RangeError);
    expect(() => cloud.setDetailFocus(new Cartesian3(Number.NaN, 0, 1))).toThrow(RangeError);
    cloud.destroy();
  });

  it("accepts a direction and clears it again", async () => {
    const cloud = await createCloud();
    const frameState = frameStateStub();

    cloud.setDetailFocus(new Cartesian3(0, 0, 10));
    await renderUntilStable(cloud, frameState);
    expect(cloud.statistics.loadedNodes).toBe(1);

    cloud.setDetailFocus(undefined);
    cloud.update(frameState);
    expect(cloud.statistics.visibleNodes).toBe(1);
    cloud.destroy();
  });
});

describe("CopcPointCloud lifecycle", () => {
  it("releases every owned resource exactly once", async () => {
    const cloud = await createCloud();
    await renderUntilStable(cloud, frameStateStub());

    expect(cloud.isDestroyed()).toBe(false);
    expect(cloud.destroy()).toBeUndefined();
    expect(cloud.destroy()).toBeUndefined();

    expect(cloud.isDestroyed()).toBe(true);
    expect(harness.sources[0]?.destroyed).toBe(true);
    expect(harness.collections.at(-1)?.destroyed).toBe(true);
    expect(cloud.statistics.loadedNodes).toBe(0);
  });

  it("refuses further work after destruction", async () => {
    const cloud = await createCloud();
    const frameState = frameStateStub();
    cloud.destroy();

    expect(() => cloud.update(frameState)).toThrow("CopcPointCloud has been destroyed");
    expect(() => cloud.setDetailFocus(new Cartesian3(0, 0, 1))).toThrow(
      "CopcPointCloud has been destroyed",
    );
    expect(() =>
      cloud.pick({ pick: () => undefined } as unknown as Scene, new Cartesian2()),
    ).toThrow("CopcPointCloud has been destroyed");
  });
});
