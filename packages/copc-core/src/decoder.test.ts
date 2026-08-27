import { describe, expect, it, vi } from "vitest";
import { decodeCompressedPointNode, type CopcDecodingMetadata } from "./decoder.js";
import type { CompressedPointCloudNode } from "./types.js";

const { decompressChunk, createView } = vi.hoisted(() => ({
  decompressChunk: vi.fn(),
  createView: vi.fn(),
}));

vi.mock("copc", () => ({
  Las: {
    PointData: { decompressChunk },
    View: { create: createView },
  },
}));

type DimensionGetter = (index: number) => number;

const metadata: CopcDecodingMetadata = {
  header: {
    pointDataRecordFormat: 3,
    pointDataRecordLength: 34,
    scale: [0.01, 0.01, 0.01],
    offset: [0, 0, 0],
  },
  extraBytes: [],
};

function compressedNode(pointCount: number): CompressedPointCloudNode {
  return {
    id: { depth: 0, x: 0, y: 0, z: 0 },
    pointCount,
    bytes: new Uint8Array([1, 2, 3, 4]),
  };
}

/** Stands in for the LAS point view produced from a decompressed chunk. */
function viewStub(getters: Record<string, DimensionGetter>) {
  return {
    pointCount: 0,
    dimensions: Object.fromEntries(Object.keys(getters).map((name) => [name, { type: "signed" }])),
    getter(name: string): DimensionGetter {
      const getter = getters[name];
      if (!getter) throw new Error(`Unexpected dimension request: ${name}`);
      return getter;
    },
  };
}

function arrange(getters: Record<string, DimensionGetter>): void {
  decompressChunk.mockReset().mockResolvedValue(new Uint8Array(16));
  createView.mockReset().mockReturnValue(viewStub(getters));
}

describe("decodeCompressedPointNode", () => {
  it("interleaves XYZ and copies only the dimensions the view exposes", async () => {
    arrange({
      X: (index) => index + 1,
      Y: (index) => index + 10,
      Z: (index) => index + 100,
      Intensity: (index) => index * 5,
      Classification: () => 2,
    });

    const node = compressedNode(2);
    const result = await decodeCompressedPointNode(metadata, node, [
      "Intensity",
      "Classification",
      "GpsTime",
    ]);

    expect(decompressChunk).toHaveBeenCalledWith(node.bytes, {
      pointCount: 2,
      pointDataRecordFormat: 3,
      pointDataRecordLength: 34,
    });
    expect(result.id).toBe(node.id);
    expect(result.pointCount).toBe(2);
    expect(Array.from(result.positions)).toEqual([1, 10, 100, 2, 11, 101]);
    expect(result.colors).toBeUndefined();
    // GpsTime was requested but is absent from the view, so it is skipped.
    expect(Object.keys(result.attributes)).toEqual(["Intensity", "Classification"]);
    expect(Array.from(result.attributes.Intensity!)).toEqual([0, 5]);
  });

  it("always requests XYZ without duplicating a caller-supplied dimension", async () => {
    arrange({ X: () => 0, Y: () => 0, Z: () => 0, Intensity: () => 0 });

    await decodeCompressedPointNode(metadata, compressedNode(1), ["X", "Intensity", "Intensity"]);

    expect(createView.mock.calls[0]![3]).toEqual(["X", "Y", "Z", "Intensity"]);
  });

  it("scales 16-bit color channels down to 8-bit", async () => {
    arrange({
      X: () => 0,
      Y: () => 0,
      Z: () => 0,
      Red: (index) => [65_535, 514][index]!,
      Green: () => 257,
      Blue: () => 0,
    });

    const result = await decodeCompressedPointNode(metadata, compressedNode(2), [
      "Red",
      "Green",
      "Blue",
    ]);

    expect(Array.from(result.colors!)).toEqual([255, 1, 0, 2, 1, 0]);
    // Color channels are carried in `colors`, never duplicated into attributes.
    expect(Object.keys(result.attributes)).toEqual([]);
  });

  it("passes 8-bit color channels through unscaled", async () => {
    arrange({
      X: () => 0,
      Y: () => 0,
      Z: () => 0,
      Red: () => 255,
      Green: () => 128,
      Blue: () => 1,
    });

    const result = await decodeCompressedPointNode(metadata, compressedNode(1), [
      "Red",
      "Green",
      "Blue",
    ]);

    expect(Array.from(result.colors!)).toEqual([255, 128, 1]);
  });

  it("omits colors when the view is missing a channel", async () => {
    arrange({ X: () => 0, Y: () => 0, Z: () => 0, Red: () => 10, Green: () => 20 });

    const result = await decodeCompressedPointNode(metadata, compressedNode(1), ["Red", "Green"]);

    expect(result.colors).toBeUndefined();
  });

  it("rejects before decompressing when the signal is already aborted", async () => {
    arrange({ X: () => 0, Y: () => 0, Z: () => 0 });
    const controller = new AbortController();
    controller.abort(new DOMException("obsolete", "AbortError"));

    await expect(
      decodeCompressedPointNode(metadata, compressedNode(1), [], controller.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(decompressChunk).not.toHaveBeenCalled();
  });

  it("rejects when the signal aborts while the chunk is decompressing", async () => {
    arrange({ X: () => 0, Y: () => 0, Z: () => 0 });
    const controller = new AbortController();
    decompressChunk.mockImplementation(async () => {
      controller.abort(new DOMException("obsolete", "AbortError"));
      return new Uint8Array(16);
    });

    await expect(
      decodeCompressedPointNode(metadata, compressedNode(1), [], controller.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(createView).not.toHaveBeenCalled();
  });
});
