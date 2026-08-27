import { defineConfig, devices } from "@playwright/test";

const rootPort = 4173;
const subpathPort = 4174;
// Matches the base path used by the GitHub Pages deploy in .github/workflows/pages.yml,
// so the subpath project reproduces the deployment that issue #18 reported.
const subpathBase = "/cesiumjs-copc-runtime/";
const rootUrl = `http://127.0.0.1:${rootPort}`;
const subpathUrl = `http://127.0.0.1:${subpathPort}${subpathBase}`;
const subpathSpec = /subpath-deploy\.spec\.ts/;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["html", { open: "never" }], ["github"]] : "list",
  use: {
    screenshot: "only-on-failure",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      testIgnore: subpathSpec,
      use: { ...devices["Desktop Chrome"], baseURL: rootUrl },
    },
    {
      name: "subpath-deploy",
      testMatch: subpathSpec,
      use: { ...devices["Desktop Chrome"], baseURL: subpathUrl },
    },
  ],
  webServer: [
    {
      command: `npm run dev --workspace cesiumjs-copc-demo -- --host 127.0.0.1 --port ${rootPort}`,
      url: rootUrl,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      // Build and serve under a non-root base. `vite preview` mounts the bundle at
      // the base and answers anything outside it with a 404, which is what turned
      // a root-absolute WASM URL into an HTML response on GitHub Pages.
      command: `npm run demo:build && npm run preview --workspace cesiumjs-copc-demo -- --host 127.0.0.1 --port ${subpathPort}`,
      url: subpathUrl,
      env: { BASE_URL: subpathBase },
      reuseExistingServer: !process.env.CI,
      timeout: 300_000,
    },
  ],
});
