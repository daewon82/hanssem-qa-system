import { Locator } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * 헤더/GNB 관련 요소 접근 캡슐화.
 * 셀렉터는 모두 data-gtm-tracking 속성 기반 — 텍스트 변경에 강함.
 */
export class NavigationPage extends BasePage {
  readonly gnbAttr = 'a[data-gtm-tracking="mall_gnb_category_depth1_button"]';

  gnbLink(text: string): Locator {
    return this.page.locator(`${this.gnbAttr}:has-text("${text}")`);
  }

  get searchInput(): Locator {
    return this.page.locator('input[placeholder="검색어를 입력해 주세요."]').first();
  }

  get loginEntry(): Locator {
    // 헤더의 "로그인" 텍스트를 가진 DIV (클릭은 상위 DIV에 바인딩)
    return this.page.locator('div').filter({ hasText: /^로그인$/ }).first();
  }

  get logoutEntry(): Locator {
    return this.page.locator('div').filter({ hasText: /^로그아웃$/ }).first();
  }

  get cartEntry(): Locator {
    return this.page.locator('div').filter({ hasText: /^장바구니$/ }).first();
  }

  get myPageEntry(): Locator {
    return this.page.locator('div').filter({ hasText: /^마이$/ }).first();
  }

  /**
   * 로그인 상태 여부. 로그인되어 있으면 헤더에 "로그아웃" div 표시.
   */
  async isLoggedIn(): Promise<boolean> {
    return await this.logoutEntry.count() > 0;
  }
}
