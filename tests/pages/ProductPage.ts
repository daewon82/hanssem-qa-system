import { Page, Locator } from "@playwright/test";
import { BasePage, STORE_BASE } from "./BasePage";

export class ProductPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async visit(goodsId: string | number): Promise<void> {
    await this.page.goto(`${STORE_BASE}/goods/${goodsId}`);
    await this.page.waitForLoadState("domcontentloaded");
  }

  get productName(): Locator {
    return this.smartLocator({
      testId: "product-name",
      role: "heading",
      css: "h1",
    }).first();
  }

  get buyButton(): Locator {
    return this.smartLocator({
      testId: "buy-button",
      ariaLabel: "구매하기",
      role: "button",
      name: "구매하기",
      text: "구매하기",
    }).first();
  }

  get cartButton(): Locator {
    return this.smartLocator({
      testId: "cart-button",
      ariaLabel: "장바구니 담기",
      role: "button",
      name: "장바구니",
      text: "장바구니",
    }).first();
  }

  tab(name: "상품정보" | "후기" | "문의" | "배송"): Locator {
    const valueMap: Record<string, string> = {
      "상품정보": "detail",
      "후기": "review",
      "문의": "qna",
      "배송": "delivery",
    };
    return this.page.locator(`[data-value="${valueMap[name]}"]`).first();
  }
}
