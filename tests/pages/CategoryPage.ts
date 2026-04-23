import { Page, Locator } from "@playwright/test";
import { BasePage, STORE_BASE } from "./BasePage";

export const CATEGORIES = {
  BEDROOM:    { id: "20070", name: "침실",          url: "/category/20070" },
  LIVING:     { id: "20071", name: "거실",          url: "/category/20071" },
  DINING:     { id: "20072", name: "다이닝",        url: "/category/20072" },
  WARDROBE:   { id: "20073", name: "옷장·드레스룸", url: "/category/20073" },
  KIDS:       { id: "20074", name: "키즈룸",        url: "/category/20074" },
  STUDENT:    { id: "20075", name: "학생방",        url: "/category/20075" },
  HOMEOFFICE: { id: "20076", name: "홈오피스",      url: "/category/20076" },
  HOMEDECO:   { id: "20077", name: "홈&데코",       url: "/category/20077" },
  CURTAIN:    { id: "20109", name: "커튼·블라인드", url: "/category/20109" },
} as const;

export class CategoryPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async visit(categoryUrl: string): Promise<void> {
    await this.page.goto(`${STORE_BASE}${categoryUrl}`);
    await this.page.waitForLoadState("domcontentloaded");
  }

  get firstGoodsLink(): Locator {
    return this.page.locator('a[href*="/goods/"]').first();
  }

  /**
   * 카테고리 필터 칩 (예: "암막커튼")
   * ⚠️ getByRole exact: true 필수 — :text-is() 실패
   */
  filterChip(name: string): Locator {
    return this.page.getByRole("button", { name, exact: true });
  }

  async openFirstGoods(): Promise<string> {
    const link = this.firstGoodsLink;
    await link.waitFor({ state: "visible", timeout: 15000 });
    const href = await link.getAttribute("href");
    if (!href) throw new Error("goods href not found");
    const fullUrl = href.startsWith("http") ? href : `${STORE_BASE}${href}`;
    await this.page.goto(fullUrl, { waitUntil: "domcontentloaded" });
    return fullUrl;
  }
}
