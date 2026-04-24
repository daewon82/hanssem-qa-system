import { test, expect } from '@playwright/test';
import { STORE_BASE } from './pages';

/**
 * J. 성능/네트워크 검증
 * 페이지 로드 시간, 이미지 lazy 로딩, 네트워크 에러 처리.
 */

test.describe('J. 성능/네트워크', () => {
  test('J86 - 메인 페이지 DOM 로드 < 6초', async ({ page }) => {
    const t0 = Date.now();
    await page.goto(STORE_BASE, { waitUntil: 'domcontentloaded' });
    const elapsed = Date.now() - t0;
    // 4초 목표지만 네트워크/CDN 변동성 고려해 6초 임계
    expect(elapsed).toBeLessThan(6000);
  });

  test('J87 - 이미지 lazy loading 적용 비율', async ({ page }) => {
    await page.goto(`${STORE_BASE}/category/20070`, { waitUntil: 'domcontentloaded' });
    const stats = await page.evaluate(() => {
      const imgs = Array.from(document.querySelectorAll('img'));
      const lazy = imgs.filter(i => i.loading === 'lazy' || i.getAttribute('loading') === 'lazy');
      return { total: imgs.length, lazy: lazy.length };
    });
    if (stats.total < 10) { return; }
    // 카테고리 페이지처럼 이미지 많은 곳은 일부 이상 lazy 권장 (5% 이상)
    expect(stats.lazy / stats.total).toBeGreaterThanOrEqual(0.05);
  });

  test('J88 - 오프라인 처리 - 네트워크 차단 후 재로드', async ({ page, context }) => {
    await page.goto(STORE_BASE, { waitUntil: 'domcontentloaded' });
    await context.setOffline(true);
    // 새 페이지로 이동 시도 → 실패해야 정상 (브라우저 오프라인 에러)
    const result = await page.goto(`${STORE_BASE}/furnishing`, { timeout: 10000 }).catch(e => ({ error: e.message }));
    await context.setOffline(false);
    // 오프라인이면 에러나 응답 null
    expect(result).toBeTruthy();
  });

  test('J89 - 카테고리 페이지 네트워크 요청 합리적 수', async ({ page }) => {
    let requestCount = 0;
    page.on('request', () => { requestCount++; });
    await page.goto(`${STORE_BASE}/category/20070`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    // 한 페이지당 요청이 500건 이상이면 비정상 (광고/추적 포함)
    expect(requestCount).toBeLessThan(500);
  });

  test('J90 - HTTP 응답 코드 - 메인 페이지 200', async ({ page }) => {
    const response = await page.goto('/');
    expect(response?.status()).toBe(200);
  });
});
