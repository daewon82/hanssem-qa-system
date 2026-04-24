import { test, expect } from '@playwright/test';
import { NavigationPage, STORE_BASE } from './pages';

const BASE = STORE_BASE;

// 레거시 호환 - 신규 테스트는 NavigationPage 사용 권장
const GNB = (text: string) =>
  `a[data-gtm-tracking="mall_gnb_category_depth1_button"]:has-text("${text}")`;

const isMobile = (page: import('@playwright/test').Page) =>
  (page.viewportSize()?.width ?? 1280) < 600;

test.describe('GNB 네비게이션', () => {
  test('TC001 - 메인 홈 페이지 정상 로드', async ({ page }) => {
    const nav = new NavigationPage(page);
    await page.goto('/');
    await expect(page).toHaveTitle(/한샘몰/);
    if (!nav.isMobile) {
      await expect(nav.gnbLink('침실')).toBeAttached();
      await expect(nav.searchInput).toBeAttached();
    }
  });

  test('TC002 - GNB 침실 카테고리 이동', async ({ page }) => {
    await page.goto(`${BASE}/category/20070`);
    await expect(page).toHaveURL(/category\/20070/);
    await expect(page.locator('h1')).toContainText('침실');
  });

  test('TC003 - GNB 거실 카테고리 이동', async ({ page }) => {
    await page.goto(`${BASE}/category/20071`);
    await expect(page).toHaveURL(/category\/20071/);
    await expect(page.locator('h1')).toContainText('거실');
  });

  test('TC016 - 카테고리 페이지 내 GNB 링크 존재 @pc-only', async ({ page }) => {
    await page.goto(`${BASE}/category/20070`);
    await expect(page.locator(GNB('침실'))).toBeAttached();
    await expect(page.locator(GNB('거실'))).toBeAttached();
    await expect(page.locator(GNB('다이닝'))).toBeAttached();
    await expect(page.locator(GNB('홈오피스'))).toBeAttached();
    await expect(page.locator(GNB('홈&데코'))).toBeAttached();
  });

  test('GNB - 다이닝 카테고리 이동', async ({ page }) => {
    await page.goto(`${BASE}/category/20072`);
    await expect(page.locator('h1')).toContainText('다이닝');
  });

  test('GNB - 키즈룸 카테고리 이동', async ({ page }) => {
    await page.goto(`${BASE}/category/20074`);
    await expect(page.locator('h1')).toContainText('키즈룸');
  });

  test('GNB - 학생방 카테고리 이동', async ({ page }) => {
    await page.goto(`${BASE}/category/20075`);
    await expect(page.locator('h1')).toContainText('학생방');
  });

  test('GNB - 홈오피스 카테고리 이동', async ({ page }) => {
    await page.goto(`${BASE}/category/20076`);
    await expect(page.locator('h1')).toContainText('홈오피스');
  });

  test('GNB - 홈&데코 카테고리 이동', async ({ page }) => {
    await page.goto(`${BASE}/category/20077`);
    await expect(page.locator('h1')).toContainText('홈&데코');
  });

});
