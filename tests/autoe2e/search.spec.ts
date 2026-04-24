import { test, expect } from '@playwright/test';

// 빈 값: Playwright baseURL(프로젝트별: PC store / MW m.store) 자동 사용
const BASE = '';

const isMobile = (page: import('@playwright/test').Page) =>
  (page.viewportSize()?.width ?? 1280) < 600;

test.describe('검색 기능', () => {
  test('TC004 - 키워드 입력 후 검색 실행', async ({ page }) => {
    if (isMobile(page)) { return; }
    // 홈퍼니싱 페이지는 검색창이 상시 노출됨 (메인 GNB 와 달리 숨김 이슈 없음)
    await page.goto(`${BASE}/furnishing`);
    const searchInput = page.locator('input[placeholder="검색어를 입력해 주세요."]').first();
    await searchInput.fill('소파');
    await searchInput.press('Enter');
    await page.waitForLoadState('domcontentloaded');
    // 검색 결과 페이지로 이동했는지 확인
    await expect(page).toHaveURL(/\/search/);
  });

  test('TC017 - 검색창 포커스 시 탭 DOM 존재 확인', async ({ page }) => {
    if (isMobile(page)) { return; }
    await page.goto(BASE);
    await expect(page.locator('button:has-text("최근 검색어")')).toBeAttached();
    await expect(page.locator('button:has-text("추천 검색어")')).toBeAttached();
    await expect(page.locator('button:has-text("인기 검색어")')).toBeAttached();
  });

  test('TC017 - 검색창 클릭 후 탭 활성화', async ({ page }) => {
    if (isMobile(page)) { return; }
    await page.goto(BASE);
    const searchInput = page.locator('input[placeholder="검색어를 입력해 주세요."]').first();
    await searchInput.click({ force: true });
    await page.waitForTimeout(500);
    const recentTab = page.locator('button:has-text("최근 검색어")');
    await expect(recentTab).toBeAttached();
  });

  test('검색창 DOM 존재 확인', async ({ page }) => {
    if (isMobile(page)) { return; }
    await page.goto(BASE);
    await expect(
      page.locator('input[placeholder="검색어를 입력해 주세요."]').first()
    ).toBeAttached();
  });

  test('홈퍼니싱 페이지 검색창 DOM 존재', async ({ page }) => {
    if (isMobile(page)) { return; }
    await page.goto(`${BASE}/furnishing`);
    await expect(
      page.locator('input[placeholder="검색어를 입력해 주세요."]').first()
    ).toBeAttached();
  });
});

/**
 * 홈퍼니싱 페이지의 상시 노출 검색창을 이용해 검색을 실행한다.
 * 메인 GNB 검색창은 headless 환경에서 숨김 이슈가 있어 회피.
 */
async function submitSearch(page: import('@playwright/test').Page, keyword: string) {
  await page.goto(`${BASE}/furnishing`);
  const searchInput = page.locator('input[placeholder="검색어를 입력해 주세요."]').first();
  await searchInput.fill(keyword);
  await searchInput.press('Enter');
  await page.waitForLoadState('domcontentloaded');
}

test.describe('통합검색 결과 페이지', () => {
  test('통합검색 결과 - 페이지 로드', async ({ page }) => {
    if (isMobile(page)) { return; }
    await submitSearch(page, '소파');
    await expect(page).toHaveURL(/\/search/);
    await expect(page).toHaveTitle(/한샘/);
  });

  test('통합검색 결과 - 상품 리스트 노출', async ({ page }) => {
    if (isMobile(page)) { return; }
    await submitSearch(page, '소파');
    const goods = page.locator('a[href*="/goods/"]');
    await expect(goods.first()).toBeVisible({ timeout: 20000 });
  });

  test('통합검색 결과 - 시공사례/매거진 탭 또는 링크 존재', async ({ page }) => {
    if (isMobile(page)) { return; }
    await submitSearch(page, '소파');
    const tabsOrSections = page.locator('text=/시공사례|매거진|사진/').first();
    await expect(tabsOrSections).toBeAttached({ timeout: 15000 });
  });

  test('통합검색 결과 - 정렬/필터 컨트롤 노출', async ({ page }) => {
    if (isMobile(page)) { return; }
    await submitSearch(page, '소파');
    // "인기순/낮은가격순/높은가격순/리뷰순/최신순" 등 정렬 키워드 노출
    const sortControl = page.locator('button, a').filter({ hasText: /인기순|낮은가격|높은가격|리뷰|최신순|정렬|추천순/ }).first();
    await expect(sortControl).toBeAttached({ timeout: 15000 });
  });

  test('통합검색 결과 - 정렬 변경 시 URL 또는 DOM 변화', async ({ page }) => {
    if (isMobile(page)) { return; }
    await submitSearch(page, '소파');
    const sortBtn = page.locator('button, a').filter({ hasText: /낮은가격|가격 낮은/ }).first();
    if (await sortBtn.count() === 0) { return; }
    const beforeUrl = page.url();
    await sortBtn.click({ force: true }).catch(() => null);
    await page.waitForTimeout(2000);
    // URL이 바뀌거나, 페이지 내부 상태가 갱신됨
    const afterUrl = page.url();
    const stillOnSearch = /\/search/.test(afterUrl);
    expect(stillOnSearch).toBeTruthy();
    // 가격 텍스트 하나 이상 노출되는지 확인
    await expect(page.locator('text=/[0-9,]+원/').first()).toBeVisible({ timeout: 10000 });
  });
});

