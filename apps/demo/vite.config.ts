import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";

const cesiumSource = "../../node_modules/cesium/Build/Cesium";
const lazPerfWorkerAdapter = fileURLToPath(new URL("./src/laz-perf-worker.ts", import.meta.url));
const base = process.env.BASE_URL ?? "/";

export default defineConfig({
  base,
  define: {
    CESIUM_BASE_URL: JSON.stringify(`${base}cesium`),
  },
  plugins: [
    viteStaticCopy({
      targets: ["Workers", "ThirdParty", "Assets", "Widgets"].map((name) => ({
        src: `${cesiumSource}/${name}`,
        dest: "cesium",
      })),
    }),
  ],
  resolve: {
    alias: [{ find: /^laz-perf$/, replacement: lazPerfWorkerAdapter }],
  },
  worker: {
    format: "es",
  },
});
