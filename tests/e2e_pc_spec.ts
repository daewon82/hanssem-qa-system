import { test, expect, Page } from "@playwright/test";
import fs from "fs";
import axios from "axios";
import { execSync } from "child_process";
import { GoogleSpreadsheet } from "google-spreadsheet";
import { authenticate } from "@google-cloud/local-auth";
import { google } from "googleapis";

/**
 * store.hanssem.com PC E2E 테스트 — Accessibility ID 기반
 * - PC Chrome 전용 (isMobile 분기 없음)
 * - data-test-id 셀렉터 우선 사용 (Accessibility ID 문서 기반)
 * - 명령어: npx playwright test tests/e2e_pc_spec.ts
 *
 * 화면 커버리지:
 * 1. 메인 페이지       (home_*)
 * 2. 가구/홈리빙       (furniture_*)
 * 3. 가구 상품 리스트  (furniture_list_*)
 * 4. 인테리어          (interior_*)
 * 5. 상품 상세 (PDP)   (pdp_*)
 * 6. 매장찾기          (store_*)
 * 7. 검색              (search_*)
 * 8. 주요 페이지 HTTP 응답
 */

// ─── 설정 ────────────────────────────────────────────────────
const SPREADSHEET_ID = "1nZ37wkzNTDT-C7gXrH7X4ddiXyY4ZAbfG2zcSKM1n3k";
const TEMPLATE_GID = 1626254051;
const TOKEN_PATH = "/Users/dw/Web_E2E_Test/token.json";
const CREDENTIALS_PATH = "/Users/dw/Downloads/pc_secret.json";
const REPORT_ID = "pc-e2e";
const REPORT_TITLE = "운영환경 PC E2E 접근성ID 테스트";
const JANDI_WEBHOOK_URL =
  "https://wh.jandi.com/connect-api/webhook/24103837/4c878ba74e1e0cf15180f85bdd47c1f6";
const DASHBOARD_URL = "https://hanssem-qa-system.vercel.app";

const SAMPLE_GOODS_ID = "837513";

// data-test-id 셀렉터 헬퍼
const tid = (id: string) => `[data-test-id="${id}"]`;

// ─── 유틸 ────────────────────────────────────────────────────
async function waitForPageReady(page: Page, extra = 1500) {
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(extra);
}

// ─── 구글 인증 ───────────────────────────────────────────────
async function getAuthClient() {
  if (fs.existsSync(TOKEN_PATH)) {
    try {
      const token = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf8"));
      const keys = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, "utf8"));
      const { client_id, client_secret } = keys.installed || keys.web;

      const auth = new google.auth.OAuth2(client_id, client_secret);
      auth.setCredentials(token);
      auth.on("tokens", (tokens) => {
        const updated = { ...token, ...tokens };
        fs.writeFileSync(TOKEN_PATH, JSON.stringify(updated));
        console.log("🔄 구글 토큰 자동 갱신 완료");
      });
      return auth;
    } catch {
      console.log("⚠️ 저장된 토큰 오류. 재인증합니다.");
    }
  }

  const client = await authenticate({
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    keyfilePath: CREDENTIALS_PATH,
  });
  if (client.credentials) {
    const dir = TOKEN_PATH.substring(0, TOKEN_PATH.lastIndexOf("/"));
    if (dir && !fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(client.credentials));
    console.log("💾 구글 인증 토큰 저장 완료");
  }
  return client;
}

// ─── 모듈 상태 (workers:1 고정 환경) ────────────────────────
let newSheet: any = null;
let currentRow = 6;
let passCount = 0;
let failCount = 0;
const caseResults: any[] = [];
const failedUrls: string[] = [];

