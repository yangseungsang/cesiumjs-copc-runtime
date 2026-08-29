# cesiumjs-copc-runtime

Camera-independent runtime scheduling for
[CesiumJS COPC Runtime](https://github.com/yangseungsang/cesiumjs-copc-runtime).

Provides screen-space-error selection, additive ready-cohort resolution, prioritized
request queues, device-tier defaults, point budgets, and a byte-sized LRU cache.

Most CesiumJS users should install the main `cesiumjs-copc` package. Use this package
directly when building another COPC rendering integration.

Original project code is MIT licensed. See the bundled
[third-party notices](THIRD_PARTY_NOTICES.md).
