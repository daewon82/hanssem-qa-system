import type { Page, Response } from '@playwright/test';

/**
 * ERR_EMPTY_RESPONSE / 일시 타임아웃 시 자동 재시도하는 page.goto 헬퍼.
 *
 * GitHub Actions 같은 고레이턴시 환경에서 한샘몰 서버가 간헐적으로
 * connection drop / slow response 를 주는 경우를 보정한다.
 */
export async function gotoWithRetry(
  page: Page,
  url: string,
  opts: {
    waitUntil?: 'load' | 'domcontentloaded' | 'networkidle';
    timeout?: number;
    retries?: number;
    retryDelayMs?: number;
  } = {}
): Promise<Response | null> {
  const waitUntil = opts.waitUntil ?? 'domcontentloaded';
  const timeout = opts.timeout ?? 30000;
  const retries = opts.retries ?? 2;
  const delay = opts.retryDelayMs ?? 5000;

  let lastErr: any = null;
  for (let i = 0; i <= retries; i++) {
    try {
      return await page.goto(url, { waitUntil, timeout });
    } catch (e: any) {
      lastErr = e;
      const msg = (e?.message ?? '').toString();
      // 재시도 대상 오류만
      const retriable = /ERR_EMPTY_RESPONSE|ERR_CONNECTION|ERR_NETWORK|Timeout|net::ERR/.test(msg);
      if (!retriable || i === retries) throw e;
      // eslint-disable-next-line no-console
      console.log(`  ⏳ goto 재시도 (${i + 1}/${retries}): ${msg.slice(0, 80)}`);
      await page.waitForTimeout(delay);
    }
  }
  throw lastErr;
}
