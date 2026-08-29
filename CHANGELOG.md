# Changelog

All notable changes to this project will be documented here. The project follows
semantic versioning once public packages are released.

## [Unreleased]

### Added

- An environment-protected manual workflow for deprecating an exact public npm
  package version without exposing the registry token.

## [0.1.2] - 2026-08-29

### Added

- Open-source contribution, support, governance, and security policies.
- Structured issue and pull-request templates.
- Third-party software notices and license files in the production demo output.
- Autzen Stadium CC BY 4.0 attribution and explicit contribution licensing terms.
- Third-party notices in every public npm package, with the upstream laz-perf
  Apache-2.0 `COPYING` file preserved in `cesiumjs-copc-core`.
- An offline packaging guard that verifies notice consistency, package version
  alignment, internal dependency versions, and the exact laz-perf license copy.

### Changed

- Aligned all five public npm packages and their internal dependencies at `0.1.2`.

### Deprecated

- `cesiumjs-copc@0.1.0` on npm because it installs CesiumJS as a runtime dependency;
  use `0.1.2` instead. The component packages at `0.1.0` and the corrected main
  package at `0.1.1` remain supported upgrade sources.

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
