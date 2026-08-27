#!/usr/bin/env node
// Guards the packaging rule that a host library must never be bundled as a runtime
// dependency. cesiumjs-copc@0.1.0 shipped `cesium` in `dependencies`, which gave any
// consumer that already had a different CesiumJS version a second nested copy. The
// duplicate install was the visible symptom; the real breakage was two Cesium module
// instances, which destroys the type identity that passing objects between the
// consumer's viewer and this runtime relies on.
//
// This check is deliberately offline and exact. Resolving a consumer's real
// dependency tree requires installing the packed artifact in a separate project;
// `pack:check` only verifies archive composition, so it is not a substitute for this
// manifest invariant.

import { readFileSync } from "node:fs";

/** Packages that must be declared by the consumer, never installed by us. */
const HOST_PACKAGES = ["cesium"];

const MANIFESTS = [
  "packages/cesium-copc/package.json",
  "packages/copc-core/package.json",
  "packages/copc-runtime/package.json",
  "packages/copc-worker/package.json",
  "packages/copc-analysis/package.json",
];

const failures = [];

for (const manifestPath of MANIFESTS) {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const dependencies = manifest.dependencies ?? {};
  const peerDependencies = manifest.peerDependencies ?? {};
  const devDependencies = manifest.devDependencies ?? {};

  for (const host of HOST_PACKAGES) {
    if (dependencies[host]) {
      failures.push(
        `${manifest.name}: "${host}" is a runtime dependency. Move it to peerDependencies ` +
          `so the consumer supplies exactly one copy.`,
      );
    }

    // A peer that is never installed locally cannot be built or tested here, so the
    // matching devDependency is required rather than optional.
    if (peerDependencies[host] && !devDependencies[host]) {
      failures.push(
        `${manifest.name}: "${host}" is a peer dependency but is missing from ` +
          `devDependencies, so the package cannot build on its own.`,
      );
    }
  }
}

if (failures.length > 0) {
  console.error("Peer dependency check failed:\n");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(`Peer dependency check passed for ${MANIFESTS.length} packages.`);
