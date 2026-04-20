import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/stg_*.spec.ts",
  timeout: 7200000,
  fullyParallel: false,
  workers: 1,
  retries: 0,

  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
  ],

  outputDir: "test-results",

  use: {
    baseURL: "https://stg-store.hanssem.com",
    screenshot: "only-on-failure",
    video: "off",
    trace: "off",
    actionTimeout: 20000,
    navigationTimeout: 30000,
    ignoreHTTPSErrors: true,
    bypassCSP: true,
    launchOptions: {
      args: [
        "--disable-gpu",
        "--disable-dev-shm-usage",
        "--no-sandbox",
        "--disable-setuid-sandbox",
      ],
    },
  },

  projects: [
    {
      name: "STG_PC_Chrome",
      use: { ...devices["Desktop Chrome"] },
      testMatch: ["**/stg_pc_*.spec.ts"],
    },
    {
      name: "STG_MW_Chrome",
      use: { ...devices["Pixel 5"], baseURL: "https://stg-m.store.hanssem.com" },
      testMatch: ["**/stg_mw_*.spec.ts"],
    },
  ],
});
