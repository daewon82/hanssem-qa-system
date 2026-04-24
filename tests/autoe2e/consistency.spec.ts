import { test, expect } from '@playwright/test';
import { STORE_BASE } from './pages';

/**
 * K. 데이터 일관성 검증
 * 새로고침/뒤로가기/북마크 등 사용자 흐름에서 상태 유지/리셋 확인.
 */

test.describe('K. 데이터 일관성', () => {
  test('K91 - 새로고침 후 동일 페이지 유지', async ({ page }) => {
    await page.goto(`${STORE_BASE}/category/20070`, { waitUntil: 'domcontentloaded' });
    await page.reload({ waitUntil: 'domcontentloaded' });
    expect(page.url()).toContain('/category/20070');
    await expect(page.locator('h1')).toContainText('침실');
  });

  test('K92 - 뒤로가기 → 이전 카테고리로 복귀', async ({ page }) => {
    await page.goto(`${STORE_BASE}/category/20070`, { waitUntil: 'domcontentloaded' });
    await page.goto(`${STORE_BASE}/category/20071`, { waitUntil: 'domcontentloaded' });
    await page.goBack({ waitUntil: 'domcontentloaded' });
    // SPA 라우팅 안정화 대기
    await page.waitForURL(/category\/20070/, { timeout: 10000 }).catch(() => null);
    expect(page.url()).toContain('/category/20070');
  });

  test('K93 - 카테고리 URL 직접 진입 - 동일 결과', async ({ page, context }) => {
    // 첫 번째 진입
    await page.goto(`${STORE_BASE}/category/20074`, { waitUntil: 'domcontentloaded' });
    const title1 = await page.title();

    // 새 페이지(같은 컨텍스트)에서 다시 진입 - 동일 타이틀
    const page2 = await context.newPage();
    await page2.goto(`${STORE_BASE}/category/20074`, { waitUntil: 'domcontentloaded' });
    const title2 = await page2.title();
    await page2.close();

    expect(title1).toBe(title2);
  });

  test('K94 - 북마크 가능한 URL - URL이 의미있는 경로 포함', async ({ page }) => {
    await page.goto(`${STORE_BASE}/category/20070`, { waitUntil: 'domcontentloaded' });
    expect(page.url()).toMatch(/category\/20070/);
    await page.goto(`${STORE_BASE}/interior`, { waitUntil: 'domcontentloaded' });
    expect(page.url()).toMatch(/interior/);
  });

  test('K95 - OG 메타 태그(공유) - 메인 페이지 og:title 존재', async ({ page }) => {
    await page.goto('/');
    const ogTitle = await page.evaluate(() => {
      const m = document.querySelector('meta[property="og:title"]');
      return m ? m.getAttribute('content') : null;
    });
    expect(ogTitle).toBeTruthy();
    expect(ogTitle?.length ?? 0).toBeGreaterThan(0);
  });
});
