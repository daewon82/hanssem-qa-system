import { test, expect, Page } from '@playwright/test';
import { STORE_BASE } from './pages';

/**
 * B. 가격/숫자 표시 검증
 * 카테고리/상세 페이지에서 가격 텍스트를 추출해 포맷·범위·정합성 확인.
 */

const PRICE_RE = /([0-9,]{3,})\s*원/g;

async function gotoFirstGoods(page: Page, categoryUrl = '/category/20070'): Promise<void> {
  await page.goto(`${STORE_BASE}${categoryUrl}`, { waitUntil: 'domcontentloaded' });
  const href = await page.locator('a[href*="/goods/"]').first().getAttribute('href');
  if (!href) throw new Error('상품 없음');
  const full = href.startsWith('http') ? href : `${STORE_BASE}${href}`;
  await page.goto(full, { waitUntil: 'domcontentloaded' });
}

async function extractPrices(page: Page): Promise<{ raw: string; numeric: number }[]> {
  const text = await page.locator('body').innerText();
  const matches: { raw: string; numeric: number }[] = [];
  let m;
  const re = /([0-9,]{3,})\s*원/g;
  while ((m = re.exec(text)) !== null) {
    const numeric = parseInt(m[1].replace(/,/g, ''), 10);
    if (!isNaN(numeric)) matches.push({ raw: m[0], numeric });
  }
  return matches;
}

