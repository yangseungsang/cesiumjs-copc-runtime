# Troubleshooting

## The URL fails validation

Confirm the server returns `206 Partial Content` for a request with a `Range` header
and exposes the required headers through CORS. Redirects must preserve range behavior.
Object-storage website endpoints and download pages may return `200` HTML instead of
the COPC bytes.

## The cloud appears in the wrong location

- inspect the embedded horizontal CRS;
- provide `sourceCrs` if WKT is absent;
- check whether coordinates use metres or feet;
- verify legacy Korean Bessel grids against a known control point;
- do not use a geoid correction unless the source vertical reference is known.

## Heights do not match terrain

Cesium's WGS84 ellipsoid and a terrain surface are different references. The demo
reports ellipsoid height, sampled surface height, and their difference. Use explicit
EGM96 correction only for data known to contain EGM96 orthometric heights.

## Workers or LAZ decode fail

Build the workspace before starting the source demo. A consuming bundler must serve
the Worker module and `laz-perf.wasm`. Check Content Security Policy, MIME types, and
worker URL rewriting. Use `useWorkers: false` only as a diagnostic fallback.

## LAZ decode aborts on the WebAssembly magic word

```text
Aborted(CompileError: WebAssembly.instantiate(): expected magic word 00 61 73 6d, found 3c 21 44 4f @+0)
```

`3c 21 44 4f` is `<!DO`, so the server answered the WASM request with an HTML document,
usually a 404 page or an SPA fallback. Open the Network tab and compare the requested
`laz-perf.wasm` URL with the path the app is served from. A root-absolute URL under a
subpath deployment is the usual cause. See
[Serve the laz-perf WASM](getting-started.md#serve-the-laz-perf-wasm) for the bundler
configuration that keeps the URL aligned with the deployment base.

## Memory continues to grow

Check point budget, compressed cache, decoded cache, persistent cache, and selected
dimensions separately. RGB, GPS time, and other attributes add CPU memory even when
they are not currently used for coloring. Destroy layers that are no longer needed.

## Detail looks patchy while loading

COPC uses additive refinement. Parent nodes remain visible while child cohorts load.
Raise `minimumRefinementCoverage` to require more child coverage before revealing a
detail cohort, or reduce point budget/SSE pressure on constrained devices.

## A signed URL changes

IndexedDB uses a cache key plus exact byte range. Set a stable `range.cacheKey` for
rotating signatures, and change the key when the underlying object changes.

## Reporting an issue

Use the structured bug or performance form and include validation output, public
dataset URL when possible, CRS, runtime configuration, environment, and benchmark
JSON. Remove tokens and private dataset details.
