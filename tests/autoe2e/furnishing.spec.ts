import { test, expect } from './fixtures';
import { gotoWithRetry } from './helpers/gotoRetry';

// 빈 값: Playwright baseURL(프로젝트별: PC store / MW m.store) 자동 사용
const BASE = '';

const isMobile = (page: import('@playwright/test').Page) =>
  (page.viewportSize()?.width ?? 1280) < 600;

test.describe('홈퍼니싱 페이지', () => {
  test('TC005 - 홈퍼니싱 메인 페이지 로드', async ({ page }) => {
    await gotoWithRetry(page, `${BASE}/furnishing`);
    await expect(page).toHaveTitle(/홈퍼니싱|한샘/);
    await expect(page.locator('h2:has-text("이 주의 한샘몰 특가")')).toBeVisible();
    if (!isMobile(page)) {
      await expect(page.locator('h2:has-text("TOP 인기 상품")')).toBeVisible();
    }
  });

  test('TC006 - 더보기 버튼 표시 확인', async ({ page }) => {
    await gotoWithRetry(page, `${BASE}/furnishing`);
    await expect(page.locator('button:has-text("더보기")').first()).toBeVisible();
  });

  test('베스트셀러 섹션 노출 @pc-only', async ({ page }) => {
    await gotoWithRetry(page, `${BASE}/furnishing`);
    // 🔧 근본 수정: 고정 sleep 제거, DOM 렌더 완료까지 폴링
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
    // 텍스트 부분 매칭 + 폴링 (fragile selector 완화)
    await page.waitForFunction(
      () => {
        const headings = Array.from(document.querySelectorAll('h2, h3'));
        return headings.some((h) => /베스트셀러|BEST|인기 ?상품/i.test(h.textContent || ''));
      },
      { timeout: 15000 }
    );
  });

  test('신상품 섹션 노출 @pc-only', async ({ page }) => {
    await gotoWithRetry(page, `${BASE}/furnishing`);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
    await page.waitForFunction(
      () => {
        const headings = Array.from(document.querySelectorAll('h2, h3'));
        return headings.some((h) => /신상품|NEW|신규/i.test(h.textContent || ''));
      },
      { timeout: 15000 }
    );
  });

  test('1분 홈투어 섹션 노출 @pc-only', async ({ page }) => {
    await gotoWithRetry(page, `${BASE}/furnishing`);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
    await page.waitForFunction(
      () => {
        const headings = Array.from(document.querySelectorAll('h2, h3'));
        return headings.some((h) => /1분 ?홈투어|홈투어|HomeTour/i.test(h.textContent || ''));
      },
      { timeout: 15000 }
    );
  });

  test('베스트셀러 더보기 → /furnishing/RANK 이동', async ({ page }) => {
    await gotoWithRetry(page, `${BASE}/furnishing`);
    const rankLink = page.locator('a[href*="/furnishing/RANK"]').first();
    if (await rankLink.isVisible()) {
      await rankLink.click();
      await expect(page).toHaveURL(/furnishing\/RANK/);
    }
  });
});
