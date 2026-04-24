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
  // 기본 재시도 3회 (m.store.hanssem.com 간헐적 ERR_EMPTY_RESPONSE 대응)
  const retries = opts.retries ?? 3;
  // base 10s — WAF cool-down 회복 시간 확보 (이전 5s는 너무 짧아 연속 실패)
  const baseDelay = opts.retryDelayMs ?? 10000;

  let lastErr: unknown = null;
  for (let i = 0; i <= retries; i++) {
    try {
      return await page.goto(url, { waitUntil, timeout });
    } catch (e: unknown) {
      lastErr = e;
      const msg = e instanceof Error ? e.message : String(e);
      // 재시도 대상 오류만 (네트워크 계열 전부 포함)
      const retriable = /ERR_EMPTY_RESPONSE|ERR_CONNECTION|ERR_NETWORK|ERR_SOCKET|ERR_TIMED_OUT|Timeout|net::ERR/.test(msg);
      if (!retriable || i === retries) throw e;
      // ERR_EMPTY_RESPONSE는 WAF/rate-limit 가능성 — 쿠키 clear 후 재시도
      const isEmptyResp = /ERR_EMPTY_RESPONSE/.test(msg);
      if (isEmptyResp) {
        await page.context().clearCookies().catch(() => null);
      }
      // 지수 백오프: 10s → 20s → 30s (서버 회복 시간 확보)
      const backoff = baseDelay * (i + 1);
      // eslint-disable-next-line no-console
      console.log(`  ⏳ goto 재시도 (${i + 1}/${retries}, ${backoff}ms 후${isEmptyResp ? ', cookies cleared' : ''}): ${msg.slice(0, 80)}`);
      await page.waitForTimeout(backoff);
    }
  }
  throw lastErr;
}
