#!/usr/bin/env node

import { readFileSync } from "node:fs";

const PACKAGES = [
  "packages/cesium-copc",
  "packages/copc-core",
  "packages/copc-runtime",
  "packages/copc-worker",
  "packages/copc-analysis",
];
const NOTICE_NAME = "THIRD_PARTY_NOTICES.md";
const CANONICAL_NOTICE = "third_party/NPM_PACKAGE_NOTICES.md";
const LAZ_PERF_LICENSE = "third_party/licenses/laz-perf-COPYING";
const PACKAGED_LAZ_PERF_LICENSE = "packages/copc-core/third_party/laz-perf-COPYING";

const failures = [];
const canonicalNotice = readFileSync(CANONICAL_NOTICE, "utf8");
const versions = new Set();
const manifests = new Map();

for (const packagePath of PACKAGES) {
  const manifestPath = `${packagePath}/package.json`;
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  manifests.set(manifest.name, manifest);
  versions.add(manifest.version);

  if (!manifest.files?.includes(NOTICE_NAME)) {
    failures.push(`${manifest.name}: files must include ${NOTICE_NAME}.`);
  }

  const packageNotice = readFileSync(`${packagePath}/${NOTICE_NAME}`, "utf8");
  if (packageNotice !== canonicalNotice) {
    failures.push(`${manifest.name}: ${NOTICE_NAME} differs from ${CANONICAL_NOTICE}.`);
  }

  const readme = readFileSync(`${packagePath}/README.md`, "utf8");
  if (!readme.includes(`(${NOTICE_NAME})`)) {
    failures.push(`${manifest.name}: README.md must link to ${NOTICE_NAME}.`);
  }
}

if (versions.size !== 1) {
  failures.push(`Public package versions are not aligned: ${[...versions].join(", ")}.`);
}

const [releaseVersion] = versions;
const noticeVersion = new RegExp(`release\\s+${releaseVersion.replaceAll(".", "\\.")}`);
if (!noticeVersion.test(canonicalNotice)) {
  failures.push(`${CANONICAL_NOTICE}: release version does not match ${releaseVersion}.`);
}

for (const manifest of manifests.values()) {
  for (const [dependency, version] of Object.entries(manifest.dependencies ?? {})) {
    if (manifests.has(dependency) && version !== releaseVersion) {
      failures.push(
        `${manifest.name}: ${dependency} must use release version ${releaseVersion}, found ${version}.`,
      );
    }
  }
}

const coreManifest = manifests.get("cesiumjs-copc-core");
if (!coreManifest.files?.includes("third_party")) {
  failures.push("cesiumjs-copc-core: files must include the third_party directory.");
}

const upstreamLicense = readFileSync(LAZ_PERF_LICENSE);
const packagedLicense = readFileSync(PACKAGED_LAZ_PERF_LICENSE);
if (!upstreamLicense.equals(packagedLicense)) {
  failures.push(`${PACKAGED_LAZ_PERF_LICENSE} differs from ${LAZ_PERF_LICENSE}.`);
}

if (failures.length > 0) {
  console.error("Package notice check failed:\n");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(`Package notice check passed for ${PACKAGES.length} packages at ${releaseVersion}.`);
