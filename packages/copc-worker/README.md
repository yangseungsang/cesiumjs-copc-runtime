# cesiumjs-copc-worker

Browser Worker decoding package for
[CesiumJS COPC Runtime](https://github.com/yangseungsang/cesiumjs-copc-runtime).

Provides a transferable Worker pool for LAZ node decoding, source attribute
preservation, CRS transformation, and node-relative ECEF render coordinates.

Most CesiumJS users should install the main `cesiumjs-copc` package. Bundler and WASM
requirements are documented in the project troubleshooting guide.

Original project code is MIT licensed. See the bundled
[third-party notices](THIRD_PARTY_NOTICES.md).
