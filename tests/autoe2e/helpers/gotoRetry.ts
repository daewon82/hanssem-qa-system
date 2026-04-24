import type { Page, Response } from '@playwright/test';

/**
 * ERR_EMPTY_RESPONSE / 일시 타임아웃 시 자동 재시도하는 page.goto 헬퍼.
 *
 * GitHub Actions 같은 고레이턴시 환경에서 한샘몰 서버가 간헐적으로
 * connection drop / slow response 를 주는 경우를 보정한다.
 *
 * 🔧 근본 수정 (2026-04-24):
 *  - ERR_EMPTY_RESPONSE 감지 시 스토리지 전체 초기화 (localStorage/sessionStorage/cookies)
 *  - Cache-Control: no-cache 헤더로 CDN 캐시 우회
 *  - 지수 백오프 유지
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
  // 기본 재시도 3회로 상향 (m.store.hanssem.com 간헐적 ERR_EMPTY_RESPONSE 대응)
  const retries = opts.retries ?? 3;
  const baseDelay = opts.retryDelayMs ?? 5000;

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

      // ERR_EMPTY_RESPONSE 특화: 캐시/세션 불일치일 가능성 높음 → 전체 초기화
      const isEmptyResp = /ERR_EMPTY_RESPONSE/.test(msg);
      if (isEmptyResp) {
        try {
          // 1. 쿠키 초기화
          await page.context().clearCookies();
          // 2. localStorage + sessionStorage 초기화 (about:blank 에서 evaluate 불가 → try-catch)
          await page.evaluate(() => {
            try { localStorage.clear(); } catch (_) {}
            try { sessionStorage.clear(); } catch (_) {}
          }).catch(() => null);
          // 3. Cache-Control 헤더로 CDN/브라우저 캐시 우회
          await page.context().setExtraHTTPHeaders({
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
          });
          // eslint-disable-next-line no-console
          console.log(`  🧹 ERR_EMPTY_RESPONSE 감지 → 스토리지/캐시 초기화 수행`);
        } catch (_) {
          // 초기화 실패해도 재시도 자체는 진행
        }
      }

      // 지수 백오프: 5s → 10s → 15s (서버 회복 시간 확보)
      const backoff = baseDelay * (i + 1);
      // eslint-disable-next-line no-console
      console.log(`  ⏳ goto 재시도 (${i + 1}/${retries}, ${backoff}ms 후): ${msg.slice(0, 80)}`);
      await page.waitForTimeout(backoff);
    }
  }
  throw lastErr;
}
