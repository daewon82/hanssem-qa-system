import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 7200000, // 500개 점검을 위한 2시간 타임아웃
  fullyParallel: false,
  workers: 1, // 순차 실행 고정
  retries: 0, // 500개 랜딩 테스트는 재시도 불필요 (시간 낭비 방지)

  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
  ],

  outputDir: "test-results",

  use: {
    baseURL: "https://store.hanssem.com",
    screenshot: "only-on-failure",
    video: "off", // retain-on-failure → off (500개 영상 저장 시 용량/속도 문제)
    trace: "off", // retain-on-failure → off (동일 이유)
    actionTimeout: 20000,
    navigationTimeout: 30000,
    // 헤드리스 환경(GitHub Actions)에서 안정적 실행을 위한 설정
    ignoreHTTPSErrors: true,
    bypassCSP: true,
  },

  projects: [
    {
      name: "PC_Chrome",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
