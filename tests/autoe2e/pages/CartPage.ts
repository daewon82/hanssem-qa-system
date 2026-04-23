import { expect } from '@playwright/test';
import { BasePage, MALL_BASE } from './BasePage';

export class CartPage extends BasePage {
  static readonly URL = `${MALL_BASE}/order/goCart.do?util=shopping`;

  async visit() {
    await this.goto(CartPage.URL, { waitUntil: 'domcontentloaded' });
  }

  /**
   * 페이지 타이틀/헤더에 노출된 장바구니 개수를 파싱. "장바구니 (N)" 형식.
   */
  async getCount(): Promise<number> {
    return await this.page.evaluate(() => {
      const m = document.body.innerText.match(/장바구니\s*\((\d+)\)/);
      return m ? parseInt(m[1], 10) : 0;
    });
  }

  async isEmpty(): Promise<boolean> {
    return await this.page.evaluate(() =>
      /장바구니에 담긴 상품이 없|장바구니가 비어/.test(document.body.innerText)
    );
  }

  async expectLoaded() {
    await expect(this.page).toHaveTitle(/장바구니/);
    await expect(this.page.locator('body')).toContainText('총 결제예정금액');
  }
}
