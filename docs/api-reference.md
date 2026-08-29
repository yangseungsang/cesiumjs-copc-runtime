# API reference

This page is a navigation reference for the current public surface. TypeScript
declarations shipped with each package remain the source of truth.

## `cesiumjs-copc`

- `CopcPointCloud`: asynchronous layer creation, Cesium primitive lifecycle, runtime
  visual options, picking, diagnostics, and clock binding
- `CopcEyeDomeLighting`: scene-depth post-process control
- coordinate transforms and registered EPSG definitions
- point filter helpers and public option/result types

## `cesiumjs-copc-core`

- `CopcSource`: metadata, hierarchy traversal, node loading, and statistics
- range readers, memory/persistent range cache options, and URL validation support
- node ID parse/format helpers
- decode metadata, point-node types, and attribute filters

## `cesiumjs-copc-runtime`

- screen-space-error and LOD selection helpers
- additive ready-cohort resolution
- prioritized request queue
- byte-sized LRU cache
- device tier detection and default budgets

## `cesiumjs-copc-worker`

- `CopcDecodeWorkerPool`
- ECEF render-position helpers
- Worker request, response, and transferable protocol types

## `cesiumjs-copc-analysis`

- `queryBounds`: asynchronous source-CRS bounds query
- `computeStatistics`: streamed attribute and extent aggregation
- `computeHeightProfile`: corridor query and profile bins

## Stability

The project is currently `0.1.2`. Public APIs may change before `1.0.0`, but changes
should be documented in the changelog and release notes. Cesium's buffer point API is
experimental and may require compatibility updates across CesiumJS versions.
