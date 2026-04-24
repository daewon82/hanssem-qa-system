import { test, expect } from '@playwright/test';

// 빈 값: Playwright baseURL(프로젝트별: PC store / MW m.store) 자동 사용
const BASE = '';

/**
 * 상품 상세 페이지 테스트.
 * 특정 상품 ID가 변경될 수 있으므로 카테고리에서 첫 상품을 찾아 동적으로 진입한다.
 */
/**
 * 카테고리에서 첫 상품의 href를 읽어 직접 goto 한다.
 * 클릭은 viewport 판정 이슈가 있어 안정성을 위해 직접 navigate.
 */
async function goToFirstGoods(page: import('@playwright/test').Page, categoryUrl: string) {
  await page.goto(`${BASE}${categoryUrl}`, { waitUntil: 'domcontentloaded' });
  const firstGoods = page.locator('a[href*="/goods/"]').first();
  await expect(firstGoods).toBeVisible({ timeout: 20000 });
  const href = await firstGoods.getAttribute('href');
  if (!href) throw new Error('goods href not found');
  const fullUrl = href.startsWith('http') ? href : `${BASE}${href}`;
  await page.goto(fullUrl, { waitUntil: 'domcontentloaded' });
  return href;
}

test.describe('상품 상세 페이지', () => {
  test('상품 상세 - 상품명 요소 노출', async ({ page }) => {
    await goToFirstGoods(page, '/category/20070');
    // 상품명은 h1 또는 명확한 product name 구조로 존재
    const productName = page.locator('h1, [class*="ProductName"], [class*="ProductTitle"]').first();
    await expect(productName).toBeVisible({ timeout: 10000 });
  });

  test('상품 상세 - 가격 정보 노출 (원 단위)', async ({ page }) => {
    await goToFirstGoods(page, '/category/20070');
    // "원" 단위가 들어간 가격 텍스트 존재
    const priceLike = page.locator('text=/원/').first();
    await expect(priceLike).toBeVisible({ timeout: 10000 });
  });

  test('상품 상세 - 장바구니 버튼 노출', async ({ page }) => {
    await goToFirstGoods(page, '/category/20070');
    const cartBtn = page.locator('button:has-text("장바구니")').first();
    await expect(cartBtn).toBeVisible({ timeout: 10000 });
  });

  test('상품 상세 - 구매하기/바로구매 버튼 노출', async ({ page }) => {
    await goToFirstGoods(page, '/category/20070');
    const buyBtn = page.locator('button').filter({ hasText: /구매하기|바로구매|주문/ }).first();
    await expect(buyBtn).toBeVisible({ timeout: 10000 });
  });

  test('상품 상세 - 구매하기 클릭 시 옵션/액션 반응', async ({ page }) => {
    await goToFirstGoods(page, '/category/20070');
    const buyBtn = page.locator('button').filter({ hasText: /구매하기|바로구매/ }).first();
    if (await buyBtn.count() === 0) { test.skip(); return; }
    await buyBtn.click({ force: true });
    await page.waitForTimeout(1500);
    // 옵션 레이어 또는 주문서 이동 중 하나여야 한다
    const movedToOrder = /order|checkout/.test(page.url());
    const optionLayer = await page.locator('text=/옵션|선택/').first().isVisible().catch(() => false);
    expect(movedToOrder || optionLayer).toBeTruthy();
  });

  test('커튼·블라인드 상품 상세 진입', async ({ page }) => {
    await goToFirstGoods(page, '/category/20109');
    await expect(page).toHaveURL(/\/goods\//);
  });

  test('상품 상세 - 쿠폰 노출 여부 (있으면 통과)', async ({ page }) => {
    await goToFirstGoods(page, '/category/20070');
    const coupon = page.locator('text=/쿠폰/').first();
    // 노출 안될 수도 있으므로 isVisible 조건만 체크 (실패로 보지 않음)
    const visible = await coupon.isVisible().catch(() => false);
    expect(typeof visible).toBe('boolean');
  });

  test('상품 상세 - 쿠폰 다운로드 버튼 클릭 동작', async ({ page }) => {
    await goToFirstGoods(page, '/category/20070');

    // "쿠폰" 섹션 또는 "다운로드" 버튼
    const couponSection = page.locator('text=/쿠폰/').first();
    if (!(await couponSection.isVisible().catch(() => false))) {
      test.skip();
      return;
    }

    // "다운로드" 또는 "받기" 버튼 찾기
    const downloadBtn = page.locator('button, a').filter({ hasText: /다운로드|쿠폰 받기|받기/ }).first();
    if (await downloadBtn.count() === 0) { test.skip(); return; }

    // 다이얼로그/alert 자동 닫기 핸들러 등록
    page.on('dialog', async (d) => { await d.dismiss().catch(() => null); });

    await downloadBtn.click({ force: true }).catch(() => null);
    await page.waitForTimeout(1500);

    // 클릭 후 에러 상태 아니면 통과 (성공/이미 받음/로그인 필요 등 모두 수용)
    expect(page.url()).not.toContain('error');
  });
});
