import { test, expect } from '@playwright/test';

const STORE_SEARCH = 'https://remodeling.hanssem.com/shop/search';

test.describe('매장 검색', () => {
  test('매장찾기 페이지 진입', async ({ page }) => {
    await page.goto(STORE_SEARCH, { waitUntil: 'domcontentloaded' });
    expect(page.url()).toContain('remodeling.hanssem.com/shop');
  });

  test('매장찾기 - 매장/지역 키워드 노출', async ({ page }) => {
    await page.goto(STORE_SEARCH, { waitUntil: 'domcontentloaded' });
    const storeKeyword = page.locator('text=/매장|대리점|전시장|지점/').first();
    await expect(storeKeyword).toBeAttached({ timeout: 15000 });
  });
});