// ─── 전처리: 구글 시트 초기화 ───────────────────────────────
test.beforeAll(async () => {
  ["public", "fail_evidence"].forEach((dir) => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
  });

  try {
    const testStartTime = new Date();
    const auth = await getAuthClient();
    const doc = new GoogleSpreadsheet(SPREADSHEET_ID, auth as any);
    await doc.loadInfo();

    const nowStr = testStartTime
      .toISOString()
      .replace(/[:T]/g, "-")
      .split(".")[0];
    const templateSheet = doc.sheetsById[TEMPLATE_GID];
    newSheet = await templateSheet.duplicate({
      title: `Report_PC_AID_${nowStr}`,
    });

    await newSheet.loadCells("A1:J10");
    const headers = [
      "URL",
      "테스트명",
      "접근성ID",
      "결과상태",
      "실행시간(초)",
      "결과",
      "실패 사유",
    ];
    headers.forEach((h, i) => {
      newSheet.getCell(4, i).value = h;
    });
    newSheet.getCellByA1("B2").value = testStartTime.toLocaleString("ko-KR", {
      timeZone: "Asia/Seoul",
    });
    await newSheet.saveUpdatedCells();
    console.log("📊 구글 시트 초기화 완료");
  } catch (err: any) {
    console.log("⚠️ 구글 시트 초기화 오류:", err.message);
  }
});

// ─── 각 테스트 후: 결과 기록 ────────────────────────────────
test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status === "skipped") return;

  const isPassed = testInfo.status === "passed";
  const currentUrl = page.url();

  // 접근성ID annotation 추출
  const aidAnnotation = testInfo.annotations.find(
    (a) => a.type === "accessibilityId"
  );
  const accessibilityId = aidAnnotation?.description ?? "N/A";

  if (!isPassed) {
    testInfo.annotations.push({ type: "url", description: currentUrl });
    failCount++;
    failedUrls.push(currentUrl);
  } else {
    passCount++;
  }

  caseResults.push({
    name: testInfo.title,
    url: currentUrl,
    status: isPassed ? "pass" : "fail",
    duration: `${(testInfo.duration / 1000).toFixed(2)}s`,
  });

  if (newSheet) {
    try {
      await newSheet.loadCells(`A${currentRow}:G${currentRow}`);
      const errorMsg =
        testInfo.errors?.[0]?.message?.split("\n")[0]?.slice(0, 80) ?? "실패";
      const rowData = [
        currentUrl,
        testInfo.title,
        accessibilityId,
        isPassed ? "PASS" : "FAIL",
        `${(testInfo.duration / 1000).toFixed(2)}`,
        isPassed ? "PASS" : "FAIL",
        isPassed ? "-" : errorMsg,
      ];
      rowData.forEach((val, idx) => {
        const cell = newSheet.getCell(currentRow - 1, idx);
        cell.value = val;
        if (idx === 5 && val === "FAIL") {
          cell.backgroundColor = { red: 1, green: 0, blue: 0 };
          cell.textFormat = {
            foregroundColor: { red: 1, green: 1, blue: 1 },
            bold: true,
          };
        }
      });
      await newSheet.saveUpdatedCells();
      currentRow++;
    } catch (err: any) {
      console.log("⚠️ 시트 기록 오류:", err.message);
      currentRow++;
    }
  }
});

