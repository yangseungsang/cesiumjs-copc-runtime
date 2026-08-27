import type { Hierarchy } from "copc";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CopcSource } from "./copc-source.js";

const { create, loadHierarchyPage, loadCompressedPointDataBuffer, decompressChunk, createView } =
  vi.hoisted(() => ({
    create: vi.fn(),
    loadHierarchyPage: vi.fn(),
    loadCompressedPointDataBuffer: vi.fn(),
    decompressChunk: vi.fn(),
    createView: vi.fn(),
  }));

vi.mock("copc", () => ({
  Copc: { create, loadHierarchyPage, loadCompressedPointDataBuffer },
  Las: {
    Dimensions: { create: () => ({ X: {}, Y: {}, Z: {}, Intensity: {} }) },
    Extractor: { create: () => ({}) },
    PointData: { decompressChunk },
    View: { create: createView },
  },
}));

const URL_UNDER_TEST = "https://example.test/cloud.copc.laz";
const ROOT_PAGE: Hierarchy.Page = { pageOffset: 100, pageLength: 32 };
const CHILD_PAGE: Hierarchy.Page = { pageOffset: 200, pageLength: 16 };

function node(pointCount: number, pointDataOffset: number): Hierarchy.Node {
  return { pointCount, pointDataOffset, pointDataLength: 64 };
}

function copcStub(overrides: { wkt?: string | undefined } = {}) {
  return {
    header: {
      pointDataRecordFormat: 3,
      pointDataRecordLength: 34,
      scale: [0.01, 0.01, 0.01],
      offset: [0, 0, 0],
      pointCount: 1000,
    },
    info: {
      cube: [0, 0, 0, 100, 100, 100],
      spacing: 10,
      rootHierarchyPage: ROOT_PAGE,
      gpsTimeRange: [1, 2],
    },
    eb: [],
    ...("wkt" in overrides ? { wkt: overrides.wkt } : { wkt: 'PROJCS["test"]' }),
  };
}

/** Serves hierarchy subtrees keyed the way the source keys in-flight page loads. */
function arrangeHierarchy(subtrees: Record<string, Hierarchy.Subtree>): void {
  loadHierarchyPage.mockImplementation(async (_input: unknown, page: Hierarchy.Page) => {
    return subtrees[`${page.pageOffset}:${page.pageLength}`] ?? { nodes: {}, pages: {} };
  });
}

const ROOT_ONLY: Record<string, Hierarchy.Subtree> = {
  "100:32": {
    nodes: {
      "0-0-0-0": node(1000, 1_000),
      "1-0-0-0": node(500, 2_000),
      "1-1-0-0": node(400, 3_000),
    },
    pages: {},
  },
};

const WITH_CHILD_PAGE: Record<string, Hierarchy.Subtree> = {
  "100:32": {
    nodes: { "0-0-0-0": node(1000, 1_000) },
    pages: { "1-0-0-0": CHILD_PAGE, "1-1-0-0": CHILD_PAGE },
  },
  "200:16": {
    nodes: { "1-0-0-0": node(500, 2_000), "2-0-0-0": node(250, 4_000) },
    pages: {},
  },
};

const getterStub = vi.fn(async (begin: number, end: number) =>
  Uint8Array.from({ length: end - begin }, (_, index) => begin + index),
);

async function createSource(subtrees = ROOT_ONLY, overrides: { wkt?: string | undefined } = {}) {
  create.mockResolvedValue(copcStub(overrides));
  arrangeHierarchy(subtrees);
  return CopcSource.fromUrl(URL_UNDER_TEST, { getter: getterStub });
}

beforeEach(() => {
  vi.clearAllMocks();
  loadCompressedPointDataBuffer.mockResolvedValue(new Uint8Array([7, 7, 7]));
});

