# Getting started

This guide opens the demo, validates a remote COPC source, and creates a point-cloud
primitive from application code.

## Requirements

- Node.js 20 or newer
- npm 10 or newer
- a WebGL-capable browser
- a COPC server that allows CORS and HTTP byte-range requests

## Run the demo

```sh
git clone https://github.com/yangseungsang/cesiumjs-copc-runtime.git
cd cesiumjs-copc-runtime
npm ci
npm run build
npm run demo
```

The demo starts with the public Autzen Stadium dataset. Paste another `.copc.laz`
URL and select **Load** to inspect it. The diagnostics panel reports visible points,
node counts, network bytes, physical and logical ranges, cache hits, decode/build
time, FPS, and time to first point.

## Serve the laz-perf WASM

LAZ chunks are decoded by `laz-perf`, which fetches `laz-perf.wasm` at runtime. The
decoder runs inside the decode Worker and on the main thread when Workers are
unavailable, so the URL has to resolve in both contexts. Let the bundler own that URL
rather than hardcoding one. A root-absolute literal such as `/laz-perf.wasm` ignores
the deployment base and requests the domain root, which returns the 404 page of any
app served from a subpath.

With Vite, import the asset and hand it to `locateFile`:

```ts
import { createLazPerf } from "laz-perf/lib/web/index.js";
import lazPerfWasmUrl from "laz-perf/lib/worker/laz-perf.wasm?url";

const lazPerf = await createLazPerf({
  locateFile: (path: string, prefix: string) =>
    path.endsWith(".wasm") ? lazPerfWasmUrl : `${prefix}${path}`,
});
```

`?url` makes Vite emit the file and rewrite the URL with the configured `base`, so the
same source works when the app is served from `/` and from `/my-app/`. Webpack and
Rollup reach the same result through asset modules and
`new URL("laz-perf/lib/worker/laz-perf.wasm", import.meta.url)`.
`apps/demo/src/laz-perf-worker.ts` is a working example.

When the WASM is copied into the output directory by hand instead, prefix the URL with
the deployment base at runtime, for example `` `${import.meta.env.BASE_URL}laz-perf.wasm` ``.

## Validate a source

Call `CopcPointCloud.validateUrl(url)` before creating a layer. Validation checks:

- response size and HTTP `206 Partial Content` support;
- COPC header and info metadata;
- available LAS dimensions;
- embedded CRS WKT.

A signed URL may change while cached. Provide a stable `range.cacheKey` when the URL
contains rotating credentials or can return different content.

## Create a layer

```ts
import { Viewer } from "cesium";
import { CopcPointCloud } from "cesiumjs-copc";

const viewer = new Viewer("cesiumContainer");
const cloud = await CopcPointCloud.fromUrl(url, {
  maximumScreenSpaceError: 2,
  pointBudget: 2_000_000,
  cacheSize: 512 * 1024 * 1024,
  decodedCacheSize: 768 * 1024 * 1024,
  colorBy: "rgb",
  dimensions: ["Red", "Green", "Blue", "Intensity", "Classification"],
});

viewer.scene.primitives.add(cloud);
```

`maximumScreenSpaceError` controls refinement: lower values request more detail.
`pointBudget` limits the selected points. Defaults adapt to the detected low, medium,
or high device tier, and every budget remains overridable.

## Clean up

Remove the primitive and call `destroy()` when a layer is no longer needed. Destroying
the source cancels queued work, terminates owned Workers, and releases GPU resources.

## Next steps

- [Architecture](architecture.md)
- [API reference](api-reference.md)
- [Coordinate systems](coordinate-systems.md)
- [Troubleshooting](troubleshooting.md)
- [Development](development.md)