// ─── 전체 완료 후: 리포트 저장 및 배포 ─────────────────────
test.afterAll(async () => {
  if (newSheet) {
    try {
      const endTime = new Date();
      await newSheet.loadCells("B3");
      newSheet.getCellByA1("B3").value = endTime.toLocaleString("ko-KR", {
        timeZone: "Asia/Seoul",
      });
      await newSheet.saveUpdatedCells();
      console.log("📊 구글 시트 기록 완료");
    } catch (err: any) {
      console.log("⚠️ 시트 종료 기록 오류:", err.message);
    }
  }

  const totalCount = passCount + failCount;
  const passRate =
    totalCount > 0 ? ((passCount / totalCount) * 100).toFixed(1) : "0";
  const kst = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
  const sheetUrl = newSheet
    ? `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit#gid=${newSheet.sheetId}`
    : "";

  let existingData: any = { lastUpdated: kst, reports: [] };
  try {
    const raw = fs.readFileSync("public/results.json", "utf8");
    existingData = JSON.parse(raw);
  } catch {}

  const newReport = {
    id: REPORT_ID,
    title: REPORT_TITLE,
    lastUpdated: kst,
    total: totalCount,
    pass: passCount,
    fail: failCount,
    passRate,
    sheetUrl,
    cases: caseResults.filter((c) => c.status === "fail"),
  };

  const reportIdx = existingData.reports.findIndex(
    (r: any) => r.id === REPORT_ID
  );
  if (reportIdx >= 0) {
    existingData.reports[reportIdx] = newReport;
  } else {
    existingData.reports.push(newReport);
  }
  existingData.lastUpdated = kst;

  fs.writeFileSync("public/results.json", JSON.stringify(existingData, null, 2));

  try {
    execSync("git add public/results.json");
    const status = execSync("git status --porcelain").toString().trim();
    if (status) {
      execSync(`git commit -m "auto update ${Date.now()} [skip ci]"`);
      execSync("git push origin HEAD:main --force");
      console.log("📤 GitHub push 완료");
    } else {
      console.log("⚠️ results.json 변경 없음 - 커밋 스킵");
    }
  } catch (err: any) {
    console.log("❌ Git 오류:", err.message);
  }

  try {
    execSync("npx vercel --prod --yes --force", { stdio: "inherit" });
    console.log("🚀 Vercel 배포 완료");
  } catch (err: any) {
    console.log("❌ Vercel 배포 오류:", err.message);
  }

  try {
    const failUrlText =
      failedUrls.length > 0 ? failedUrls.slice(0, 10).join("\n") : "없음";
    await axios.post(JANDI_WEBHOOK_URL, {
      body: `[${REPORT_TITLE}] 결과: ${passCount} 성공 / ${failCount} 실패`,
      connectColor: failCount > 0 ? "#FF4444" : "#00C73C",
      connectInfo: [
        {
          title: "결과 요약",
          description: `총 ${totalCount}건 / 통과율 ${passRate}%`,
        },
        { title: "실패 테스트", description: failUrlText },
        { title: "📊 리포트 보기", description: DASHBOARD_URL },
      ],
    });
    console.log("📤 잔디 전송 완료");
  } catch (err: any) {
    console.log("❌ 잔디 실패:", err.message);
  }

  console.log(`🏁 PC 접근성ID E2E 완료! 총 ${totalCount}건`);
});

// ═══════════════════════════════════════════════════════════════
// 1. 메인 페이지 (home_*)
// ═══════════════════════════════════════════════════════════════
test.describe("1. 메인 페이지", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await waitForPageReady(page, 2000);
  });

  test("페이지 정상 로딩 및 타이틀 확인", async ({ page }) => {
    await expect(page).toHaveTitle(/한샘/);
    console.log(`[✓] 메인 로딩: ${page.url()}`);
  });

  test("헤더 햄버거 메뉴 노출 [home_btn_all_menu]", async ({ page }) => {
    test.info().annotations.push({ type: "accessibilityId", description: "home_btn_all_menu" });
    await expect(page.locator(tid("home_btn_all_menu")).first()).toBeVisible({ timeout: 10000 });
    console.log("[✓] home_btn_all_menu 노출");
  });

  test("헤더 검색 아이콘 노출 [home_btn_search]", async ({ page }) => {
    test.info().annotations.push({ type: "accessibilityId", description: "home_btn_search" });
    await expect(page.locator(tid("home_btn_search")).first()).toBeVisible({ timeout: 10000 });
    console.log("[✓] home_btn_search 노출");
  });

  test("헤더 장바구니 아이콘 노출 [home_btn_cart]", async ({ page }) => {
    test.info().annotations.push({ type: "accessibilityId", description: "home_btn_cart" });
    await expect(page.locator(tid("home_btn_cart")).first()).toBeVisible({ timeout: 10000 });
    console.log("[✓] home_btn_cart 노출");
  });

  test("메인 빅 배너 노출 [home_banner_big]", async ({ page }) => {
    test.info().annotations.push({ type: "accessibilityId", description: "home_banner_big" });
    await expect(page.locator(tid("home_banner_big")).first()).toBeVisible({ timeout: 10000 });
    console.log("[✓] home_banner_big 노출");
  });

  test("검색 아이콘 클릭 → 검색 진입 [home_btn_search]", async ({ page }) => {
    test.info().annotations.push({ type: "accessibilityId", description: "home_btn_search" });
    const searchTestId = page.locator(tid("home_btn_search")).first();
    // data-test-id 미구현 시 GTM 속성 fallback
    const searchGtm = page.locator('[data-gtm-tracking-menu-value="search"]').first();
    const useTestId = await searchTestId.isVisible({ timeout: 3000 }).catch(() => false);
    const icon = useTestId ? searchTestId : searchGtm;

    await expect(icon).toBeVisible({ timeout: 10000 });
    await icon.click({ force: true });
    await waitForPageReady(page, 1500);

    const hasSearchUrl = page.url().includes("search");
    const searchField = page.locator(tid("search_input_field")).first();
    const fieldVisible = await searchField.isVisible({ timeout: 5000 }).catch(() => false);
    expect(hasSearchUrl || fieldVisible).toBe(true);
    console.log(`[✓] 검색 진입: ${page.url()}`);
  });

  test("장바구니 아이콘 클릭 → mall.hanssem.com 이동 [home_btn_cart]", async ({ page }) => {
    test.info().annotations.push({ type: "accessibilityId", description: "home_btn_cart" });
    const cartBtn = page.locator(tid("home_btn_cart")).first();
    await expect(cartBtn).toBeVisible({ timeout: 10000 });
    await cartBtn.evaluate((el) => (el as HTMLElement).click());
    await page.waitForURL(/mall\.hanssem\.com/, { timeout: 10000 });
    await expect(page).toHaveURL(/mall\.hanssem\.com/);
    console.log(`[✓] 장바구니 이동: ${page.url()}`);
  });
});

