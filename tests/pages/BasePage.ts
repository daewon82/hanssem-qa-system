import { Page, Locator } from "@playwright/test";

export const STORE_BASE = "https://store.hanssem.com";
export const MALL_BASE = "https://mall.hanssem.com";
export const REMODELING_BASE = "https://remodeling.hanssem.com";
export const MW_STORE_BASE = "https://m.store.hanssem.com";

export class BasePage {
  constructor(public page: Page) {}

  get isMobile(): boolean {
    return (this.page.viewportSize()?.width ?? 1280) < 600;
  }

  /**
   * 셀렉터 우선순위에 따라 요소를 찾는 헬퍼
   * 순위: data-testid > aria-label > role+name > id > text > css
   *
   * 사용 예:
   *   await smartLocator(page, {
   *     testId: "buy-button",
   *     ariaLabel: "구매하기",
   *     role: "button",
   *     name: "구매하기",
   *     text: "구매하기",
   *     css: "button.buy"
   *   })
   */
  smartLocator(options: {
    testId?: string;
    ariaLabel?: string;
    role?: "button" | "link" | "textbox" | "heading" | "navigation";
    name?: string;
    id?: string;
    text?: string;
    css?: string;
  }): Locator {
    const p = this.page;
    const candidates: Locator[] = [];

    if (options.testId) candidates.push(p.locator(`[data-testid="${options.testId}"]`));
    if (options.ariaLabel) candidates.push(p.locator(`[aria-label="${options.ariaLabel}"]`));
    if (options.role && options.name) candidates.push(p.getByRole(options.role, { name: options.name, exact: true }));
    if (options.id) candidates.push(p.locator(`#${options.id}`));
    if (options.text) candidates.push(p.locator(`text=${options.text}`));
    if (options.css) candidates.push(p.locator(options.css));

    if (candidates.length === 0) throw new Error("smartLocator: 후보가 없습니다");

    // 첫 candidate를 기준으로 or() 체인
    return candidates.reduce((acc, loc) => acc.or(loc));
  }

  /** 페이지가 실제로 유효한지 체크 (SPA 라우팅 404 방어) */
  async isPageAvailable(): Promise<boolean> {
    try {
      const bodyText = await this.page.evaluate(() => document.body?.innerText?.slice(0, 1000) || "");
      return !/페이지를 찾을 수 없|페이지가 존재하지 않|찾으시는 페이지|잘못된 접근|404 Not Found|NOT FOUND/i.test(bodyText);
    } catch {
      return true;
    }
  }
}
