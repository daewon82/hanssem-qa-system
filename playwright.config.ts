import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 7200000, // 500개 점검을 위한 2시간 타임아웃
  fullyParallel: false,
  workers: 1, // 순차 실행 고정

  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
  ],

  outputDir: "test-results",

  use: {
    baseURL: "https://store.hanssem.com",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    trace: "retain-on-failure",
    actionTimeout: 20000,
    navigationTimeout: 30000,
  },

  projects: [
    {
      name: "PC_Chrome",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
