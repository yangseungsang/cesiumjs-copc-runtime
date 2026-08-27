import { createLazPerf as createWebLazPerf } from "laz-perf/lib/web/index.js";
import webLazPerfWasmUrl from "laz-perf/lib/web/laz-perf.wasm?url";
import { createLazPerf as createWorkerLazPerf } from "laz-perf/lib/worker/index.js";
import workerLazPerfWasmUrl from "laz-perf/lib/worker/laz-perf.wasm?url";

type LazPerfOptions = Parameters<typeof createWorkerLazPerf>[0];

/** Vite-safe laz-perf factory with an explicit WASM URL. */
export function createLazPerf(options?: LazPerfOptions) {
  const overrides = options ?? {};
  const fallbackLocateFile = (
    overrides as {
      locateFile?: (path: string, prefix: string) => string;
    }
  ).locateFile;
  const workerContext = typeof document === "undefined";
  const factory = workerContext ? createWorkerLazPerf : createWebLazPerf;
  const wasmUrl = workerContext ? workerLazPerfWasmUrl : webLazPerfWasmUrl;
  return factory({
    ...overrides,
    locateFile(path: string, prefix: string) {
      if (path.endsWith(".wasm")) {
        return wasmUrl;
      }
      return fallbackLocateFile?.(path, prefix) ?? `${prefix}${path}`;
    },
  } as LazPerfOptions);
}

export const create = createLazPerf;
export const LazPerf = { create: createLazPerf };
