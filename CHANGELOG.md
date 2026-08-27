# Changelog

All notable changes to this project will be documented here. The project follows
semantic versioning once public packages are released.

## [Unreleased]

### Added

- Open-source contribution, support, governance, and security policies.
- Structured issue and pull-request templates.

## [0.1.1] - 2026-08-27

### Fixed

- `cesiumjs-copc` declared `cesium` as a runtime dependency, so a consumer that
  already had a different CesiumJS version installed received a second nested copy.
  Beyond roughly 143 MiB of duplicated install, two Cesium module instances break the
  type identity that passing objects between the viewer and this runtime depends on.
  CesiumJS is now a peer dependency.

### Changed

- Installing `cesiumjs-copc` now requires installing `cesium` alongside it. Packages
  that do not render, such as `cesiumjs-copc-core` and `cesiumjs-copc-analysis`, are
  unaffected and still need no CesiumJS.

## [0.1.0] - 2026-08-27

### Added

- HTTP byte-range COPC loading with range coalescing and three-stage caching.
- Camera-driven additive LOD, adaptive point budgets, and prioritized requests.
- Worker-based LAZ decoding and node-relative ECEF render coordinates.
- CesiumJS rendering, picking, filtering, eye-dome lighting, and GPS time binding.
- Source-CRS spatial queries, statistics, and height profiles.
- Korean EPSG definitions and explicit EGM96 vertical correction.
- Remote COPC benchmark CLI and interactive Vite demo.