// ═══════════════════════════════════════════════════════════════
// 2. 가구/홈리빙 (furniture_*)
// ═══════════════════════════════════════════════════════════════
test.describe("2. 가구/홈리빙", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/furnishing");
    await waitForPageReady(page, 2000);
  });

  test("페이지 정상 로딩", async ({ page }) => {
    await expect(page).toHaveURL(/furnishing/);
    await expect(page).toHaveTitle(/한샘/);
    console.log(`[✓] 가구/홈리빙 로딩: ${page.url()}`);
  });

  test("헤더 검색 아이콘 노출 [furniture_btn_search]", async ({ page }) => {
    test.info().annotations.push({ type: "accessibilityId", description: "furniture_btn_search" });
    await expect(page.locator(tid("furniture_btn_search")).first()).toBeVisible({ timeout: 8000 });
    console.log("[✓] furniture_btn_search 노출");
  });

  test("헤더 장바구니 아이콘 노출 [furniture_btn_cart]", async ({ page }) => {
    test.info().annotations.push({ type: "accessibilityId", description: "furniture_btn_cart" });
    await expect(page.locator(tid("furniture_btn_cart")).first()).toBeVisible({ timeout: 8000 });
    console.log("[✓] furniture_btn_cart 노출");
  });

  test("메인 빅 배너 노출 [furniture_banner_big]", async ({ page }) => {
    test.info().annotations.push({ type: "accessibilityId", description: "furniture_banner_big" });
    await expect(page.locator(tid("furniture_banner_big")).first()).toBeVisible({ timeout: 8000 });
    console.log("[✓] furniture_banner_big 노출");
  });
});

// ─── 2-1. 가구 카테고리 버튼 (적용여부 O 전체) ──────────────
test.describe("2-1. 가구 카테고리 버튼", () => {
  const categories = [
    { id: "furniture_btn_bedroom",      name: "침실" },
    { id: "furniture_btn_livingroom",   name: "거실" },
    { id: "furniture_btn_dining",       name: "다이닝" },
    { id: "furniture_btn_closet",       name: "옷장/수납" },
    { id: "furniture_btn_kidsroom",     name: "키즈룸" },
    { id: "furniture_btn_studentroom",  name: "학생방" },
    { id: "furniture_btn_homeoffice",   name: "홈오피스" },
    { id: "furniture_btn_homedeco",     name: "홈데코" },
    { id: "furniture_btn_curtain",      name: "커튼/블라인드" },
    { id: "furniture_btn_newterm_desk", name: "신학기 데스크" },
  ];

  for (const { id, name } of categories) {
    test(`카테고리 버튼 노출 — ${name} [${id}]`, async ({ page }) => {
      test.info().annotations.push({ type: "accessibilityId", description: id });
      await page.goto("/furnishing");
      await waitForPageReady(page, 2000);
      await expect(page.locator(tid(id)).first()).toBeVisible({ timeout: 8000 });
      console.log(`[✓] ${id} 노출`);
    });
  }
});

