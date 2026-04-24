import { Page, expect } from '@playwright/test';
import { gotoWithRetry } from '../helpers/gotoRetry';

// 빈 값: Playwright baseURL(프로젝트별: PC store / MW m.store) 자동 사용
export const STORE_BASE = '';
export const MALL_BASE = 'https://mall.hanssem.com';

/**
 * 모든 POM 클래스의 공통 기반.
 * baseURL 해석, viewport 판별, 공통 대기 유틸 제공.
 */
export abstract class BasePage {
  constructor(protected page: Page) {}

  get isMobile(): boolean {
    return (this.page.viewportSize()?.width ?? 1280) < 600;
  }

  /** ERR_EMPTY_RESPONSE 등 일시 네트워크 오류 자동 재시도 */
  async goto(pathOrUrl: string, opts: { waitUntil?: 'load' | 'domcontentloaded' | 'networkidle' } = {}) {
    const url = pathOrUrl.startsWith('http') ? pathOrUrl : `${STORE_BASE}${pathOrUrl}`;
    await gotoWithRetry(this.page, url, { waitUntil: opts.waitUntil ?? 'domcontentloaded' });
  }

  async expectTitle(pattern: RegExp) {
    await expect(this.page).toHaveTitle(pattern);
  }

  async expectUrl(pattern: RegExp) {
    await expect(this.page).toHaveURL(pattern);
  }
}