describe("CopcSource metadata", () => {
  it("maps the COPC header and info onto the source metadata", async () => {
    const source = await createSource();

    await expect(source.metadata()).resolves.toEqual({
      bounds: [0, 0, 0, 100, 100, 100],
      spacing: 10,
      pointCount: 1000,
      pointDataRecordFormat: 3,
      dimensions: ["X", "Y", "Z", "Intensity"],
      crs: 'PROJCS["test"]',
      gpsTimeRange: [1, 2],
    });
    source.destroy();
  });

  it("omits the CRS when the file carries no WKT", async () => {
    const source = await createSource(ROOT_ONLY, { wkt: undefined });

    await expect(source.metadata()).resolves.not.toHaveProperty("crs");
    source.destroy();
  });

  it("exposes only the header fields the decoder needs", async () => {
    const source = await createSource();

    expect(source.decodingMetadata()).toEqual({
      header: {
        pointDataRecordFormat: 3,
        pointDataRecordLength: 34,
        scale: [0.01, 0.01, 0.01],
        offset: [0, 0, 0],
      },
      extraBytes: [],
    });
    source.destroy();
  });

  it("reports zeroed statistics and no diagnostics for an injected getter", async () => {
    const source = await createSource();

    expect(source.statistics).toEqual({
      requests: 0,
      logicalRequests: 0,
      cacheHits: 0,
      persistentCacheHits: 0,
      coalescedRequests: 0,
      bytesReceived: 0,
      networkMilliseconds: 0,
      cachedBytes: 0,
    });
    await expect(source.diagnose()).resolves.toBeUndefined();
    source.destroy();
  });
});

describe("CopcSource hierarchy", () => {
  it("derives node bounds and spacing by octree depth", async () => {
    const source = await createSource();

    await expect(source.root()).resolves.toEqual({
      id: { depth: 0, x: 0, y: 0, z: 0 },
      pointCount: 1000,
      bounds: [0, 0, 0, 100, 100, 100],
      spacing: 10,
    });
    await expect(source.getHierarchy({ depth: 0, x: 0, y: 0, z: 0 })).resolves.toEqual([
      {
        id: { depth: 1, x: 0, y: 0, z: 0 },
        pointCount: 500,
        bounds: [0, 0, 0, 50, 50, 50],
        spacing: 5,
      },
      {
        id: { depth: 1, x: 1, y: 0, z: 0 },
        pointCount: 400,
        bounds: [50, 0, 0, 100, 50, 50],
        spacing: 5,
      },
    ]);
    source.destroy();
  });

  it("follows a hierarchy page placeholder standing in for a child", async () => {
    const source = await createSource(WITH_CHILD_PAGE);

    const children = await source.getHierarchy({ depth: 0, x: 0, y: 0, z: 0 });

    expect(children.map((child) => child.id)).toEqual([{ depth: 1, x: 0, y: 0, z: 0 }]);
    expect(loadHierarchyPage).toHaveBeenCalledWith(expect.anything(), CHILD_PAGE);
    source.destroy();
  });

  it("loads a shared hierarchy page once across placeholders and repeat calls", async () => {
    const source = await createSource(WITH_CHILD_PAGE);
    loadHierarchyPage.mockClear();

    // Both "1-0-0-0" and "1-1-0-0" point at CHILD_PAGE, so one fetch must serve both.
    await source.getHierarchy({ depth: 0, x: 0, y: 0, z: 0 });
    await source.getHierarchy({ depth: 0, x: 0, y: 0, z: 0 });

    expect(loadHierarchyPage).toHaveBeenCalledTimes(1);
    source.destroy();
  });

  it("shares a single in-flight load between concurrent page requests", async () => {
    create.mockResolvedValue(copcStub());
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    loadHierarchyPage.mockImplementation(async (_input: unknown, page: Hierarchy.Page) => {
      if (page.pageOffset === CHILD_PAGE.pageOffset) await gate;
      return WITH_CHILD_PAGE[`${page.pageOffset}:${page.pageLength}`] ?? { nodes: {}, pages: {} };
    });
    const source = await CopcSource.fromUrl(URL_UNDER_TEST, { getter: getterStub });
    loadHierarchyPage.mockClear();

    const root = { depth: 0, x: 0, y: 0, z: 0 } as const;
    const both = Promise.all([source.getHierarchy(root), source.getHierarchy(root)]);
    release?.();
    await both;

    expect(loadHierarchyPage).toHaveBeenCalledTimes(1);
    source.destroy();
  });
});

