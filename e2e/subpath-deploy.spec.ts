import { expect, test, type APIRequestContext } from "@playwright/test";

const deploymentBase = "/cesiumjs-copc-runtime/";
const wasmPathPattern = /\/cesiumjs-copc-runtime\/assets\/laz-perf-[A-Za-z0-9_-]+\.wasm/;
const workerPathPattern = /\/cesiumjs-copc-runtime\/assets\/decoder-worker-[A-Za-z0-9_-]+\.js/;

test("serves laz-perf WASM from the production subpath", async ({ page, request }) => {
  await page.goto("./");

  const mainScriptPath = await page.locator('script[type="module"][src]').getAttribute("src");
  expect(mainScriptPath).toMatch(/^\/cesiumjs-copc-runtime\/assets\/index-[A-Za-z0-9_-]+\.js$/);

  const mainSource = await responseText(request, mainScriptPath!);
  const mainWasmPath = requiredMatch(mainSource, wasmPathPattern, "main bundle WASM URL");
  const workerPath = requiredMatch(mainSource, workerPathPattern, "decoder Worker URL");
  const workerSource = await responseText(request, workerPath);
  const workerWasmPath = requiredMatch(workerSource, wasmPathPattern, "Worker bundle WASM URL");

  expect(mainWasmPath).toBe(workerWasmPath);
  expect(mainWasmPath).toMatch(new RegExp(`^${deploymentBase}assets/`));

  const wasmResponse = await request.get(mainWasmPath);
  expect(wasmResponse.status()).toBe(200);
  expect(wasmResponse.headers()["content-type"]).toContain("application/wasm");
  const bytes = await wasmResponse.body();
  expect([...bytes.subarray(0, 4)]).toEqual([0x00, 0x61, 0x73, 0x6d]);
});

async function responseText(request: APIRequestContext, path: string): Promise<string> {
  const response = await request.get(path);
  expect(response.status()).toBe(200);
  return response.text();
}

function requiredMatch(source: string, pattern: RegExp, label: string): string {
  const match = source.match(pattern)?.[0];
  expect(match, `${label} is missing`).toBeDefined();
  return match!;
}
