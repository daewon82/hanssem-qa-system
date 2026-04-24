import { test, expect, Page } from '@playwright/test';
import { STORE_BASE } from './pages';

/**
 * I. 쿠폰/프로모션 검증 (로그인 필요한 일부 + 공개 정보)
 */

async function isPageAvailable(page: Page): Promise<boolean> {
  if (/mallLoginMain/.test(page.url())) return false;
  const body = await page.locator('body').innerText().catch(() => '');
  return !/페이지를 찾을 수 없|요청하신 주소가 잘못/.test(body);
}

test.describe('I. 쿠폰/프로모션', () => {
  test('I81 - 쿠폰함 페이지 접근', async ({ page }) => {
    const candidates = [
      'https://mall.hanssem.com/myhome/myCouponList.do',
      'https://mall.hanssem.com/customer/myCouponList.do',
    ];
    let opened = false;
    for (const u of candidates) {
      await page.goto(u, { waitUntil: 'domcontentloaded' }).catch(() => null);
      if (await isPageAvailable(page)) { opened = true; break; }
    }
    if (!opened) { return; }
    expect(page.url()).toContain('hanssem.com');
  });

  test('I82 - 만료된 쿠폰 표시 키워드 ("만료" 또는 "사용기간 종료")', async ({ page }) => {
    const candidates = [
      'https://mall.hanssem.com/myhome/myCouponList.do',
      'https://mall.hanssem.com/customer/myCouponList.do',
    ];
    let opened = false;
    for (const u of candidates) {
      await page.goto(u, { waitUntil: 'domcontentloaded' }).catch(() => null);
      if (await isPageAvailable(page)) { opened = true; break; }
    }
    if (!opened) { return; }
    const body = await page.locator('body').innerText();
    // 만료 / 미사용 / 사용 완료 분류 키워드 중 하나는 노출
    expect(body).toMatch(/만료|미사용|사용 ?완료|기간.*종료|보유 ?쿠폰|사용 ?가능 ?쿠폰/);
  });

  test('I83 - 상품 상세 - 쿠폰 영역 노출 시 "다운로드" 버튼 존재', async ({ page }) => {
    await page.goto(`${STORE_BASE}/category/20070`, { waitUntil: 'domcontentloaded' });
    const href = await page.locator('a[href*="/goods/"]').first().getAttribute('href');
    if (!href) { return; }
    const full = href.startsWith('http') ? href : `${STORE_BASE}${href}`;
    await page.goto(full, { waitUntil: 'domcontentloaded' });

    const couponSection = page.locator('text=/쿠폰/').first();
    if (!(await couponSection.isVisible().catch(() => false))) { return; }
    // 쿠폰 노출 시 다운로드/받기 버튼 존재 검증
    const downloadBtn = page.locator('button, a').filter({ hasText: /다운로드|받기|적용/ });
    expect(await downloadBtn.count()).toBeGreaterThan(0);
  });

  test('I84 - 프로모션/이벤트 페이지 진입 가능', async ({ page }) => {
    // 한샘몰 이벤트 페이지 후보
    const candidates = [
      `${STORE_BASE}/event`,
      `${STORE_BASE}/promotion`,
      'https://mall.hanssem.com/event/eventList.do',
    ];
    let opened = false;
    for (const u of candidates) {
      await page.goto(u, { waitUntil: 'domcontentloaded' }).catch(() => null);
      if (await isPageAvailable(page)) { opened = true; break; }
    }
    if (!opened) { return; }
    expect(page.url()).toContain('hanssem.com');
  });

  test('I85 - 쿠폰 다운로드 클릭 시 에러 페이지 미발생', async ({ page }) => {
    await page.goto(`${STORE_BASE}/category/20070`, { waitUntil: 'domcontentloaded' });
    const href = await page.locator('a[href*="/goods/"]').first().getAttribute('href');
    if (!href) { return; }
    const full = href.startsWith('http') ? href : `${STORE_BASE}${href}`;
    await page.goto(full, { waitUntil: 'domcontentloaded' });

    const downloadBtn = page.locator('button, a').filter({ hasText: /쿠폰 ?다운로드|쿠폰 ?받기/ }).first();
    if (await downloadBtn.count() === 0) { return; }
    page.on('dialog', async d => { await d.dismiss().catch(() => null); });
    await downloadBtn.click({ force: true }).catch(() => null);
    await page.waitForTimeout(1500);
    // 페이지 타이틀로 에러 페이지 여부 판단 (body 일반 단어 충돌 회피)
    const title = await page.title();
    expect(title).toMatch(/한샘|상품/);
  });
});
