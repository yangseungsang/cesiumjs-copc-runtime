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

test("serves project and bundled dependency license notices", async ({ request }) => {
  const expectedNotices = [
    ["licenses/project/LICENSE", "MIT License"],
    ["licenses/THIRD_PARTY_NOTICES.md", "Autzen Stadium sample data"],
    ["licenses/cesium/LICENSE.md", "CesiumJS Contributors"],
    ["licenses/cesium/ThirdParty.json", '"name": "@tweenjs/tween.js"'],
    ["licenses/copc/LICENSE", "Copyright (c) 2021 Connor Manning"],
    ["licenses/cross-fetch/LICENSE", "Copyright (c) 2017 Leonardo Quixadá"],
    ["licenses/node-fetch/LICENSE.md", "Copyright (c) 2016 David Frank"],
    ["licenses/laz-perf/COPYING", "Copyright 2022 Rapidlasso, GmbH"],
    ["licenses/proj4/LICENSE.md", "Proj4js -- Javascript reprojection library"],
    ["licenses/mgrs/LICENSE.md", "Copyright (c) 2012"],
    ["licenses/wkt-parser/LICENSE.md", "Proj4js -- Javascript reprojection library"],
    ["licenses/egm96-universal/LICENSE.md", "Copyright (c) 2020 Nicolas Vanhoren"],
    ["licenses/rfc4648/LICENSE", "William R Swanson"],
  ] as const;

  for (const [path, marker] of expectedNotices) {
    const source = await responseText(request, `${deploymentBase}${path}`);
    expect(source, `${path} is missing its expected notice`).toContain(marker);
  }
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
