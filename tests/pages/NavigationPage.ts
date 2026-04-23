import { Page, Locator } from "@playwright/test";
import { BasePage, STORE_BASE } from "./BasePage";

/**
 * GNB / 메인 네비게이션 / 검색창 / 로그인·장바구니 엔트리 포인트
 *
 * ⚠️ hanssem.com 특이사항:
 * - GNB에 nav 태그 없음. `data-gtm-tracking="mall_gnb_category_depth1_button"`로 식별
 * - GNB hover 전 hidden → toBeAttached() 통과, toBeVisible() 실패
 * - 메인 검색창은 headless에서 display:none 되는 케이스 있음 → /furnishing 검색창 사용
 */
export class NavigationPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async goto(): Promise<void> {
    await this.page.goto(STORE_BASE);
  }

  gnbLink(categoryName: string): Locator {
    return this.page.locator(
      `a[data-gtm-tracking="mall_gnb_category_depth1_button"]:has-text("${categoryName}")`
    );
  }

  get searchInput(): Locator {
    return this.page.locator('input[placeholder="검색어를 입력해 주세요."]').first();
  }

  /** 홈퍼니싱 페이지 검색창 (headless 안정) */
  async openFurnishingSearch(): Promise<Locator> {
    await this.page.goto(`${STORE_BASE}/furnishing`);
    return this.searchInput;
  }

  async submitSearch(keyword: string): Promise<void> {
    const input = await this.openFurnishingSearch();
    await input.fill(keyword);
    await input.press("Enter");
    await this.page.waitForLoadState("domcontentloaded");
  }

  get loginEntryLink(): Locator {
    return this.smartLocator({
      ariaLabel: "로그인",
      role: "link",
      name: "로그인",
      text: "로그인",
    });
  }

  get cartEntryLink(): Locator {
    return this.smartLocator({
      ariaLabel: "장바구니",
      role: "link",
      name: "장바구니",
      text: "장바구니",
    });
  }
}
