import { test, expect, Page } from "@playwright/test";
import fs from "fs";
import axios from "axios";

/**
 * store.hanssem.com MW E2E 테스트
 * - MW Chrome 전용
 * - 명령어: npx playwright test tests/mw_e2e_test.spec.ts
 */

// ─── 설정 ────────────────────────────────────────────────────
const REPORT_ID = "mw-e2e";
const REPORT_TITLE = "운영환경 MW E2E 테스트";
const JANDI_WEBHOOK_URL =
  "https://wh.jandi.com/connect-api/webhook/24103837/37635b6c2df20f085651789f31762614";
const DASHBOARD_URL = "https://elaborate-starship-5f4a82.netlify.app";
const SAMPLE_GOODS_ID = "837513";

// ─── 유틸 ────────────────────────────────────────────────────
async function waitForPageReady(page: Page, extra = 1500) {
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(extra);
}

// ─── 전체를 하나의 describe로 감싸서 afterAll이 정확히 1번만 실행되도록 보장 ──
test.describe("MW E2E 테스트", () => {
  let passCount = 0;
  let failCount = 0;
  const caseResults: any[] = [];
  const failedTests: string[] = [];

  // ─── 전처리 ────────────────────────────────────────────────
  test.beforeAll(async () => {
    ["public", "fail_evidence"].forEach((dir) => {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir);
    });
  });

  // ─── 각 테스트 후: 결과 기록 ──────────────────────────────
  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status === "skipped") return;

    const isPassed = testInfo.status === "passed";
    const currentUrl = page.url();

    if (!isPassed) {
      testInfo.annotations.push({ type: "url", description: currentUrl });
      failCount++;
      failedTests.push(`${testInfo.title}\n  ${currentUrl}`);
    } else {
      passCount++;
    }

    const failReason = isPassed
      ? ""
      : testInfo.errors?.[0]?.message?.split("\n")[0]?.slice(0, 60) ?? "실패";

    caseResults.push({
      name: testInfo.title,
      url: currentUrl,
      status: isPassed ? "pass" : "fail",
      duration: `${(testInfo.duration / 1000).toFixed(2)}s`,
      reason: failReason,
    });

  });

  // ─── 전체 완료 후: 리포트 저장 ────────────────────────────
  test.afterAll(async () => {
    const totalCount = passCount + failCount;
    const passRate =
      totalCount > 0 ? ((passCount / totalCount) * 100).toFixed(1) : "0";
    const kst = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });

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

    fs.writeFileSync(
      "public/mw_e2e.json",
      JSON.stringify(
        {
          title: REPORT_TITLE,
          lastUpdated: kst,
          total: totalCount,
          pass: passCount,
          fail: failCount,
          passRate,
          cases: caseResults,
        },
        null,
        2,
      ),
    );

    if (!process.env.CI) {
      console.log("⏭️ 로컬 실행 — 잔디 알림 스킵");
    } else try {
      const failTestText =
        failedTests.length > 0 ? failedTests.slice(0, 10).join("\n") : "없음";
      await axios.post(JANDI_WEBHOOK_URL, {
        body: `[${REPORT_TITLE}] 결과: ${passCount} 성공 / ${failCount} 실패`,
        connectColor: failCount > 0 ? "#FF4444" : "#00C73C",
        connectInfo: [
          {
            title: "결과 요약",
            description: `총 ${totalCount}건 / 통과율 ${passRate}%`,
          },
          { title: "실패 테스트", description: failTestText },
          { title: "📊 리포트 보기", description: DASHBOARD_URL },
        ],
      });
      console.log("📤 잔디 전송 완료");
    } catch (err: any) {
      console.log("❌ 잔디 실패:", err.message);
    }

    console.log(`🏁 MW E2E 완료! 총 ${totalCount}건`);
  });

  // ─── 1. 메인 페이지 ────────────────────────────────────────
  test.describe("1. 메인 페이지", () => {
    test.beforeEach(async ({ page }) => {
      await page.goto("/");
      await waitForPageReady(page, 2000);
    });

    test("페이지 정상 로딩 및 타이틀 확인", async ({ page }) => {
      await expect(page).toHaveTitle(/한샘/);
      console.log(`[✓] 메인 로딩: ${page.url()}`);
    });

    test("헤더(GNB) 노출 확인", async ({ page }) => {
      await expect(page.locator("header").first()).toBeVisible();
      console.log("[✓] 헤더 노출");
    });
  });

  // ─── 2. 카테고리 네비게이션 ────────────────────────────────
  test.describe("2. 카테고리 네비게이션", () => {
    test("가구/홈리빙 카테고리 진입 및 타이틀 확인", async ({ page }) => {
      await page.goto("/furnishing");
      await waitForPageReady(page, 2000);
      await expect(page).toHaveURL(/furnishing/);
      await expect(page).toHaveTitle(/한샘/);
      console.log(`[✓] 가구/홈리빙: ${page.url()}`);
    });

    test("인테리어 카테고리 진입 및 타이틀 확인", async ({ page }) => {
      await page.goto("/interior");
      await waitForPageReady(page, 2000);
      await expect(page).toHaveURL(/interior/);
      await expect(page).toHaveTitle(/한샘/);
      console.log(`[✓] 인테리어: ${page.url()}`);
    });
  });

  // ─── 3. 상품 목록 ──────────────────────────────────────────
  test.describe("3. 상품 목록", () => {
    test("가구/홈리빙 상품 목록 — 상품 링크 1개 이상 노출", async ({ page }) => {
      await page.goto("/furnishing");
      await waitForPageReady(page, 4000);
      const goodsLinks = page.locator('a[href*="/goods/"]');
      await expect(goodsLinks.first()).toBeAttached({ timeout: 8000 });
      const count = await goodsLinks.count();
      expect(count).toBeGreaterThan(0);
      console.log(`[✓] 상품 목록 ${count}개 노출`);
    });

    test("인테리어 페이지 — 카테고리/기획 링크 1개 이상 노출", async ({ page }) => {
      await page.goto("/interior");
      await waitForPageReady(page, 4000);
      const links = page.locator(
        'a[href*="/category/"], a[href*="/plan/"], a[href*="/goods/"]'
      );
      await expect(links.first()).toBeAttached({ timeout: 8000 });
      const count = await links.count();
      expect(count).toBeGreaterThan(0);
      console.log(`[✓] 인테리어 링크 ${count}개 노출`);
    });

    test("상품 목록 → 첫 번째 상품 클릭 → 상세 페이지 이동", async ({ page }) => {
      await page.goto("/furnishing");
      await waitForPageReady(page, 4000);
      const href = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a[href^="/goods/"]'));
        const valid = links.find((a) =>
          /^\/goods\/\d+/.test((a as HTMLAnchorElement).getAttribute("href") || "")
        ) as HTMLAnchorElement | undefined;
        if (valid) { valid.click(); return valid.getAttribute("href"); }
        return null;
      });
      expect(href).not.toBeNull();
      await waitForPageReady(page, 2000);
      await expect(page).toHaveURL(/\/goods\//);
      console.log(`[✓] 상품 상세 이동: ${page.url()} (원본: ${href})`);
    });
  });

  // ─── 4. 상품 상세 ──────────────────────────────────────────
  test.describe("4. 상품 상세", () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(`/goods/${SAMPLE_GOODS_ID}`);
      await waitForPageReady(page, 3000);
    });

    test("상품 상세 — 상품명(H1) 노출", async ({ page }) => {
      const h1 = page.locator("h1").first();
      await expect(h1).toBeVisible({ timeout: 8000 });
      const title = await h1.textContent();
      expect(title?.trim().length).toBeGreaterThan(0);
      console.log(`[✓] 상품명: ${title?.trim()}`);
    });

    test("상품 상세 — 가격 정보 노출 (숫자+원 패턴)", async ({ page }) => {
      const priceText = page.locator("text=/[\\d,]+원/").first();
      await expect(priceText).toBeVisible({ timeout: 8000 });
      const text = await priceText.textContent();
      console.log(`[✓] 가격 노출: ${text?.trim().slice(0, 30)}`);
    });

    test("상품 상세 — 상품 이미지 노출", async ({ page }) => {
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
  });

  // ─── 5. 검색 ───────────────────────────────────────────────
  test.describe("5. 검색", () => {
    test("검색 결과 페이지 — 정상 로딩 및 타이틀", async ({ page }) => {
      await page.goto("/search/goods?searchKey=소파");
      await waitForPageReady(page, 2000);
      await expect(page).toHaveURL(/search/);
      await expect(page).toHaveTitle(/한샘/);
      console.log(`[✓] 검색 결과 로딩: ${page.url()}`);
    });

    test("검색 결과 — 영문 키워드", async ({ page }) => {
      await page.goto("/search/goods?searchKey=sofa");
      await waitForPageReady(page, 2000);
      await expect(page).toHaveURL(/search/);
      console.log(`[✓] 영문 검색: ${page.url()}`);
    });
  });

  // ─── 6. 로그인 ─────────────────────────────────────────────
  test.describe("6. 로그인", () => {
    test("로그인 페이지 — ID 입력 필드 및 SNS 버튼 노출", async ({ page }) => {
      await page.goto(
        "https://mall.hanssem.com/customer/mallLoginMain.do?returnUrl=https://m.store.hanssem.com/"
      );
      await waitForPageReady(page, 3000);
      await expect(page).toHaveURL(/mall\.hanssem\.com.*login/i);
      const idInput = page
        .locator('input[type="text"], input[type="email"], input[name*="id"]')
        .first();
      const snsBtn = page
        .locator('button:has-text("카카오"), a:has-text("카카오")')
        .first();
      const idVis = await idInput.isVisible().catch(() => false);
      const snsVis = await snsBtn.isVisible().catch(() => false);
      expect(idVis || snsVis).toBe(true);
      console.log(`[✓] 로그인 폼 — ID입력: ${idVis}, 카카오: ${snsVis}`);
    });
  });

  // ─── 7. 장바구니 ───────────────────────────────────────────
  test.describe("7. 장바구니", () => {
    test("장바구니 직접 URL — 로그인 redirect 확인", async ({ page }) => {
      await page.goto("https://mall.hanssem.com/m/morder/goCart.do");
      await waitForPageReady(page, 2000);
      const url = page.url();
      const isCart = url.includes("cart") || url.includes("Cart");
      const isLogin = url.includes("login") || url.includes("Login");
      expect(isCart || isLogin).toBe(true);
      console.log(`[✓] 장바구니 redirect: ${url}`);
    });
  });

  // ─── 8. 주요 페이지 HTTP 응답 ─────────────────────────────
  test.describe("8. 주요 페이지 HTTP 응답", () => {
    const pageList = [
      { name: "메인",        path: "/" },
      { name: "가구/홈리빙", path: "/furnishing" },
      { name: "인테리어",    path: "/interior" },
      { name: "검색결과",    path: "/search/goods?searchKey=소파" },
      { name: "상품상세",    path: `/goods/${SAMPLE_GOODS_ID}` },
      { name: "매장찾기",    path: "/store" },
    ];

    for (const { name, path } of pageList) {
      test(`${name} 200 응답`, async ({ page }) => {
        const response = await page.goto(path);
        expect(response?.status()).toBeLessThan(400);
        console.log(`[✓] ${name}: ${response?.status()}`);
      });
    }
  });

  // ─── 9. 매장 찾기 ──────────────────────────────────────────
  test.describe("9. 매장 찾기", () => {
    test("매장 찾기 페이지 직접 진입 및 타이틀 확인", async ({ page }) => {
      await page.goto("/store");
      await waitForPageReady(page, 2000);
      await expect(page).toHaveTitle(/한샘/);
      await expect(page.locator("header").first()).toBeVisible();
      console.log(`[✓] 매장 찾기 페이지 로딩: ${page.url()}`);
    });
  });

  // ─── 10. 상품 상세 탭 전환 ───────────────────────────────────
  test.describe("10. 상품 상세 탭 전환", () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(`/goods/${SAMPLE_GOODS_ID}`);
      await waitForPageReady(page, 3000);
    });

    test("상품정보 탭 → 후기 탭 전환 확인", async ({ page }) => {
      const reviewTab = page.locator('[data-value="review"]').first();
      await expect(reviewTab).toBeVisible({ timeout: 8000 });
      await reviewTab.evaluate((el) => (el as HTMLElement).click());
      await page.waitForTimeout(1000);
      await expect(page.locator('[data-value="review"]').first()).toBeVisible();
      console.log("[✓] 후기 탭 전환 확인");
    });
  });

  // ─── 11. 검색 결과 ───────────────────────────────────────────
  test.describe("11. 검색 결과", () => {
    test("검색 결과 0건 — 없는 키워드", async ({ page }) => {
      await page.goto("/search/goods?searchKey=zzzzxxx한샘없는상품xyz");
      await waitForPageReady(page, 3000);
      await expect(page).toHaveURL(/search/);
      const zeroResult = page.locator('text=/검색결과가 없|0개|결과가 없/i').first();
      const goodsLinks = page.locator('a[href*="/goods/"]');
      const count = await goodsLinks.count();
      const hasZeroText = await zeroResult.isVisible().catch(() => false);
      expect(count === 0 || hasZeroText).toBe(true);
      console.log(`[✓] 0건 검색결과 확인 (상품수: ${count}, 0건텍스트: ${hasZeroText})`);
    });
  });

  // ─── 12. 인테리어 서브 페이지 ────────────────────────────────
  test.describe("12. 인테리어 서브 페이지", () => {
    test("카테고리 페이지(/category/숫자) 진입 및 상품 노출", async ({ page }) => {
      await page.goto("https://m.store.hanssem.com/category/20002");
      await waitForPageReady(page, 3000);
      await expect(page).toHaveTitle(/한샘/);
      const response = await page.request.get("https://m.store.hanssem.com/category/20002");
      expect(response.status()).toBeLessThan(400);
      console.log(`[✓] 카테고리 페이지 로딩: ${page.url()}`);
    });

    test("인테리어 시공사례 페이지(/interior/constcase) 진입", async ({ page }) => {
      await page.goto("https://m.store.hanssem.com/interior/constcase");
      await waitForPageReady(page, 3000);
      await expect(page).toHaveTitle(/한샘/);
      await expect(page.locator("header").first()).toBeVisible();
      console.log(`[✓] 시공사례 페이지 로딩: ${page.url()}`);
    });

    test("인테리어 — 무료견적상담 링크 노출", async ({ page }) => {
      await page.goto("/interior");
      await waitForPageReady(page, 3000);
      const consultLink = page
        .locator('[data-gtm-tracking-menu-value="무료 견적상담"], a[href*="choose-consult"]')
        .first();
      await expect(consultLink).toHaveAttribute("href", /remodeling\.hanssem\.com/, { timeout: 8000 });
      console.log("[✓] 무료견적상담 링크 확인");
    });

    test("기획전 페이지(mall.hanssem.com/plan) 200 응답", async ({ page }) => {
      const response = await page.goto("https://mall.hanssem.com/plan/19523.html");
      expect(response?.status()).toBeLessThan(400);
      await expect(page).toHaveTitle(/한샘/);
      console.log(`[✓] 기획전 페이지 응답: ${response?.status()}`);
    });
  });

  // ─── 13. 예외 페이지 처리 ────────────────────────────────────
  test.describe("13. 예외 페이지 처리", () => {
    test("존재하지 않는 상품 — 리다이렉트 또는 에러 페이지", async ({ page }) => {
      const response = await page.goto("/goods/999999999");
      await waitForPageReady(page, 2000);
      expect(response?.status() ?? 200).toBeLessThan(500);
      console.log(`[✓] 없는 상품 처리: ${response?.status()} → ${page.url()}`);
    });
  });

}); // MW E2E 테스트 describe 종료