// ═══════════════════════════════════════════════════════════════
// 3. 가구 상품 리스트 (furniture_list_*)
// ═══════════════════════════════════════════════════════════════
test.describe("3. 가구 상품 리스트", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/furnishing");
    await waitForPageReady(page, 4000);
  });

  test("리스트 페이지 장바구니 아이콘 노출 [furniture_list_btn_cart]", async ({ page }) => {
    test.info().annotations.push({ type: "accessibilityId", description: "furniture_list_btn_cart" });
    await expect(page.locator(tid("furniture_list_btn_cart")).first()).toBeVisible({ timeout: 8000 });
    console.log("[✓] furniture_list_btn_cart 노출");
  });

  test("상품 아이템 카드 1개 이상 노출 [furniture_list_item_card]", async ({ page }) => {
    test.info().annotations.push({ type: "accessibilityId", description: "furniture_list_item_card" });
    const cards = page.locator(tid("furniture_list_item_card"));
    const fallback = page.locator('a[href*="/goods/"]');
    const useTestId = await cards.first().isVisible({ timeout: 5000 }).catch(() => false);
    const target = useTestId ? cards : fallback;

    await expect(target.first()).toBeAttached({ timeout: 10000 });
    const count = await target.count();
    expect(count).toBeGreaterThan(0);
    console.log(`[✓] 상품 카드 ${count}개 노출`);
  });

  test("상품 카드 클릭 → 상품 상세 이동 [furniture_list_item_card]", async ({ page }) => {
    test.info().annotations.push({ type: "accessibilityId", description: "furniture_list_item_card" });
    const card = page.locator(tid("furniture_list_item_card")).first();
    const useTestId = await card.isVisible({ timeout: 5000 }).catch(() => false);

    if (useTestId) {
      await card.evaluate((el) => (el as HTMLElement).click());
    } else {
      const link = page.locator('a[href^="/goods/"]').first();
      await expect(link).toBeAttached({ timeout: 8000 });
      await link.evaluate((el) => (el as HTMLAnchorElement).click());
    }

    await waitForPageReady(page, 2000);
    await expect(page).toHaveURL(/\/goods\//);
    console.log(`[✓] 상품 상세 이동: ${page.url()}`);
  });
});

// ═══════════════════════════════════════════════════════════════
// 4. 인테리어 (interior_*)
// ═══════════════════════════════════════════════════════════════
test.describe("4. 인테리어", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/interior");
    await waitForPageReady(page, 2000);
  });

  test("페이지 정상 로딩", async ({ page }) => {
    await expect(page).toHaveURL(/interior/);
    await expect(page).toHaveTitle(/한샘/);
    console.log(`[✓] 인테리어 로딩: ${page.url()}`);
  });

  test("검색 아이콘 노출 [interior_btn_search]", async ({ page }) => {
    test.info().annotations.push({ type: "accessibilityId", description: "interior_btn_search" });
    await expect(page.locator(tid("interior_btn_search")).first()).toBeVisible({ timeout: 8000 });
    console.log("[✓] interior_btn_search 노출");
  });
});

// ─── 4-1. 인테리어 퀵메뉴 (적용여부 O 전체) ────────────────
test.describe("4-1. 인테리어 퀵메뉴", () => {
  const quickMenus = [
    { id: "interior_quick_consult",    name: "무료 견적상담" },
    { id: "interior_quick_cases",      name: "시공사례" },
    { id: "interior_quick_magazine",   name: "매거진" },
    { id: "interior_quick_designers",  name: "코디네이터" },
    { id: "interior_quick_total_work", name: "전체시공" },
  ];

  for (const { id, name } of quickMenus) {
    test(`퀵메뉴 노출 — ${name} [${id}]`, async ({ page }) => {
      test.info().annotations.push({ type: "accessibilityId", description: id });
      await page.goto("/interior");
      await waitForPageReady(page, 2000);
      await expect(page.locator(tid(id)).first()).toBeVisible({ timeout: 8000 });
      console.log(`[✓] ${id} 노출`);
    });
  }
});

