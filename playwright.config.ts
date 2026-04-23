import { defineConfig, devices } from "@playwright/test";
import path from "path";

const STORAGE_STATE = path.resolve(__dirname, "./.auth/user.json");

export default defineConfig({
  testDir: "./tests",
  testMatch: ["**/pc_*.spec.ts", "**/mw_*.spec.ts", "**/autoe2e/*.spec.ts"],
  testIgnore: ["**/autoe2e/__generated__/**"],
  timeout: 7200000, // 500개 점검을 위한 2시간 타임아웃
  fullyParallel: false,
  workers: 1, // 순차 실행 고정
  retries: 0, // 500개 랜딩 테스트는 재시도 불필요 (시간 낭비 방지)
  globalSetup: require.resolve("./tests/autoe2e/global-setup"),

  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
    ["./tests/autoe2e-reporter.ts"],
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
      // 500 크롤링 (내부에서 context 직접 생성 → PC→MW 순차)
      name: "Crawling",
      testMatch: ["**/pc_mw_500_crawling.spec.ts"],
    },
    {
      // 랜덤 테스트 (크롤링에서 생성한 URL 풀 재활용, Crawling 다음 실행)
      name: "Random",
      testMatch: ["**/pc_mw_200_random.spec.ts"],
    },
    {
      name: "PC_Chrome",
      use: { ...devices["Desktop Chrome"] },
      testMatch: ["**/pc_*.spec.ts"],
      testIgnore: ["**/pc_mw_*.spec.ts"],
    },
    {
      name: "MW_Chrome",
      use: { ...devices["Pixel 5"], baseURL: "https://m.store.hanssem.com" },
      testMatch: ["**/mw_*.spec.ts"],
    },
    // ─── AutoE2E: 기능 E2E (AutoE2E 프로젝트에서 이관) ─────────
    {
      name: "AutoE2E_Public_PC",
      use: { ...devices["Desktop Chrome"], locale: "ko-KR" },
      testMatch: /autoe2e[\\/](navigation|search|furnishing|interior|category|store)\.spec\.ts/,
    },
    {
      name: "AutoE2E_Public_Mobile",
      use: { ...devices["Pixel 5"], locale: "ko-KR" },
      testMatch: /autoe2e[\\/](navigation|search|furnishing|interior|category|store)\.spec\.ts/,
    },
    {
      name: "AutoE2E_Authed",
      use: {
        ...devices["Desktop Chrome"],
        locale: "ko-KR",
        storageState: STORAGE_STATE,
      },
      testMatch: /autoe2e[\\/](auth|cart|mypage|product)\.spec\.ts/,
    },
  ],
});
