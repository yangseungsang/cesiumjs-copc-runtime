import { defineConfig, devices } from "@playwright/test";

const deploymentBase = "/cesiumjs-copc-runtime/";
const serverOrigin = "http://127.0.0.1:4173";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["html", { open: "never" }], ["github"]] : "list",
  use: {
    baseURL: `${serverOrigin}${deploymentBase}`,
    screenshot: "only-on-failure",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command:
      `BASE_URL=${deploymentBase} npm run demo:build && ` +
      `BASE_URL=${deploymentBase} npm run preview --workspace cesiumjs-copc-demo -- ` +
      "--host 127.0.0.1 --port 4173",
    url: `${serverOrigin}${deploymentBase}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