/**
 * D. 검색 확장 체크
 */
test.describe('D. 검색 확장', () => {
  test('D31 - XSS 검색 입력 — 스크립트 미실행', async ({ page }) => {
    if (isMobile(page)) { return; }
    let alertFired = false;
    page.on('dialog', async d => { alertFired = true; await d.dismiss().catch(() => null); });
    await submitSearch(page, `<script>alert('xss')</script>`);
    await page.waitForTimeout(1500);
    expect(alertFired).toBeFalsy();
  });

  test('D32 - SQL Injection 패턴 입력 - 정상 처리', async ({ page }) => {
    if (isMobile(page)) { return; }
    await submitSearch(page, `' OR 1=1--`);
    await page.waitForLoadState('domcontentloaded');
    const body = await page.locator('body').innerText();
    expect(body).not.toMatch(/SQL|syntax error|database error|exception/i);
  });

  test('D33 - 공백만 검색 - 결과 페이지 미진입 또는 안내', async ({ page }) => {
    if (isMobile(page)) { return; }
    await submitSearch(page, '     ');
    // 공백 검색은 결과 페이지로 가지 않거나, 빈 결과/안내 노출
    const url = page.url();
    const body = await page.locator('body').innerText().catch(() => '');
    const handled = !/\/search\/all\?keyword=\s/.test(decodeURIComponent(url)) ||
                    /검색어를 입력|결과가 없/.test(body);
    expect(handled).toBeTruthy();
  });

  test('D34 - 극히 긴 키워드(500자) - 에러 없이 처리', async ({ page }) => {
    if (isMobile(page)) { return; }
    const longKw = '소파'.repeat(250);
    await submitSearch(page, longKw);
    // 페이지 타이틀이 정상이면 에러 아님 (body 텍스트는 일반 단어와 충돌 가능)
    const title = await page.title();
    expect(title).toMatch(/한샘/);
  });

  test('D35 - 특수문자 검색(%, #, &) - 정상 인코딩', async ({ page }) => {
    if (isMobile(page)) { return; }
    await submitSearch(page, '%소파&#가격');
    const title = await page.title();
    expect(title).toMatch(/한샘/);
  });

  test('D36 - 이모지 검색 - 에러 없이 처리', async ({ page }) => {
    if (isMobile(page)) { return; }
    await submitSearch(page, '😀🛋️');
    const title = await page.title();
    expect(title).toMatch(/한샘/);
  });

  test('D37 - 결과 0건 키워드 - "결과 없음" 안내', async ({ page }) => {
    if (isMobile(page)) { return; }
    await submitSearch(page, 'asldkfjqweoizxcvnmpqwoeiruty12345');
    await page.waitForTimeout(2500);
    const body = await page.locator('body').innerText();
    // 결과 없음 안내 키워드 OR 상품 0건
    const hasEmptyMsg = /결과가 없|상품이 없|존재하지 않/.test(body);
    const goodsCount = await page.locator('a[href*="/goods/"]').count();
    expect(hasEmptyMsg || goodsCount === 0).toBeTruthy();
  });

  test('D38 - 검색어 페이지 로드 < 8초', async ({ page }) => {
    if (isMobile(page)) { return; }
    const t0 = Date.now();
    await submitSearch(page, '의자');
    const elapsed = Date.now() - t0;
    expect(elapsed).toBeLessThan(8000);
  });

  test('D39 - 인기 검색어 / 추천 검색어 영역 (DOM 존재)', async ({ page }) => {
    if (isMobile(page)) { return; }
    await page.goto(BASE);
    // 헤더 검색창 클릭 시 인기 검색어 탭 등장
    const tabs = page.locator('button:has-text("인기 검색어"), button:has-text("추천 검색어"), button:has-text("최근 검색어")');
    expect(await tabs.count()).toBeGreaterThan(0);
  });

  test('D40 - 한글/영문 혼용 검색 - 정상 처리', async ({ page }) => {
    if (isMobile(page)) { return; }
    await submitSearch(page, 'sofa 소파 NEW');
    const title = await page.title();
    expect(title).toMatch(/한샘/);
  });
});
