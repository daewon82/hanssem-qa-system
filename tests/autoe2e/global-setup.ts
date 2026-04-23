import { chromium, FullConfig } from '@playwright/test';
import { CREDENTIALS, URLS } from './helpers/auth';
import path from 'path';

/**
 * 전체 테스트 전에 1회 로그인하고 세션을 storageState로 저장한다.
 * 이후 테스트들은 playwright.config.ts의 use.storageState를 통해 로그인 상태를 이어받는다.
 */
export default async function globalSetup(_config: FullConfig) {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(URLS.login());
  await page.locator('#custID').fill(CREDENTIALS.id);
  await page.locator('#passwd').fill(CREDENTIALS.pw);

  await Promise.all([
    page.waitForURL(/store\.hanssem\.com/, { timeout: 30000 }),
    page.locator('button.botton_st_04.black', { hasText: '로그인' }).first().click(),
  ]);

  // project root의 .auth/user.json (tests/autoe2e/ 에서 ../../.auth 로 접근)
  const storageStatePath = path.resolve(__dirname, '../../.auth/user.json');
  await context.storageState({ path: storageStatePath });

  await browser.close();
}
