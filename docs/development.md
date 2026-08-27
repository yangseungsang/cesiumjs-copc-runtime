# Development

## Repository layout

```text
apps/demo                 interactive CesiumJS viewer
packages/copc-core        ranges, hierarchy, source, cache
packages/copc-runtime     LOD, queue, budgets, LRU
packages/copc-worker      LAZ Worker and render coordinates
packages/cesium-copc      CesiumJS integration
packages/copc-analysis    streaming analysis
packages/benchmark        benchmark CLI
e2e                       Chromium smoke tests
```

TypeScript project references define build order. Public packages export compiled ESM
and declaration files from `dist/`.

## Quality commands

`.nvmrc` pins the Node version CI uses for coverage, packaging, and the demo build.
Run `nvm use` (or the equivalent for your version manager) before the commands below
so local results match CI.

```sh
npm ci
npm run lint
npm run format:check
npm test
npm run test:coverage
npm run typecheck
npm run build
npm run demo:build
npm run pack:check
```

Install Chromium once before running `npm run test:e2e` locally:

```sh
npx playwright install chromium
npm run test:e2e
```

Coverage thresholds are a regression floor, not a completion target. New behavior
should include focused tests, especially error paths and boundary conditions.

Coverage measures the published runtime packages. The benchmark CLI is a private
development tool and type-only modules compile to nothing, so both are excluded
rather than counted as permanently uncovered.

Tests that need Cesium or COPC infrastructure stub the smallest possible surface.
`copc-point-cloud.test.ts` replaces only `PrimitiveCollection` so the frame loop runs
without a WebGL context, and keeps the real math and point-collection classes.
`copc-source.test.ts` and `decoder.test.ts` stub the `copc` package. No test reaches
the network.

## Pull requests

Start with an issue for public API or architectural work. Link the issue, state the
acceptance conditions, keep unrelated formatting out, and include screenshots or
benchmark JSON when behavior is visual or performance-sensitive. CI must pass before
merge.

## Releases

1. Confirm package metadata and package names.
2. Run every quality command and test installation from generated tarballs.
3. Update `CHANGELOG.md` and version fields.
4. Publish dependency packages before packages that depend on them.
5. Create a signed or annotated Git tag and GitHub Release.
6. Verify installation in a clean consumer project.

See [CONTRIBUTING.md](../CONTRIBUTING.md), [GOVERNANCE.md](../GOVERNANCE.md), and
[SECURITY.md](../SECURITY.md).
