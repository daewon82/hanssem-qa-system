import { chromium, FullConfig } from '@playwright/test';
import { CREDENTIALS, URLS } from './helpers/auth';
import path from 'path';
import fs from 'fs';

/**
 * 전체 테스트 전에 1회 로그인하고 세션을 storageState로 저장한다.
 * 이후 테스트들은 playwright.config.ts의 use.storageState를 통해 로그인 상태를 이어받는다.
 *
 * ⚠️ fault-tolerant: 로그인 실패해도 throw 하지 않음 (Crawling/Random/Public 테스트 보호).
 *    실패 시 빈 storageState 생성 → AutoE2E_Authed 테스트만 개별적으로 실패.
 */
export default async function globalSetup(_config: FullConfig) {
  // project root의 .auth/user.json (tests/autoe2e/ 에서 ../../.auth 로 접근)
  const storageStatePath = path.resolve(__dirname, '../../.auth/user.json');
  const storageStateDir = path.dirname(storageStatePath);
  if (!fs.existsSync(storageStateDir)) fs.mkdirSync(storageStateDir, { recursive: true });

  const emptyState = { cookies: [], origins: [] };

  // 이전 세션 캐시 초기화 (광고/추적 쿠키 누적 방지 — 매 실행 신선한 상태)
  if (fs.existsSync(storageStatePath)) {
    try { fs.unlinkSync(storageStatePath); } catch (_) {}
  }

  // 크리덴셜 검증 — 환경변수 미설정 시 명확한 경고 출력 (silent fail 방지)
  if (!CREDENTIALS.id || !CREDENTIALS.pw) {
    console.warn('');
    console.warn('⚠️⚠️⚠️ CREDENTIALS_MISSING ⚠️⚠️⚠️');
    console.warn('  HANSSEM_ID / HANSSEM_PW 환경변수가 설정되지 않았습니다.');
    console.warn('  - GitHub Actions: Repository Settings → Secrets and variables → Actions');
    console.warn('  - 로컬 실행: export HANSSEM_ID=... && export HANSSEM_PW=...');
    console.warn('  → AutoE2E_Authed 프로젝트의 모든 테스트가 실패합니다.');
    console.warn('');
    fs.writeFileSync(storageStatePath, JSON.stringify(emptyState, null, 2));
    return;  // 로그인 시도 자체를 스킵 (불필요한 30초 타임아웃 제거)
  }

  let browser;
  try {
    browser = await chromium.launch();
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto(URLS.login(), { timeout: 30000 });
    await page.locator('#custID').fill(CREDENTIALS.id);
    await page.locator('#passwd').fill(CREDENTIALS.pw);

    await Promise.all([
      page.waitForURL(/store\.hanssem\.com/, { timeout: 30000 }),
      page.locator('button.botton_st_04.black', { hasText: '로그인' }).first().click(),
    ]);

    await context.storageState({ path: storageStatePath });
    console.log('✅ globalSetup: 로그인 성공 → storageState 저장');
  } catch (e: any) {
    console.log(`⚠️ globalSetup 로그인 실패 — AutoE2E_Authed 테스트는 실패할 수 있음: ${e.message}`);
    // 빈 storageState 생성하여 후속 테스트가 fixture 로드 시 에러 없도록 함
    fs.writeFileSync(storageStatePath, JSON.stringify(emptyState, null, 2));
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}