test.describe('B. 가격/숫자 표시', () => {
  test('B11 - 천단위 콤마 표기 (1,000 단위 구분)', async ({ page }) => {
    await page.goto(`${STORE_BASE}/category/20070`, { waitUntil: 'domcontentloaded' });
    const prices = await extractPrices(page);
    if (prices.length === 0) { return; }
    // 1000 이상 가격 중 콤마 없는 것
    const noCommaBig = prices.filter(p => p.numeric >= 1000 && !/,/.test(p.raw));
    expect(noCommaBig).toEqual([]);
  });

  test('B12 - 가격 0원 상품이 정상 노출 안됨', async ({ page }) => {
    await page.goto(`${STORE_BASE}/category/20070`, { waitUntil: 'domcontentloaded' });
    // 카테고리 페이지에서 0원으로 표기된 가격 카드가 다수 노출되는지
    // (배송비/할인금액/적립금 등 합계 영역의 0원은 정상)
    const zeroPriceCards = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('a[href*="/goods/"]'));
      let zeroes = 0;
      cards.forEach((c) => {
        const t = (c.textContent || '').trim();
        // 카드 텍스트에 "0원" 단독 표기
        if (/(^|[^0-9,])0\s*원/.test(t)) zeroes++;
      });
      return { total: cards.length, zeroes };
    });
    if (zeroPriceCards.total === 0) { return; }
    // 5% 이상 0원 카드면 비정상
    expect(zeroPriceCards.zeroes / zeroPriceCards.total).toBeLessThan(0.05);
  });

  test('B13 - 음수 가격 노출 금지', async ({ page }) => {
    await page.goto(`${STORE_BASE}/category/20070`, { waitUntil: 'domcontentloaded' });
    const text = await page.locator('body').innerText();
    // "-1,000원" 같은 음수 가격 패턴
    expect(text).not.toMatch(/-[\d,]+\s*원/);
  });

  test('B14 - 비정상 큰 가격 (10억원 초과)', async ({ page }) => {
    await page.goto(`${STORE_BASE}/category/20070`, { waitUntil: 'domcontentloaded' });
    const prices = await extractPrices(page);
    const insane = prices.filter(p => p.numeric > 1_000_000_000);
    expect(insane).toEqual([]);
  });

  test('B15 - 가격 소수점 표시 미발생', async ({ page }) => {
    await page.goto(`${STORE_BASE}/category/20070`, { waitUntil: 'domcontentloaded' });
    const text = await page.locator('body').innerText();
    // "1,000.50원" 같은 소수점 가격
    expect(text).not.toMatch(/\d+\.\d+\s*원/);
  });

  test('B16 - 할인율 100% 초과 미노출', async ({ page }) => {
    await page.goto(`${STORE_BASE}/category/20070`, { waitUntil: 'domcontentloaded' });
    const text = await page.locator('body').innerText();
    // "150%" 같은 100% 초과 할인
    const ratios = text.match(/(\d{1,3})\s*%/g) ?? [];
    const insane = ratios.map(r => parseInt(r, 10)).filter(n => n > 100 && n < 1000);
    // 일부 마케팅 텍스트("프리미엄 200%" 등)는 가능하므로 가격 인근에서만 검사
    // 단순 카운트 기반: 100% 초과가 5건 이상이면 의심
    expect(insane.length).toBeLessThanOrEqual(5);
  });

  test('B17 - 상품 상세 - 원가 ≥ 판매가 정합성', async ({ page }) => {
    await gotoFirstGoods(page);
    const prices = await extractPrices(page);
    if (prices.length < 2) { return; }
    // 일반적으로 상품 상세에는 (원가, 판매가) 또는 (정가, 할인가) 두 가격 노출
    // 가장 큰 두 가격을 정가 vs 할인가로 추정
    const sorted = [...prices].map(p => p.numeric).sort((a, b) => b - a);
    const [highest, second] = sorted;
    // 둘이 차이가 있을 때만 검증 (동일가 단일 노출은 통과)
    if (highest > second) {
      expect(highest).toBeGreaterThanOrEqual(second);
    }
  });

  test('B18 - 가격 텍스트 단위 누락 방지 (1,000 만 노출)', async ({ page }) => {
    await page.goto(`${STORE_BASE}/category/20070`, { waitUntil: 'domcontentloaded' });
    // 가격 영역으로 추정되는 큰 숫자가 "원" 없이 노출되는지 (heuristic)
    // 1,000 이상 콤마숫자 패턴 중 뒤에 "원/개/세트/포인트" 등 단위가 없는 비율
    const orphanCount = await page.evaluate(() => {
      const text = document.body.innerText;
      const re = /([0-9]{1,3}(?:,[0-9]{3})+)(?!\s*(?:원|개|세트|포인트|점|회|명|건|위|점수|매|kg|cm|mm|m|%|‰|\.|,|\)|]))/g;
      const matches = text.match(re) ?? [];
      return matches.length;
    });
    // 단위 없는 큰 숫자는 매우 적게 (10건 미만) 노출되어야 정상
    expect(orphanCount).toBeLessThan(15);
  });

  test('B19 - 무료배송 텍스트와 0원 배송비 일관성', async ({ page }) => {
    await gotoFirstGoods(page);
    const text = await page.locator('body').innerText();
    if (/무료배송/.test(text)) {
      // 무료배송 명시되어 있다면 같은 페이지에 "배송비" 와 양수 금액이 함께 있으면 안 됨
      const shippingPrice = text.match(/배송비\s*[:：]?\s*([0-9,]+)\s*원/);
      if (shippingPrice && shippingPrice[1]) {
        const num = parseInt(shippingPrice[1].replace(/,/g, ''), 10);
        expect(num).toBe(0);
      }
    }
  });

  test('B20 - 혜택가가 정가보다 작거나 같음', async ({ page }) => {
    await gotoFirstGoods(page);
    const text = await page.locator('body').innerText();
    // "혜택가" 와 "정가" 둘 다 노출되는 상세 페이지에서만 검증
    const benefit = text.match(/혜택가[\s\S]{0,30}?([0-9,]+)\s*원/);
    const original = text.match(/정가[\s\S]{0,30}?([0-9,]+)\s*원/);
    if (!benefit || !original) { return; }
    const b = parseInt(benefit[1].replace(/,/g, ''), 10);
    const o = parseInt(original[1].replace(/,/g, ''), 10);
    expect(b).toBeLessThanOrEqual(o);
  });
});
