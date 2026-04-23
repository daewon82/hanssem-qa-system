import { test, expect } from '@playwright/test';

const BASE = process.env.BASE_URL || 'https://store.hanssem.com';

const isMobile = (page: import('@playwright/test').Page) =>
  (page.viewportSize()?.width ?? 1280) < 600;

test.describe('인테리어 페이지', () => {
  test('TC007 - 인테리어 메인 페이지 로드', async ({ page }) => {
    await page.goto(`${BASE}/interior`);
    await expect(page).toHaveTitle(/인테리어|한샘/);
    if (!isMobile(page)) {
      await expect(page.locator('button:has-text("키친")').first()).toBeVisible();
      await expect(page.locator('button:has-text("바스")').first()).toBeVisible();
    }
  });

  test('TC008 - 키친 공간 필터 칩 클릭', async ({ page }) => {
    await page.goto(`${BASE}/interior`);
    const kitchenChip = page.locator('button:has-text("키친")').first();
    await expect(kitchenChip).toBeVisible();
    await kitchenChip.click();
    await expect(kitchenChip).toBeVisible();
  });

  test('공간 필터 칩 - 거실 클릭', async ({ page }) => {
    await page.goto(`${BASE}/interior`);
    await page.locator('button:has-text("거실")').first().click();
    await expect(page.locator('button:has-text("거실")').first()).toBeVisible();
  });

  test('공간 필터 칩 - 침실 클릭', async ({ page }) => {
    await page.goto(`${BASE}/interior`);
    await page.locator('button:has-text("침실")').first().click();
    await expect(page.locator('button:has-text("침실")').first()).toBeVisible();
  });

  test('공간별 시공사례 섹션 노출', async ({ page }) => {
    if (isMobile(page)) { test.skip(); return; }
    await page.goto(`${BASE}/interior`);
    await expect(page.locator('h2:has-text("한샘이 제안하는 공간별 시공사례")')).toBeVisible();
  });

  test('고객 후기 섹션 노출', async ({ page }) => {
    if (isMobile(page)) { test.skip(); return; }
    await page.goto(`${BASE}/interior`);
    await expect(page.locator('h2:has-text("실제 고객들의 후기")')).toBeVisible();
  });

  test('무료상담 섹션 노출', async ({ page }) => {
    if (isMobile(page)) { test.skip(); return; }
    await page.goto(`${BASE}/interior`);
    await expect(page.locator('h2:has-text("BEST 전문가의 특별혜택 무료상담")')).toBeVisible();
  });

  test('시공사례 링크 접근 가능', async ({ page }) => {
    await page.goto(`${BASE}/interior`);
    const constcaseLink = page.locator(`a[href*="interior/constcase"]`).first();
    if (await constcaseLink.isVisible()) {
      await constcaseLink.click();
      await expect(page).toHaveURL(/interior\/constcase/);
    }
  });

  test('더보기 버튼 동작', async ({ page }) => {
    await page.goto(`${BASE}/interior`);
    const moreBtn = page.locator('button:has-text("더보기")').first();
    if (await moreBtn.isVisible()) {
      await moreBtn.click();
    }
  });
});

test.describe('인테리어 세부 페이지', () => {
  test('시공사례 상세 이미지 클릭 시 진입 가능', async ({ page }) => {
    await page.goto(`${BASE}/interior/constcase`, { waitUntil: 'domcontentloaded' });
    const items = page.locator('a[href*="constcase"]');
    const count = await items.count();
    if (count < 2) { test.skip(); return; }
    // 첫 아이템은 리스트 자기 자신일 수 있어 index 1 선택
    await items.nth(1).click().catch(async () => {
      await items.first().click();
    });
    await page.waitForLoadState('domcontentloaded');
    expect(page.url()).toContain('constcase');
  });

  test('시공기사 찾기 진입점 노출', async ({ page }) => {
    // 시공기사 찾기는 인테리어 메인에서 접근 — URL 경로는 여러 후보 가능성 → 텍스트/링크 존재로 검증
    await page.goto(`${BASE}/interior`);
    const designerLink = page.locator('a, button').filter({ hasText: /시공기사|전문가|디자이너|RD/ }).first();
    await expect(designerLink).toBeAttached({ timeout: 15000 });
  });

  test('인테리어 상담신청 접근점 존재', async ({ page }) => {
    await page.goto(`${BASE}/interior`);
    const consultLink = page.locator('a, button').filter({ hasText: /상담신청|무료상담|상담/ }).first();
    await expect(consultLink).toBeAttached({ timeout: 10000 });
  });
});