describe("CopcSource point data", () => {
  it("returns the compressed chunk for a known node", async () => {
    const source = await createSource();

    await expect(source.loadCompressedNode({ depth: 1, x: 0, y: 0, z: 0 })).resolves.toEqual({
      id: { depth: 1, x: 0, y: 0, z: 0 },
      pointCount: 500,
      bytes: new Uint8Array([7, 7, 7]),
    });
    source.destroy();
  });

  it("walks ancestors to discover a node introduced by a deeper page", async () => {
    const source = await createSource(WITH_CHILD_PAGE);

    const compressed = await source.loadCompressedNode({ depth: 2, x: 0, y: 0, z: 0 });

    expect(compressed.pointCount).toBe(250);
    source.destroy();
  });

  it("rejects a node that no hierarchy page describes", async () => {
    const source = await createSource();

    await expect(source.loadCompressedNode({ depth: 3, x: 7, y: 7, z: 7 })).rejects.toThrow(
      "COPC hierarchy node not found: 3-7-7-7",
    );
    source.destroy();
  });

  it("rejects before requesting bytes when the signal is already aborted", async () => {
    const source = await createSource();
    const controller = new AbortController();
    controller.abort(new DOMException("obsolete", "AbortError"));

    await expect(
      source.loadCompressedNode({ depth: 1, x: 0, y: 0, z: 0 }, controller.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(loadCompressedPointDataBuffer).not.toHaveBeenCalled();
    source.destroy();
  });

  it("propagates an abort raised while the injected getter is reading", async () => {
    const source = await createSource();
    const controller = new AbortController();
    loadCompressedPointDataBuffer.mockImplementation(
      async (input: (begin: number, end: number) => Promise<Uint8Array>) => {
        controller.abort(new DOMException("obsolete", "AbortError"));
        return input(0, 4);
      },
    );

    await expect(
      source.loadCompressedNode({ depth: 1, x: 0, y: 0, z: 0 }, controller.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
    source.destroy();
  });

  it("decodes a node through the shared decoding metadata", async () => {
    const source = await createSource();
    decompressChunk.mockResolvedValue(new Uint8Array(16));
    createView.mockReturnValue({
      pointCount: 1,
      dimensions: { X: {}, Y: {}, Z: {}, Intensity: {} },
      getter: (name: string) => () => ({ X: 1, Y: 2, Z: 3, Intensity: 9 })[name] ?? 0,
    });

    const decoded = await source.loadNode({ depth: 1, x: 0, y: 0, z: 0 }, ["Intensity"]);

    expect(decoded.pointCount).toBe(500);
    expect(Array.from(decoded.positions.slice(0, 3))).toEqual([1, 2, 3]);
    expect(decompressChunk).toHaveBeenCalledWith(new Uint8Array([7, 7, 7]), {
      pointCount: 500,
      pointDataRecordFormat: 3,
      pointDataRecordLength: 34,
    });
    source.destroy();
  });
});

describe("CopcSource lifecycle", () => {
  it("rejects use after destroy and tolerates a repeated destroy", async () => {
    const source = await createSource();

    source.destroy();
    source.destroy();

    await expect(source.metadata()).rejects.toThrow("COPC source has been destroyed");
    await expect(source.root()).rejects.toThrow("COPC source has been destroyed");
    expect(() => source.decodingMetadata()).toThrow("COPC source has been destroyed");
  });
});

describe("CopcSource.validateUrl", () => {
  it("stops at the range check when the server ignores byte ranges", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(new Uint8Array(10), { status: 200 }));

    await expect(
      CopcSource.validateUrl(URL_UNDER_TEST, { fetch: fetchMock }),
    ).resolves.toMatchObject({
      supportsRanges: false,
      copcValid: false,
      corsReadable: true,
      error: "Server did not return 206 Partial Content for a byte range request",
    });
    expect(create).not.toHaveBeenCalled();
  });

  it("reports the parse failure when the file is not valid COPC", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(new Uint8Array([0]), {
        status: 206,
        headers: { "Content-Range": "bytes 0-0/1024" },
      }),
    );
    create.mockRejectedValue(new Error("Invalid COPC magic"));

    await expect(
      CopcSource.validateUrl(URL_UNDER_TEST, { fetch: fetchMock }),
    ).resolves.toMatchObject({
      supportsRanges: true,
      copcValid: false,
      error: "Invalid COPC magic",
    });
  });

  it("returns metadata when the file is readable and valid", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(new Uint8Array([0]), {
        status: 206,
        headers: { "Content-Range": "bytes 0-0/1024" },
      }),
    );
    create.mockResolvedValue(copcStub());
    arrangeHierarchy(ROOT_ONLY);

    const diagnostics = await CopcSource.validateUrl(URL_UNDER_TEST, { fetch: fetchMock });

    expect(diagnostics).toMatchObject({
      supportsRanges: true,
      copcValid: true,
      corsReadable: true,
      contentLength: 1024,
    });
    expect(diagnostics.metadata?.pointCount).toBe(1000);
  });
});
