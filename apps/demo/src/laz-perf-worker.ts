import { createLazPerf as createWebLazPerf } from "laz-perf/lib/web/index.js";
import { createLazPerf as createWorkerLazPerf } from "laz-perf/lib/worker/index.js";
import lazPerfWasmUrl from "laz-perf/lib/worker/laz-perf.wasm?url";

type LazPerfOptions = Parameters<typeof createWorkerLazPerf>[0];

/**
 * Vite-safe laz-perf factory with an explicit WASM URL.
 *
 * The URL comes from Vite's asset pipeline so it already carries the configured
 * base path. A root-absolute literal such as `/laz-perf.wasm` would ignore the
 * base and fetch the 404 page of a subpath deployment instead of the module.
 */
export function createLazPerf(options?: LazPerfOptions) {
  const overrides = options ?? {};
  const fallbackLocateFile = (
    overrides as {
      locateFile?: (path: string, prefix: string) => string;
    }
  ).locateFile;
  const factory = typeof document === "undefined" ? createWorkerLazPerf : createWebLazPerf;
  return factory({
    ...overrides,
    locateFile(path: string, prefix: string) {
      if (path.endsWith(".wasm")) {
        return new URL(lazPerfWasmUrl, globalThis.location.href).href;
      }
      return fallbackLocateFile?.(path, prefix) ?? `${prefix}${path}`;
    },
  } as LazPerfOptions);
}

export const create = createLazPerf;
export const LazPerf = { create: createLazPerf };
