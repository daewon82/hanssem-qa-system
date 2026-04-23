import { Page, Locator } from "@playwright/test";
import { BasePage, MALL_BASE } from "./BasePage";

export class CartPage extends BasePage {
  static readonly CART_URL = `${MALL_BASE}/order/goCart.do?util=shopping`;
  static readonly CART_URL_LIST = `${MALL_BASE}/cart/cartList.do`;

  constructor(page: Page) {
    super(page);
  }

  async visit(): Promise<void> {
    await this.page.goto(CartPage.CART_URL_LIST, { waitUntil: "domcontentloaded" });
  }

  /** 장바구니 항목 개수 추정 (DOM 기반) */
  async getCount(): Promise<number> {
    const items = this.page.locator('[class*="cart_item"], [class*="CartItem"], tr.cart-row');
    return await items.count();
  }

  async isEmpty(): Promise<boolean> {
    const emptyText = this.page.locator('text=/장바구니가 비었|담긴 상품이 없|비어 있/i');
    return await emptyText.isVisible().catch(() => false);
  }
}
