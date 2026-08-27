import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

// Regression cover for issue #18: the demo hardcoded a root-absolute
// "/laz-perf.wasm", so a subpath deployment answered the WASM request with its
// 404 HTML page and laz-perf aborted on the missing magic word.
const assetsDirectory = fileURLToPath(new URL("../apps/demo/dist/assets", import.meta.url));
const wasmMagicWord = "0061736d";

// The entry chunk drives the main thread decode fallback and the decoder worker
// chunk drives the Worker pool, so both have to resolve the WASM independently.
const decodePathChunks = {
  "main thread": "index-",
  worker: "decoder-worker-",
} as const;

async function readChunk(prefix: string): Promise<string> {
  const entries = await readdir(assetsDirectory);
  const chunk = entries.find((name) => name.startsWith(prefix) && name.endsWith(".js"));
  if (!chunk) {
    throw new Error(`No ${prefix}*.js chunk in ${assetsDirectory}. Found: ${entries.join(", ")}`);
  }
  return readFile(`${assetsDirectory}/${chunk}`, "utf8");
}

/**
 * Collects the WASM paths a chunk hands to laz-perf's `locateFile`. Splitting on
 * quotes keeps the scan linear over the multi-megabyte entry chunk, and the
 * slash filter drops laz-perf's own bare "laz-perf.wasm" default, which is the
 * argument to `locateFile` rather than one of its results.
 */
function lazPerfWasmUrlsIn(chunk: string): string[] {
  const urls = chunk
    .split(/["'`]/)
    .filter(
      (token) => token.includes("laz-perf") && token.includes("/") && token.endsWith(".wasm"),
    );
  return [...new Set(urls)];
}

for (const [decodePath, chunkPrefix] of Object.entries(decodePathChunks)) {
  test(`resolves the laz-perf WASM under the deployment base on the ${decodePath} path`, async ({
    baseURL,
  }) => {
    const base = new URL(baseURL!).pathname;
    const urls = lazPerfWasmUrlsIn(await readChunk(chunkPrefix));

    expect(urls, `${chunkPrefix}*.js should reference the laz-perf WASM`).not.toHaveLength(0);
    expect(
      urls.filter((url) => !url.startsWith(base)),
      "WASM URLs must carry the deployment base, not the domain root",
    ).toEqual([]);
  });

  test(`serves WASM bytes for the ${decodePath} decode path`, async ({ baseURL, request }) => {
    const urls = lazPerfWasmUrlsIn(await readChunk(chunkPrefix));

    for (const url of urls) {
      const resolved = new URL(url, baseURL!).href;
      const response = await request.get(resolved);

      expect(response.status(), `${resolved} must exist under the deployment base`).toBe(200);
      expect(response.headers()["content-type"]).toContain("wasm");
      const body = await response.body();
      expect(
        body.subarray(0, 4).toString("hex"),
        `${resolved} returned ${body.subarray(0, 4).toString()} instead of a WASM module`,
      ).toBe(wasmMagicWord);
    }
  });
}

test("opens the viewer from a non-root base", async ({ page }) => {
  const pageErrors: Error[] = [];
  page.on("pageerror", (error) => pageErrors.push(error));

  await page.goto("./");

  await expect(page).toHaveTitle("CesiumJS COPC Runtime");
  await expect(page.locator("#cesium canvas")).toBeVisible();
  expect(pageErrors).toEqual([]);
});