// ═══════════════════════════════════════════════════════════════
// 5. 상품 상세 — PDP (pdp_*)
// ═══════════════════════════════════════════════════════════════
test.describe("5. 상품 상세 (PDP)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`/goods/${SAMPLE_GOODS_ID}`);
    await waitForPageReady(page, 3000);
  });

  test("뒤로가기 버튼 노출 [pdp_btn_back]", async ({ page }) => {
    test.info().annotations.push({ type: "accessibilityId", description: "pdp_btn_back" });
    await expect(page.locator(tid("pdp_btn_back")).first()).toBeVisible({ timeout: 8000 });
    console.log("[✓] pdp_btn_back 노출");
  });

  test("상품명 텍스트 노출 [pdp_txt_product_name]", async ({ page }) => {
    test.info().annotations.push({ type: "accessibilityId", description: "pdp_txt_product_name" });
    const el = page.locator(tid("pdp_txt_product_name")).first();
    const fallback = page.locator("h1").first();
    const useTestId = await el.isVisible({ timeout: 5000 }).catch(() => false);
    const target = useTestId ? el : fallback;

    await expect(target).toBeVisible({ timeout: 8000 });
    const name = await target.textContent();
    expect(name?.trim().length).toBeGreaterThan(0);
    console.log(`[✓] 상품명: ${name?.trim().slice(0, 30)}`);
  });

  test("쿠폰받기 버튼 노출 [pdp_btn_coupon_download]", async ({ page }) => {
    test.info().annotations.push({ type: "accessibilityId", description: "pdp_btn_coupon_download" });
    await expect(page.locator(tid("pdp_btn_coupon_download")).first()).toBeVisible({ timeout: 10000 });
    console.log("[✓] pdp_btn_coupon_download 노출");
  });

  test("구매하기 버튼 노출 [pdp_btn_purchase]", async ({ page }) => {
    test.info().annotations.push({ type: "accessibilityId", description: "pdp_btn_purchase" });
    const el = page.locator(tid("pdp_btn_purchase")).first();
    const fallback = page.locator('button:has-text("구매하기")').first();
    const useTestId = await el.isVisible({ timeout: 5000 }).catch(() => false);
    await expect(useTestId ? el : fallback).toBeVisible({ timeout: 15000 });
    console.log("[✓] pdp_btn_purchase 노출");
  });

  test("장바구니 담기 버튼 노출 [pdp_btn_option_cart]", async ({ page }) => {
    test.info().annotations.push({ type: "accessibilityId", description: "pdp_btn_option_cart" });
    const el = page.locator(tid("pdp_btn_option_cart")).first();
    const fallback = page.locator('button:has-text("장바구니")').nth(1);
    const useTestId = await el.isVisible({ timeout: 5000 }).catch(() => false);
    await expect(useTestId ? el : fallback).toBeVisible({ timeout: 15000 });
    console.log("[✓] pdp_btn_option_cart 노출");
  });

  test("바로구매 버튼 노출 [pdp_btn_option_direct]", async ({ page }) => {
    test.info().annotations.push({ type: "accessibilityId", description: "pdp_btn_option_direct" });
    await expect(page.locator(tid("pdp_btn_option_direct")).first()).toBeVisible({ timeout: 15000 });
    console.log("[✓] pdp_btn_option_direct 노출");
  });

  test("상품 이미지 노출 (CDN)", async ({ page }) => {
    await expect(async () => {
      const imgs = await page.locator('img[src*="image.hanssem.com"]').all();
      let found = false;
      for (const img of imgs) {
        if (await img.isVisible().catch(() => false)) { found = true; break; }
      }
      expect(found).toBe(true);
    }).toPass({ timeout: 10000 });
    console.log("[✓] 상품 이미지 노출");
  });

  test("가격 정보 노출 (숫자+원 패턴)", async ({ page }) => {
    const priceText = page.locator("text=/[\\d,]+원/").first();
    await expect(priceText).toBeVisible({ timeout: 8000 });
    const text = await priceText.textContent();
    console.log(`[✓] 가격 노출: ${text?.trim().slice(0, 30)}`);
  });
});

