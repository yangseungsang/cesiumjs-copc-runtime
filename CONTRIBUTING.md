# Contributing to CesiumJS COPC Runtime

Thanks for helping make cloud-native point-cloud workflows easier to use in CesiumJS.
Bug reports, reproducible datasets, documentation improvements, performance results,
and focused code contributions are all welcome.

## Before you start

- Search the existing issues before opening a new one.
- Use an issue for changes that affect public APIs, architecture, or observable behavior.
- Do not upload private or restricted point-cloud data. Share a public URL or a minimal
  synthetic fixture whenever possible.
- Follow the [Code of Conduct](CODE_OF_CONDUCT.md) and report security issues through
  the process in [SECURITY.md](SECURITY.md).

## Local development

Requirements:

- Node.js 20 or newer. `.nvmrc` pins the version CI uses, so `nvm use` gives you the
  same results CI reports.
- npm 10 or newer

```sh
npm ci
npm test
npm run typecheck
npm run build
npm run demo:build
```

Start the interactive viewer with `npm run demo`. The default Autzen Stadium COPC
dataset is public and supports HTTP byte-range requests.

## Contribution workflow

1. Create or select an issue with a clear acceptance condition.
2. Create a branch such as `feat/12-browser-metrics` or `fix/8-crs-fallback`.
3. Keep commits focused and describe why the change is needed.
4. Add or update tests for behavior changes.
5. Open a pull request that links the issue and includes verification evidence.
6. Address review and CI feedback before merging.

Pull requests should avoid unrelated formatting or generated output. Public API
changes must update the README or the relevant document under `docs/`.

## Bug and performance reports

COPC problems often depend on server and coordinate-system metadata. Include:

- a public COPC URL or a minimal reproduction;
- browser, operating system, and GPU when rendering is involved;
- whether the server returns `206 Partial Content` and CORS range headers;
- CRS WKT or EPSG code, when available;
- point budget, screen-space error, and worker count;
- observed and expected behavior;
- diagnostics or benchmark JSON with secrets removed.

## Commit and release conventions

Use short conventional prefixes such as `feat:`, `fix:`, `docs:`, `test:`,
`refactor:`, and `chore:`. Releases follow semantic versioning. User-visible changes
are summarized in [CHANGELOG.md](CHANGELOG.md).
