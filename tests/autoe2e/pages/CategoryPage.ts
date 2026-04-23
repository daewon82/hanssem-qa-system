import { Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

export const CATEGORIES = {
  BEDROOM: { id: 20070, name: '침실', url: '/category/20070' },
  LIVING: { id: 20071, name: '거실', url: '/category/20071' },
  DINING: { id: 20072, name: '다이닝', url: '/category/20072' },
  DRESSROOM: { id: 20073, name: '옷장·드레스룸', url: '/category/20073' },
  KIDS: { id: 20074, name: '키즈룸', url: '/category/20074' },
  STUDENT: { id: 20075, name: '학생방', url: '/category/20075' },
  HOMEOFFICE: { id: 20076, name: '홈오피스', url: '/category/20076' },
  HOMEDECO: { id: 20077, name: '홈&데코', url: '/category/20077' },
  CURTAIN: { id: 20109, name: '커튼·블라인드', url: '/category/20109' },
} as const;

export class CategoryPage extends BasePage {
  async visit(url: string) {
    await this.goto(url, { waitUntil: 'domcontentloaded' });
  }

  get firstGoodsLink(): Locator {
    return this.page.locator('a[href*="/goods/"]').first();
  }

  filterChip(text: string): Locator {
    return this.page.locator(`button:text-is("${text}")`);
  }

  async getFirstGoodsHref(): Promise<string | null> {
    await expect(this.firstGoodsLink).toBeVisible({ timeout: 15000 });
    return await this.firstGoodsLink.getAttribute('href');
  }

  /**
   * 첫 상품 상세로 안정적으로 진입 (viewport 이슈 우회).
   */
  async openFirstGoods(): Promise<string> {
    const href = await this.getFirstGoodsHref();
    if (!href) throw new Error('첫 상품 href를 찾을 수 없음');
    const full = href.startsWith('http') ? href : `${this.page.context()['_options']?.baseURL ?? 'https://store.hanssem.com'}${href}`;
    await this.page.goto(full, { waitUntil: 'domcontentloaded' });
    return href;
  }
}
