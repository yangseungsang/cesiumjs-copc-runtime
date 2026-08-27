// Captures the README screenshots from the running demo so the documentation
// images can be regenerated instead of being hand-edited.
//
//   npm run build
//   npm run dev --workspace cesiumjs-copc-demo -- --host 127.0.0.1 --port 4173
//   node scripts/capture-screenshots.mjs
//
// Pass --headless to run without a visible window. Software WebGL renders the
// point cloud noticeably darker, so the committed assets use a real GPU.

import { mkdir, mkdtemp, readdir, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { chromium } from "@playwright/test";

const baseUrl = process.env.DEMO_URL ?? "http://127.0.0.1:4173";
const headless = process.argv.includes("--headless");
const outputDirectory = join(dirname(fileURLToPath(import.meta.url)), "..", "docs", "assets");

const viewport = { width: 1600, height: 1000 };
// Framed on the canvas centre so the comparison images differ only by the
// point cloud, not by the surrounding chrome.
const sceneClip = { x: 400, y: 190, width: 800, height: 600 };
const targetCameraMeters = 1_300;
// Where the stadium lands after the demo flies to the bounding sphere. The
// flight is deterministic for a given viewport and dataset, so this is a fixed
// starting point rather than something to search for.
const stadiumAnchor = { x: 735, y: 665 };
const viewCentre = { x: viewport.width / 2, y: viewport.height / 2 };

// Close to the data the scheduler keeps trading nodes in and out, so the point
// count never repeats exactly. Treat a small relative drift as settled.
async function settle(page, { minimumPoints = 1, timeout = 90_000, tolerance = 0.01 } = {}) {
  const started = Date.now();
  let previous = -1;
  let stableChecks = 0;
  while (Date.now() - started < timeout) {
    await page.waitForTimeout(500);
    // textContent, not innerText: the panel is hidden for the scene captures
    // and innerText reports nothing for invisible elements.
    const parsed = Number(
      (await page.locator("#visible-points").textContent()).replaceAll(",", ""),
    );
    const loading = !(await page.locator("#streaming-status").isHidden());
    if (!Number.isFinite(parsed) || parsed < minimumPoints || loading) {
      stableChecks = 0;
      previous = parsed;
      continue;
    }
    const drift = previous <= 0 ? 1 : Math.abs(parsed - previous) / previous;
    stableChecks = drift <= tolerance ? stableChecks + 1 : 0;
    previous = parsed;
    if (stableChecks >= 4) return parsed;
  }
  console.warn(`settle timed out at ${previous.toLocaleString()} points, capturing anyway`);
  return previous;
}

// The demo prints the distance to the point under the screen centre, which is
// the only camera state reachable from outside the module.
async function cameraMeters(page) {
  const label = await page.locator("#camera-focus-label").textContent();
  const match = /([\d.]+)\s*(m|km)/.exec(label ?? "");
  if (!match) return undefined;
  return Number(match[1]) * (match[2] === "km" ? 1_000 : 1);
}

// Cesium keeps the point under the cursor fixed while wheeling, so dragging it
// to the centre first makes the zoom converge on the stadium instead of the
// suburb that happens to sit at the middle of the frame.
async function dragToCentre(page, from) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  const steps = 24;
  for (let step = 1; step <= steps; step += 1) {
    await page.mouse.move(
      from.x + ((viewCentre.x - from.x) * step) / steps,
      from.y + ((viewCentre.y - from.y) * step) / steps,
    );
    await page.waitForTimeout(20);
  }
  await page.mouse.up();
  await page.waitForTimeout(1_000);
}

// Cesium zooms by a fraction of the distance to the surface, so a fixed notch
// overshoots badly near the end. Shrink the notch as the target approaches and
// pull back out if a step still went too far.
async function zoomTo(page, meters) {
  await page.mouse.move(viewport.width / 2, viewport.height / 2);
  for (let step = 0; step < 60; step += 1) {
    const distance = await cameraMeters(page);
    if (distance === undefined) {
      await page.waitForTimeout(500);
      continue;
    }
    const ratio = distance / meters;
    if (ratio >= 0.85 && ratio <= 1.15) return distance;
    const notch = ratio > 3 ? 240 : ratio > 1.5 ? 80 : 25;
    await page.mouse.wheel(0, ratio > 1 ? -notch : notch);
    await page.waitForTimeout(700);
  }
  return cameraMeters(page);
}

