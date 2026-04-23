import { test, expect } from '@playwright/test';
import { CREDENTIALS, URLS, login, expectLoggedIn, expectLoggedOut } from './helpers/auth';

test.describe('인증 - 로그인/로그아웃', () => {
  // 로그인/로그아웃 테스트는 매번 세션을 초기화한다
  test.use({ storageState: { cookies: [], origins: [] } });

  test('정상 로그인 기능 확인', async ({ page }) => {
    await login(page);
    await expectLoggedIn(page);
  });

  test('정상 로그아웃 기능 확인', async ({ page }) => {
    await login(page);
    await expectLoggedIn(page);

    // 로그아웃은 store.hanssem.com 헤더의 "로그아웃" div(버튼) 클릭 방식
    await page.goto(URLS.store);
    await page.evaluate(() => {
      const divs = Array.from(document.querySelectorAll('div'));
      const logoutTextDiv = divs.find((el) => (el.textContent || '').trim() === '로그아웃' && el.children.length <= 1);
      if (!logoutTextDiv) throw new Error('로그아웃 요소 없음');
      // 클릭 핸들러는 상위에 달려있음
      (logoutTextDiv.parentElement as HTMLElement)?.click();
    });
    await page.waitForTimeout(2000);
    await page.goto(URLS.store);
    await expectLoggedOut(page);
  });

  test('잘못된 비밀번호 입력 시 로그인 실패', async ({ page }) => {
    await page.goto(URLS.login());
    await page.locator('#custID').fill(CREDENTIALS.id);
    await page.locator('#passwd').fill('wrong_pw_1234!');

    // 에러 alert 또는 로그인 페이지 머무름 확인
    page.on('dialog', async (d) => { await d.dismiss(); });
    await page.locator('button.botton_st_04.black', { hasText: '로그인' }).first().click();
    await page.waitForTimeout(2000);

    // 여전히 로그인 페이지에 있어야 함
    expect(page.url()).toContain('mallLoginMain');
  });

  test('로그인 페이지 - 회원가입 버튼 노출', async ({ page }) => {
    await page.goto(URLS.login());
    await expect(page.locator('button:has-text("회원가입")').first()).toBeVisible();
  });

  test('로그인 페이지 - 아이디/비밀번호 찾기 버튼 노출', async ({ page }) => {
    await page.goto(URLS.login());
    await expect(page.locator('button:has-text("아이디/비밀번호 찾기")').first()).toBeVisible();
  });
});
