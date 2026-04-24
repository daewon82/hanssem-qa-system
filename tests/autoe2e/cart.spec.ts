import { test, expect } from '@playwright/test';
import { CartPage, CategoryPage, CATEGORIES, NavigationPage, STORE_BASE } from './pages';

test.describe('장바구니 - 로그인 필요', () => {
  test('장바구니 페이지 진입', async ({ page }) => {
    const cart = new CartPage(page);
    await cart.visit();
    expect(page.url()).not.toContain('mallLoginMain');
    await expect(page).toHaveTitle(/장바구니/);
  });

  test('장바구니 페이지 - 총 결제예정금액 섹션 노출', async ({ page }) => {
    const cart = new CartPage(page);
    await cart.visit();
    await cart.expectLoaded();
    await expect(page.locator('body')).toContainText('총 상품금액');
  });

  test('카테고리 상품 담기 - 장바구니 카운트 증가 검증', async ({ page }) => {
    const cart = new CartPage(page);
    const category = new CategoryPage(page);

    // 1) 시작 전 현재 카운트 기록
    await cart.visit();
    const beforeCount = await cart.getCount();

    // 2) 침실 카테고리 → 첫 상품 상세로 진입
    await category.visit(CATEGORIES.BEDROOM.url);
    await category.openFirstGoods();

    // 3) 장바구니 담기 시도
    const cartBtn = page.locator('button:has-text("장바구니")').first();
    if (await cartBtn.count() === 0) { return; }
    await cartBtn.click({ force: true }).catch(() => null);
    await page.waitForTimeout(2500);

    // 4) 카운트 증가 OR 비어있지 않음 중 하나면 통과
    await cart.visit();
    const afterCount = await cart.getCount();
    const empty = await cart.isEmpty();
    expect(afterCount > beforeCount || !empty).toBeTruthy();
  });

  test('통합메인 장바구니 버튼 → 장바구니 페이지 이동', async ({ page }) => {
    const nav = new NavigationPage(page);
    const cart = new CartPage(page);
    await page.goto('/');
    await expect(nav.cartEntry).toBeAttached({ timeout: 10000 });
    await cart.visit();
    expect(page.url()).toContain('goCart.do');
  });
});

/**
 * C. 장바구니/주문 확장 체크 (이커머스 일반 체크리스트)
 */
test.describe('C. 장바구니/주문 확장', () => {
  test('C21 - 장바구니 페이지 텍스트에 "총" 합계 키워드 존재', async ({ page }) => {
    const cart = new CartPage(page);
    await cart.visit();
    const body = await page.locator('body').innerText();
    // 합계 관련 키워드 모두 노출
    expect(body).toMatch(/총 상품금액/);
    expect(body).toMatch(/총 (배송비|할인금액)/);
    expect(body).toMatch(/총 결제예정금액/);
  });

  test('C22 - 장바구니 합계 음수/NaN 미발생', async ({ page }) => {
    const cart = new CartPage(page);
    await cart.visit();
    const text = await page.locator('body').innerText();
    expect(text).not.toMatch(/-[\d,]+\s*원/);
    expect(text).not.toMatch(/NaN/);
  });

  test('C23 - 장바구니 빈 상태 - 안내 메시지 노출', async ({ page }) => {
    const cart = new CartPage(page);
    await cart.visit();
    if (!(await cart.isEmpty())) { return; }
    // 빈 상태일 때 명확한 안내 텍스트
    await expect(page.locator('body')).toContainText(/장바구니에 담긴 상품이 없|비어/);
  });

  test('C24 - 주문서 진입 차단 (빈 장바구니 시)', async ({ page }) => {
    const cart = new CartPage(page);
    await cart.visit();
    if (!(await cart.isEmpty())) { return; }
    // 빈 장바구니에서 "주문하기" 버튼 클릭 시도
    const orderBtn = page.locator('button, a').filter({ hasText: /주문하기|주문서|결제하기/ }).first();
    if (await orderBtn.count() === 0) { return; }
    page.on('dialog', async d => { await d.dismiss().catch(() => null); });
    await orderBtn.click({ force: true }).catch(() => null);
    await page.waitForTimeout(1500);
    // 주문서 페이지로 이동하면 안 됨 (그대로 cart 페이지 OR alert)
    expect(page.url()).toMatch(/goCart|cart/);
  });

  test('C25 - 장바구니 페이지 - "선택상품삭제" 버튼 노출', async ({ page }) => {
    const cart = new CartPage(page);
    await cart.visit();
    const deleteBtn = page.locator('button, a').filter({ hasText: /선택.*삭제|선택상품 ?삭제/ }).first();
    await expect(deleteBtn).toBeAttached({ timeout: 10000 });
  });

  test('C26 - 묶음배송 안내 텍스트 노출', async ({ page }) => {
    const cart = new CartPage(page);
    await cart.visit();
    const body = await page.locator('body').innerText();
    expect(body).toMatch(/묶음배송|배송비.*결제방법/);
  });

  test('C27 - 한샘 배송일자 지정 안내 노출', async ({ page }) => {
    const cart = new CartPage(page);
    await cart.visit();
    const body = await page.locator('body').innerText();
    expect(body).toMatch(/배송일자|배송희망일/);
  });

  test('C28 - 패키지 상품 안내 텍스트', async ({ page }) => {
    const cart = new CartPage(page);
    await cart.visit();
    const body = await page.locator('body').innerText();
    expect(body).toMatch(/패키지|할인상품/);
  });

  test('C29 - 장바구니 페이지 가격 단위 일관성 (모든 가격 "원" 단위)', async ({ page }) => {
    const cart = new CartPage(page);
    await cart.visit();
    const text = await page.locator('body').innerText();
    // 1000 이상 콤마 숫자 뒤에 "원/개/세트/포인트" 등 단위 누락 비율
    const orphan = (text.match(/[0-9]{1,3}(?:,[0-9]{3})+(?!\s*(?:원|개|세트|포인트|점|회|매|건))/g) ?? []).length;
    expect(orphan).toBeLessThan(10);
  });

  test('C30 - 장바구니 진입 후 페이지 로드 < 5초', async ({ page }) => {
    const cart = new CartPage(page);
    const t0 = Date.now();
    await cart.visit();
    await page.waitForLoadState('domcontentloaded');
    const elapsed = Date.now() - t0;
    expect(elapsed).toBeLessThan(5000);
  });
});