// Captures land in a staging directory first. Writing straight into the repo
// makes the dev server's file watcher reload the page mid-run, and the next few
// captures come back blank.
async function shoot(page, name, options) {
  await page.screenshot({ path: join(stagingDirectory, name), ...options });
  console.log(`captured ${name}`);
}

// The scene crops are photographic and compress badly as PNG. The panel
// captures stay lossless so the small UI text keeps its edges.
async function shootScene(page, name) {
  await shoot(page, name, { clip: sceneClip, type: "jpeg", quality: 88 });
}

// Set through the DOM rather than selectOption: the control panel is hidden
// for the scene captures, and Playwright refuses to act on invisible elements.
async function select(page, id, value) {
  await page.evaluate(
    ([selectId, next]) => {
      const node = document.getElementById(selectId);
      if (!(node instanceof HTMLSelectElement)) throw new Error(`Missing select #${selectId}`);
      node.value = next;
      node.dispatchEvent(new Event("change", { bubbles: true }));
    },
    [id, value],
  );
  await settle(page);
}

async function setChromeVisible(page, visible) {
  await page.evaluate((show) => {
    for (const selector of [".panel", ".camera-tools"]) {
      const node = document.querySelector(selector);
      if (node instanceof HTMLElement) node.style.visibility = show ? "" : "hidden";
    }
  }, visible);
}

const stagingDirectory = await mkdtemp(join(tmpdir(), "copc-screenshots-"));
const browser = await chromium.launch({
  headless,
  args: ["--use-angle=metal", "--enable-gpu", "--hide-scrollbars"],
});
const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });

try {
  await mkdir(outputDirectory, { recursive: true });
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.locator("#cesium canvas").waitFor();
  // The crosshair is a live cursor affordance and only adds noise to a still.
  await page.addStyleTag({ content: "#camera-focus { display: none !important; }" });

  console.log(`streamed ${(await settle(page)).toLocaleString()} points on first view`);

  await dragToCentre(page, stadiumAnchor);
  console.log(`camera at ${await zoomTo(page, targetCameraMeters)} m`);

  // A raster basemap shows through the gaps between points and washes the
  // colours out. The solid background keeps the captures about the point cloud.
  await select(page, "base-map", "none");

  // The default pitch looks almost straight down, which flattens the stadium.
  // Applied after zooming so it pivots on the point cloud now under the centre.
  await page.locator("#camera-pitch").fill("-30");
  await page.locator("#camera-pitch").dispatchEvent("change");
  await page.locator("#point-size").fill("3");
  await page.locator("#point-size").dispatchEvent("input");
  await settle(page);

  await shoot(page, "demo-viewer.png");
  await shoot(page, "demo-statistics.png", { clip: { x: 24, y: 700, width: 432, height: 200 } });

  await setChromeVisible(page, false);
  await shootScene(page, "demo-color-rgb.jpg");

  await select(page, "color", "classification");
  await shootScene(page, "demo-color-classification.jpg");

  await select(page, "color", "intensity");
  await shootScene(page, "demo-color-intensity.jpg");

  await select(page, "color", "classification");
  await select(page, "filter", "ground");
  await shootScene(page, "demo-filter-ground.jpg");

  await select(page, "filter", "building");
  await shootScene(page, "demo-filter-building.jpg");
} finally {
  await browser.close();
}

for (const name of await readdir(stagingDirectory)) {
  await rename(join(stagingDirectory, name), join(outputDirectory, name));
  console.log(`wrote ${join(outputDirectory, name)}`);
}
await rm(stagingDirectory, { recursive: true, force: true });
