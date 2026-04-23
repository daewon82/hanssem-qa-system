import { test, expect } from '@playwright/test';

const BASE = process.env.BASE_URL || 'https://store.hanssem.com';

const CATEGORIES = [
  { name: '침실', url: '/category/20070', h1: '침실', chips: ['호텔침대', '패브릭침대'] },
  { name: '거실', url: '/category/20071', h1: '거실', chips: ['리클라이너', '가죽소파'] },
  { name: '다이닝', url: '/category/20072', h1: '다이닝', chips: ['세라믹', '식탁의자'] },
  { name: '옷장·드레스룸', url: '/category/20073', h1: '옷장·드레스룸', chips: ['침실/안방', '드레스룸'] },
  { name: '키즈룸', url: '/category/20074', h1: '키즈룸', chips: ['출산필수템', '독립수면템'] },
  { name: '학생방', url: '/category/20075', h1: '학생방', chips: ['티오책상', '샘책장'] },
  { name: '홈오피스', url: '/category/20076', h1: '홈오피스', chips: ['블랭크', '플롯'] },
  { name: '홈&데코', url: '/category/20077', h1: '홈&데코', chips: ['수납용품', '홈패브릭'] },
  { name: '커튼·블라인드', url: '/category/20109', h1: '커튼·블라인드', chips: ['암막커튼', '블라인드'] },
];

for (const cat of CATEGORIES) {
  test(`카테고리 로드 - ${cat.name}`, async ({ page }) => {
    await page.goto(`${BASE}${cat.url}`);
    await expect(page.locator('h1')).toContainText(cat.h1);
  });
}

test.describe('침실 카테고리 상세', () => {
  test('TC009 - 호텔침대 필터 칩 클릭', async ({ page }) => {
    await page.goto(`${BASE}/category/20070`);
    await expect(page.locator('h1')).toContainText('침실');
    await expect(page.locator('button:has-text("호텔침대")')).toBeVisible();
    await page.locator('button:has-text("호텔침대")').click();
  });

  test('침실 BEST 상품 섹션 노출', async ({ page }) => {
    await page.goto(`${BASE}/category/20070`);
    // 복수 H2 존재 → first() 사용
    await expect(page.locator('h2:has-text("BEST 상품")').first()).toBeVisible();
  });

  test('침실 라인업 섹션 노출', async ({ page }) => {
    await page.goto(`${BASE}/category/20070`);
    await expect(page.locator('h2:has-text("라인업")').first()).toBeVisible();
  });

  test('침실 신상품 섹션 노출', async ({ page }) => {
    await page.goto(`${BASE}/category/20070`);
    await expect(page.locator('h2:has-text("신상품")')).toBeVisible();
  });

  test('상품 링크 /goods/:id 패턴 확인', async ({ page }) => {
    await page.goto(`${BASE}/category/20070`);
    const goodsLinks = page.locator('a[href*="/goods/"]');
    const count = await goodsLinks.count();
    expect(count).toBeGreaterThan(0);
  });
});

test.describe('거실 카테고리 상세', () => {
  test('TC010 - 가죽소파 필터 칩 클릭', async ({ page }) => {
    // 모바일은 필터 칩 구조가 달라 skip
    if ((page.viewportSize()?.width ?? 1280) < 600) { test.skip(); return; }
    await page.goto(`${BASE}/category/20071`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('h1')).toContainText('거실');
    await page.locator('button:has-text("가죽소파")').first().click();
  });

  test('거실 BEST 상품 섹션 노출', async ({ page }) => {
    await page.goto(`${BASE}/category/20071`);
    await expect(page.locator('h2:has-text("BEST 상품")').first()).toBeVisible();
  });
});

test.describe('키즈룸 카테고리 상세', () => {
  test('TC012 - 출산필수템 필터 칩 노출', async ({ page }) => {
    await page.goto(`${BASE}/category/20074`);
    await expect(page.locator('h1')).toContainText('키즈룸');
    await expect(page.locator('button:has-text("출산필수템")')).toBeVisible();
  });

  test('키즈룸 샘키즈 알아보기 섹션', async ({ page }) => {
    await page.goto(`${BASE}/category/20074`);
    await expect(page.locator('h2:has-text("샘키즈")')).toBeVisible();
  });
});

test.describe('커튼·블라인드 카테고리 상세', () => {
  test('TC015 - 암막커튼 필터 칩 노출', async ({ page }) => {
    // 모바일은 카테고리 DOM 구조가 달라 필터 칩이 없음
    if ((page.viewportSize()?.width ?? 1280) < 600) { test.skip(); return; }
    await page.goto(`${BASE}/category/20109`, { waitUntil: 'domcontentloaded' });
    // 필터 칩 버튼 구조: <button><div><div>암막커튼</div></div></button>
    // button:text-is() 는 직접 텍스트만 보므로 매칭 실패 → getByRole 이용 (accessible name 기반)
    const chip1 = page.getByRole('button', { name: '암막커튼', exact: true });
    const chip2 = page.getByRole('button', { name: '블라인드', exact: true });
    const chip3 = page.getByRole('button', { name: '롤스크린', exact: true });
    await expect(chip1.first()).toBeVisible({ timeout: 20000 });
    await expect(chip2.first()).toBeVisible();
    await expect(chip3.first()).toBeVisible();
  });
});

test.describe('TC018 - 반응형 모바일', () => {
  test('모바일 뷰포트 메인 페이지 타이틀', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(BASE);
    // 모바일에서 검색창은 접혀있음 → 타이틀로 확인
    await expect(page).toHaveTitle(/한샘몰/);
  });

  test('모바일 뷰포트 카테고리 페이지', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${BASE}/category/20070`);
    await expect(page.locator('h1')).toContainText('침실');
  });
});
