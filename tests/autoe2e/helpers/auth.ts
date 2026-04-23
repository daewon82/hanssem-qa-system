import { Page, expect } from '@playwright/test';

export const CREDENTIALS = {
  id: process.env.HANSSEM_ID || 'daren82@nate.com',
  pw: process.env.HANSSEM_PW || 'daren35!',
};

export const URLS = {
  store: 'https://store.hanssem.com',
  mall: 'https://mall.hanssem.com',
  login: (returnUrl = 'https://store.hanssem.com/') =>
    `https://mall.hanssem.com/customer/mallLoginMain.do?returnUrl=${encodeURIComponent(returnUrl)}`,
};

/**
 * 로그인 폼을 직접 채워 로그인한다.
 * storageState가 없거나 로그인/로그아웃 테스트에서 직접 수행할 때 사용.
 */
export async function login(page: Page, id: string = CREDENTIALS.id, pw: string = CREDENTIALS.pw) {
  await page.goto(URLS.login());
  await page.locator('#custID').fill(id);
  await page.locator('#passwd').fill(pw);
  await Promise.all([
    page.waitForURL(/store\.hanssem\.com/, { timeout: 20000 }),
    page.locator('button.botton_st_04.black', { hasText: '로그인' }).first().click(),
  ]);
}

export async function expectLoggedIn(page: Page) {
  // 로그인 후 헤더에 "로그아웃" 텍스트가 노출됨
  await expect(page.locator('text=로그아웃').first()).toBeAttached({ timeout: 10000 });
}

export async function expectLoggedOut(page: Page) {
  await expect(page.locator('text=로그인').first()).toBeAttached({ timeout: 10000 });
}

export const isMobile = (page: Page) =>
  (page.viewportSize()?.width ?? 1280) < 600;
