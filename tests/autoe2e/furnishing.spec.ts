import { test, expect } from '@playwright/test';

const BASE = process.env.BASE_URL || 'https://store.hanssem.com';

const isMobile = (page: import('@playwright/test').Page) =>
  (page.viewportSize()?.width ?? 1280) < 600;

test.describe('홈퍼니싱 페이지', () => {
  test('TC005 - 홈퍼니싱 메인 페이지 로드', async ({ page }) => {
    await page.goto(`${BASE}/furnishing`);
    await expect(page).toHaveTitle(/홈퍼니싱|한샘/);
    await expect(page.locator('h2:has-text("이 주의 한샘몰 특가")')).toBeVisible();
    if (!isMobile(page)) {
      await expect(page.locator('h2:has-text("TOP 인기 상품")')).toBeVisible();
    }
  });

  test('TC006 - 더보기 버튼 표시 확인', async ({ page }) => {
    await page.goto(`${BASE}/furnishing`);
    await expect(page.locator('button:has-text("더보기")').first()).toBeVisible();
  });

  test('베스트셀러 섹션 노출', async ({ page }) => {
    if (isMobile(page)) { test.skip(); return; }
    await page.goto(`${BASE}/furnishing`);
    await expect(page.locator('h2:has-text("베스트셀러")')).toBeVisible();
  });

  test('신상품 섹션 노출', async ({ page }) => {
    if (isMobile(page)) { test.skip(); return; }
    await page.goto(`${BASE}/furnishing`);
    await expect(page.locator('h2:has-text("신상품")')).toBeVisible();
  });

  test('1분 홈투어 섹션 노출', async ({ page }) => {
    if (isMobile(page)) { test.skip(); return; }
    await page.goto(`${BASE}/furnishing`);
    await expect(page.locator('h2:has-text("1분 홈투어")')).toBeVisible();
  });

  test('베스트셀러 더보기 → /furnishing/RANK 이동', async ({ page }) => {
    await page.goto(`${BASE}/furnishing`);
    const rankLink = page.locator('a[href*="/furnishing/RANK"]').first();
    if (await rankLink.isVisible()) {
      await rankLink.click();
      await expect(page).toHaveURL(/furnishing\/RANK/);
    }
  });
});