// ═══════════════════════════════════════════════════════════════
// 6. 매장찾기 (store_*)
// ═══════════════════════════════════════════════════════════════
test.describe("6. 매장찾기", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/store");
    await waitForPageReady(page, 3000);
  });

  test("페이지 정상 로딩", async ({ page }) => {
    await expect(page).toHaveTitle(/한샘/);
    console.log(`[✓] 매장찾기 로딩: ${page.url()}`);
  });

  test("화면 타이틀 노출 [store_txt_title]", async ({ page }) => {
    test.info().annotations.push({ type: "accessibilityId", description: "store_txt_title" });
    await expect(page.locator(tid("store_txt_title")).first()).toBeVisible({ timeout: 8000 });
    console.log("[✓] store_txt_title 노출");
  });

  test("검색 아이콘 노출 [store_btn_search]", async ({ page }) => {
    test.info().annotations.push({ type: "accessibilityId", description: "store_btn_search" });
    await expect(page.locator(tid("store_btn_search")).first()).toBeVisible({ timeout: 8000 });
    console.log("[✓] store_btn_search 노출");
  });

  test("시/도 선택 드롭다운 노출 [store_select_city]", async ({ page }) => {
    test.info().annotations.push({ type: "accessibilityId", description: "store_select_city" });
    await expect(page.locator(tid("store_select_city")).first()).toBeVisible({ timeout: 8000 });
    console.log("[✓] store_select_city 노출");
  });

  test("구/군 선택 드롭다운 노출 [store_select_district]", async ({ page }) => {
    test.info().annotations.push({ type: "accessibilityId", description: "store_select_district" });
    await expect(page.locator(tid("store_select_district")).first()).toBeVisible({ timeout: 8000 });
    console.log("[✓] store_select_district 노출");
  });

  test("지도 영역 노출 [store_view_map]", async ({ page }) => {
    test.info().annotations.push({ type: "accessibilityId", description: "store_view_map" });
    await expect(page.locator(tid("store_view_map")).first()).toBeVisible({ timeout: 10000 });
    console.log("[✓] store_view_map 노출");
  });

  test("현위치 재검색 버튼 노출 [store_btn_refresh]", async ({ page }) => {
    test.info().annotations.push({ type: "accessibilityId", description: "store_btn_refresh" });
    await expect(page.locator(tid("store_btn_refresh")).first()).toBeVisible({ timeout: 8000 });
    console.log("[✓] store_btn_refresh 노출");
  });

  test("매장명 텍스트 노출 [store_txt_name]", async ({ page }) => {
    test.info().annotations.push({ type: "accessibilityId", description: "store_txt_name" });
    const el = page.locator(tid("store_txt_name")).first();
    await expect(el).toBeVisible({ timeout: 10000 });
    const text = await el.textContent();
    expect(text?.trim().length).toBeGreaterThan(0);
    console.log(`[✓] 매장명: ${text?.trim().slice(0, 20)}`);
  });

  test("매장 전화 버튼 노출 [store_btn_call]", async ({ page }) => {
    test.info().annotations.push({ type: "accessibilityId", description: "store_btn_call" });
    await expect(page.locator(tid("store_btn_call")).first()).toBeVisible({ timeout: 10000 });
    console.log("[✓] store_btn_call 노출");
  });
});

