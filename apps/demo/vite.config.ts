import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";

const repositoryRoot = "../..";
const packageRoot = `${repositoryRoot}/node_modules`;
const cesiumPackage = `${packageRoot}/cesium`;
const cesiumSource = `${cesiumPackage}/Build/Cesium`;
const lazPerfWorkerAdapter = fileURLToPath(new URL("./src/laz-perf-worker.ts", import.meta.url));
const base = process.env.BASE_URL ?? "/";

const licenseTargets = [
  { src: `${repositoryRoot}/LICENSE`, dest: "licenses/project" },
  { src: `${repositoryRoot}/THIRD_PARTY_NOTICES.md`, dest: "licenses" },
  { src: `${cesiumPackage}/LICENSE.md`, dest: "licenses/cesium" },
  { src: `${cesiumPackage}/ThirdParty.json`, dest: "licenses/cesium" },
  { src: `${packageRoot}/copc/license`, dest: "licenses/copc", rename: "LICENSE" },
  { src: `${packageRoot}/cross-fetch/LICENSE`, dest: "licenses/cross-fetch" },
  { src: `${packageRoot}/node-fetch/LICENSE.md`, dest: "licenses/node-fetch" },
  {
    src: `${repositoryRoot}/third_party/licenses/laz-perf-COPYING`,
    dest: "licenses/laz-perf",
    rename: "COPYING",
  },
  { src: `${packageRoot}/proj4/LICENSE.md`, dest: "licenses/proj4" },
  { src: `${packageRoot}/mgrs/license.md`, dest: "licenses/mgrs", rename: "LICENSE.md" },
  { src: `${packageRoot}/wkt-parser/LICENSE.md`, dest: "licenses/wkt-parser" },
  { src: `${packageRoot}/egm96-universal/LICENSE.md`, dest: "licenses/egm96-universal" },
  { src: `${packageRoot}/rfc4648/LICENSE`, dest: "licenses/rfc4648" },
];

export default defineConfig({
  base,
  define: {
    CESIUM_BASE_URL: JSON.stringify(`${base}cesium`),
  },
  plugins: [
    viteStaticCopy({
      targets: [
        ...["Workers", "ThirdParty", "Assets", "Widgets"].map((name) => ({
          src: `${cesiumSource}/${name}`,
          dest: "cesium",
        })),
        ...licenseTargets,
      ],
    }),
  ],
  resolve: {
    alias: [{ find: /^laz-perf$/, replacement: lazPerfWorkerAdapter }],
  },
  worker: {
    format: "es",
  },
});
