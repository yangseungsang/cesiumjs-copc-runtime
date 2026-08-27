// Captures the README screenshots from the running demo so the documentation
// images can be regenerated instead of being hand-edited.
//
//   npm run build
//   npm run demo -- --host 127.0.0.1 --port 4173
//   node scripts/capture-screenshots.mjs
//
// Pass --headless to run without a visible window. Software WebGL renders the
// point cloud noticeably darker, so the committed assets use a real GPU.

import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { chromium } from "@playwright/test";

const baseUrl = process.env.DEMO_URL ?? "http://127.0.0.1:4173";
const headless = process.argv.includes("--headless");
const outputDirectory = join(dirname(fileURLToPath(import.meta.url)), "..", "docs", "assets");

const viewport = { width: 1600, height: 1000 };
// Leaves the control panel out of the frame so the colour comparison images
// only differ by the point cloud itself.
const sceneClip = { x: 0, y: 0, width: 1140, height: 1000 };

async function settle(page, { minimumPoints = 1, timeout = 120_000 } = {}) {
  const started = Date.now();
  let previous = -1;
  let stableChecks = 0;
  while (Date.now() - started < timeout) {
    await page.waitForTimeout(500);
    const points = await page.locator("#visible-points").innerText();
    const parsed = Number(points.replaceAll(",", ""));
    const loading = !(await page.locator("#streaming-status").isHidden());
    if (!Number.isFinite(parsed) || parsed < minimumPoints || loading) {
      stableChecks = 0;
      previous = parsed;
      continue;
    }
    stableChecks = parsed === previous ? stableChecks + 1 : 0;
    previous = parsed;
    if (stableChecks >= 4) return parsed;
  }
  throw new Error("The viewer did not finish streaming within the timeout.");
}

async function shoot(page, name, options) {
  const path = join(outputDirectory, name);
  await page.screenshot({ path, ...options });
  console.log(`wrote ${path}`);
}

async function setColorMode(page, mode) {
  await page.selectOption("#color", mode);
  await settle(page);
}

const browser = await chromium.launch({
  headless,
  args: ["--use-angle=metal", "--enable-gpu", "--hide-scrollbars"],
});
const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });

try {
  await mkdir(outputDirectory, { recursive: true });
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.locator("#cesium canvas").waitFor();

  const points = await settle(page);
  console.log(`streamed ${points.toLocaleString()} points`);

  // The default pitch looks down too steeply to show the stadium structure.
  await page.locator("#camera-pitch").fill("-38");
  await page.locator("#camera-pitch").dispatchEvent("change");
  await settle(page);

  await shoot(page, "demo-viewer.png");
  await shoot(page, "demo-color-rgb.png", { clip: sceneClip });

  await setColorMode(page, "classification");
  await shoot(page, "demo-color-classification.png", { clip: sceneClip });

  await setColorMode(page, "intensity");
  await shoot(page, "demo-color-intensity.png", { clip: sceneClip });

  await setColorMode(page, "elevation");
  await shoot(page, "demo-color-elevation.png", { clip: sceneClip });

  await setColorMode(page, "classification");
  await page.selectOption("#filter", "ground");
  await settle(page);
  await shoot(page, "demo-filter-ground.png", { clip: sceneClip });

  await page.selectOption("#filter", "building");
  await settle(page);
  await shoot(page, "demo-filter-building.png", { clip: sceneClip });

  await page.selectOption("#filter", "all");
  await setColorMode(page, "rgb");
  await shoot(page, "demo-statistics.png", { clip: { x: 1140, y: 0, width: 460, height: 1000 } });
} finally {
  await browser.close();
}