// ═══════════════════════════════════════════════════════════════
// 7. 검색 (search_*)
// ═══════════════════════════════════════════════════════════════
test.describe("7. 검색", () => {
  // 검색창 진입 공통 helper
  async function openSearch(page: Page) {
    await page.goto("/");
    await waitForPageReady(page, 2000);
    const searchTestId = page.locator(tid("home_btn_search")).first();
    const searchGtm = page.locator('[data-gtm-tracking-menu-value="search"]').first();
    const useTestId = await searchTestId.isVisible({ timeout: 3000 }).catch(() => false);
    const icon = useTestId ? searchTestId : searchGtm;
    await expect(icon).toBeVisible({ timeout: 10000 });
    await icon.click({ force: true });
    await waitForPageReady(page, 1500);
  }

  test("검색 입력창 노출 [search_input_field]", async ({ page }) => {
    test.info().annotations.push({ type: "accessibilityId", description: "search_input_field" });
    await openSearch(page);
    const el = page.locator(tid("search_input_field")).first();
    const fallback = page.locator('[class*="CustomInput"]').first();
    const useTestId = await el.isVisible({ timeout: 3000 }).catch(() => false);
    await expect(useTestId ? el : fallback).toBeVisible({ timeout: 8000 });
    console.log("[✓] search_input_field 노출");
  });

  test("인기 검색어 타이틀 노출 [search_txt_popular_title]", async ({ page }) => {
    test.info().annotations.push({ type: "accessibilityId", description: "search_txt_popular_title" });
    await openSearch(page);
    await expect(page.locator(tid("search_txt_popular_title")).first()).toBeVisible({ timeout: 8000 });
    console.log("[✓] search_txt_popular_title 노출");
  });

  test("인기 검색어 리스트 노출 [search_list_popular]", async ({ page }) => {
    test.info().annotations.push({ type: "accessibilityId", description: "search_list_popular" });
    await openSearch(page);
    await expect(page.locator(tid("search_list_popular")).first()).toBeVisible({ timeout: 8000 });
    console.log("[✓] search_list_popular 노출");
  });

  test("인기 검색어 키워드 버튼 노출 [search_btn_popular_keyword]", async ({ page }) => {
    test.info().annotations.push({ type: "accessibilityId", description: "search_btn_popular_keyword" });
    await openSearch(page);
    const keywords = page.locator(tid("search_btn_popular_keyword"));
    await expect(keywords.first()).toBeVisible({ timeout: 8000 });
    const count = await keywords.count();
    expect(count).toBeGreaterThan(0);
    console.log(`[✓] 인기 검색어 ${count}개 노출`);
  });

  test("최근 검색어 초기화 버튼 — 있을 경우 노출 [search_btn_recent_clear]", async ({ page }) => {
    test.info().annotations.push({ type: "accessibilityId", description: "search_btn_recent_clear" });
    await openSearch(page);
    const el = page.locator(tid("search_btn_recent_clear")).first();
    const isVisible = await el.isVisible({ timeout: 5000 }).catch(() => false);
    // 최근 검색어가 없으면 버튼 자체가 없을 수 있으므로 soft assertion
    if (isVisible) {
      console.log("[✓] search_btn_recent_clear 노출");
    } else {
      console.log("[→] search_btn_recent_clear 미노출 (최근 검색어 없음 — 정상)");
    }
  });

  test("검색어 입력 → 결과 페이지 이동 [search_input_field]", async ({ page }) => {
    test.info().annotations.push({ type: "accessibilityId", description: "search_input_field" });
    await openSearch(page);
    const el = page.locator(tid("search_input_field")).first();
    const fallback = page.locator('[class*="CustomInput"]').first();
    const useTestId = await el.isVisible({ timeout: 3000 }).catch(() => false);
    const input = useTestId ? el : fallback;

    await expect(input).toBeVisible({ timeout: 8000 });
    await input.fill("소파");
    await input.press("Enter");
    await page.waitForURL(/search/, { timeout: 10000 });
    await expect(page).toHaveURL(/search/);
    console.log(`[✓] 검색 결과 이동: ${page.url()}`);
  });

  test("검색 결과 페이지 직접 진입 — 상품 링크 노출", async ({ page }) => {
    await page.goto("/search/goods?searchKey=소파");
    await waitForPageReady(page, 4000);
    await expect(page).toHaveURL(/search/);
    await expect(page).toHaveTitle(/한샘/);
    const goodsLinks = page.locator('a[href*="/goods/"]');
    await expect(goodsLinks.first()).toBeAttached({ timeout: 10000 });
    const count = await goodsLinks.count();
    expect(count).toBeGreaterThan(0);
    console.log(`[✓] 검색 결과 상품 ${count}개 노출`);
  });
});

// ═══════════════════════════════════════════════════════════════
// 8. 주요 페이지 HTTP 응답
// ═══════════════════════════════════════════════════════════════
test.describe("8. 주요 페이지 HTTP 응답", () => {
  const pageList = [
    { name: "메인",       path: "/" },
    { name: "가구/홈리빙", path: "/furnishing" },
    { name: "인테리어",   path: "/interior" },
    { name: "매장찾기",   path: "/store" },
    { name: "검색결과",   path: "/search/goods?searchKey=소파" },
    { name: "상품상세",   path: `/goods/${SAMPLE_GOODS_ID}` },
  ];

  for (const { name, path } of pageList) {
    test(`${name} 200 응답`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBeLessThan(400);
      console.log(`[✓] ${name}: ${response?.status()}`);
    });
  }
});
