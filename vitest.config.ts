import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "cesiumjs-copc": fileURLToPath(
        new URL("./packages/cesium-copc/src/index.ts", import.meta.url),
      ),
      "cesiumjs-copc-analysis": fileURLToPath(
        new URL("./packages/copc-analysis/src/index.ts", import.meta.url),
      ),
      "cesiumjs-copc-core": fileURLToPath(
        new URL("./packages/copc-core/src/index.ts", import.meta.url),
      ),
      "cesiumjs-copc-runtime": fileURLToPath(
        new URL("./packages/copc-runtime/src/index.ts", import.meta.url),
      ),
      "cesiumjs-copc-worker": fileURLToPath(
        new URL("./packages/copc-worker/src/index.ts", import.meta.url),
      ),
    },
  },
  test: {
    exclude: ["e2e/**", "**/node_modules/**", "**/dist/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "lcov"],
      // Coverage measures the published runtime. The benchmark CLI is a private
      // development tool, and type-only modules compile to nothing, so both would
      // report zero without any behavior to test.
      include: ["packages/*/src/**/*.ts"],
      exclude: [
        "**/*.test.ts",
        "**/index.ts",
        "**/decoder-worker.ts",
        "packages/benchmark/**",
        "packages/copc-core/src/types.ts",
        "packages/copc-worker/src/protocol.ts",
      ],
      // A regression floor, not a completion target. The margin below the current
      // numbers absorbs the small drift in v8 function counting between Node
      // releases, so a contributor on a newer Node does not see a phantom failure.
      thresholds: {
        statements: 88,
        branches: 74,
        functions: 85,
        lines: 88,
      },
    },
  },
});
