import { test, expect, Page } from '@playwright/test';
import { STORE_BASE } from './pages';

/**
 * A. 상품 데이터 품질 체크
 * 카테고리 페이지와 상품 상세 페이지를 샘플링하여 비정상 데이터 감지.
 */

const CATEGORY_URLS = [
  '/category/20070', // 침실
  '/category/20071', // 거실
  '/category/20109', // 커튼·블라인드
];

async function collectProductNames(page: Page, limit = 30): Promise<string[]> {
  return await page.evaluate((lim) => {
    const anchors = Array.from(document.querySelectorAll('a[href*="/goods/"]'));
    const names: string[] = [];
    for (const a of anchors) {
      const t = (a.textContent || '').trim();
      if (t && t.length > 2 && t.length < 200) names.push(t);
      if (names.length >= lim) break;
    }
    return names;
  }, limit);
}

test.describe('A. 상품 데이터 품질', () => {
  test('A01 - 상품명에 과거 연도(2010~2020) 포함 여부', async ({ page }) => {
    await page.goto(`${STORE_BASE}/category/20070`, { waitUntil: 'domcontentloaded' });
    const names = await collectProductNames(page);
    const oldYearPattern = /\b(20[01][0-9])년/;
    const suspects = names.filter(n => oldYearPattern.test(n));
    // 구형 연도 표기된 상품이 5건 이상이면 문제 — 소량은 리뉴얼/복각 상품 가능
    expect(suspects.length).toBeLessThanOrEqual(5);
  });

  test('A02 - 상품명 특수문자 깨짐 (?, □) 감지', async ({ page }) => {
    await page.goto(`${STORE_BASE}/category/20070`, { waitUntil: 'domcontentloaded' });
    const names = await collectProductNames(page);
    // ??나 □□ 연속 패턴이 상품명에 있으면 인코딩 문제
    const broken = names.filter(n => /\?{2,}|□{2,}|�/.test(n));
    expect(broken).toEqual([]);
  });

  test('A03 - 상품명 길이 비정상 (300자 초과)', async ({ page }) => {
    await page.goto(`${STORE_BASE}/category/20070`, { waitUntil: 'domcontentloaded' });
    const names = await collectProductNames(page);
    const tooLong = names.filter(n => n.length > 300);
    expect(tooLong).toEqual([]);
  });

  test('A04 - 동일 카테고리 내 완전 중복 상품명 (5회 초과 감지)', async ({ page }) => {
    await page.goto(`${STORE_BASE}/category/20070`, { waitUntil: 'domcontentloaded' });
    const names = await collectProductNames(page, 50);
    const counts = new Map<string, number>();
    names.forEach(n => counts.set(n, (counts.get(n) ?? 0) + 1));
    // 5회 이상 완전 동일 상품명은 명백한 데이터 오류 — 추천/베스트/광고 영역 중복 허용
    const duplicates = [...counts.entries()].filter(([, c]) => c > 5);
    expect(duplicates).toEqual([]);
  });

  test('A05 - 상품 썸네일 이미지 누락 감지', async ({ page }) => {
    await page.goto(`${STORE_BASE}/category/20070`, { waitUntil: 'networkidle' }).catch(() => null);
    const brokenImgs = await page.evaluate(() => {
      const cards = document.querySelectorAll('a[href*="/goods/"]');
      let missing = 0;
      cards.forEach((card) => {
        const img = card.querySelector('img');
        // 이미지 태그 자체 없거나 src 비어있는 경우만 카운트 (lazy-load는 OK)
        if (!img || !img.getAttribute('src')) missing++;
      });
      return { total: cards.length, missing };
    });
    if (brokenImgs.total === 0) { return; }
    // 30% 이상 src 자체 없으면 비정상 (lazy-load 고려해 관대)
    expect(brokenImgs.missing / brokenImgs.total).toBeLessThan(0.3);
  });

  test('A06 - 상품 썸네일 alt 속성 존재 비율', async ({ page }) => {
    await page.goto(`${STORE_BASE}/category/20070`, { waitUntil: 'domcontentloaded' });
    const imgsWithoutAlt = await page.evaluate(() => {
      const imgs = Array.from(document.querySelectorAll('a[href*="/goods/"] img'));
      return imgs.filter((img: any) => !img.alt || img.alt.trim() === '').length;
    });
    const totalImgs = await page.evaluate(() =>
      document.querySelectorAll('a[href*="/goods/"] img').length
    );
    if (totalImgs === 0) { return; }
    // alt 누락 비율 60% 미만 (현실적으로 한국 이커머스는 alt 누락 많음 — finding 용도로 50% 임계)
    expect(imgsWithoutAlt / totalImgs).toBeLessThan(0.6);
  });

  test('A07 - 상품 상세 - 상품명이 "undefined" / "null" 아님', async ({ page }) => {
    await page.goto(`${STORE_BASE}/category/20070`, { waitUntil: 'domcontentloaded' });
    const firstHref = await page.locator('a[href*="/goods/"]').first().getAttribute('href');
    if (!firstHref) { return; }
    const full = firstHref.startsWith('http') ? firstHref : `${STORE_BASE}${firstHref}`;
    await page.goto(full, { waitUntil: 'domcontentloaded' });
    const productName = await page.locator('h1, [class*="ProductName"]').first().textContent().catch(() => '');
    expect(productName).not.toMatch(/^(undefined|null|NaN)$/);
    expect(productName?.trim().length ?? 0).toBeGreaterThan(0);
  });

  test('A08 - "NEW" 뱃지와 등록일자 정합성(뱃지만 확인)', async ({ page }) => {
    // 서버 등록일자 접근 불가 → 단순 뱃지 노출 중복/과다 여부만 점검
    await page.goto(`${STORE_BASE}/category/20070`, { waitUntil: 'domcontentloaded' });
    const newBadges = await page.locator('text=/^NEW$/i').count();
    const totalProducts = await page.locator('a[href*="/goods/"]').count();
    if (totalProducts === 0) { return; }
    // 전체 상품의 80% 이상에 NEW 뱃지면 비정상
    expect(newBadges / totalProducts).toBeLessThan(0.8);
  });

  test('A09 - 판매 종료/단종 키워드 노출 여부', async ({ page }) => {
    await page.goto(`${STORE_BASE}/category/20070`, { waitUntil: 'domcontentloaded' });
    const names = await collectProductNames(page);
    const discontinued = names.filter(n =>
      /단종|판매 ?종료|DISCONTINUED|구형|생산 ?중단/i.test(n)
    );
    // 단종 상품이 메인 카테고리 목록에 노출되면 안 됨
    expect(discontinued).toEqual([]);
  });

  test('A10 - 여러 카테고리 순회 시 404/에러 페이지 미발생', async ({ page }) => {
    for (const url of CATEGORY_URLS) {
      await page.goto(`${STORE_BASE}${url}`, { waitUntil: 'domcontentloaded' });
      const body = await page.locator('body').innerText();
      expect(body).not.toMatch(/페이지를 찾을 수 없|500 Internal|서비스 점검/);
    }
  });
});
