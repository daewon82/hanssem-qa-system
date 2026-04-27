import { test as base, expect } from '@playwright/test';

/**
 * AutoE2E 공용 fixture — 모든 spec이 이 파일의 test/expect를 import.
 *
 * 1) page.goto 자동 재시도 wrap
 *    - ERR_EMPTY_RESPONSE / Timeout 등 네트워크 오류 시 10/20/30s 백오프로 자동 회복
 *    - ERR_EMPTY_RESPONSE는 쿠키 clear 후 재시도 (WAF/세션 차단 회복)
 *    - 정상 케이스 동작 동일 — 실패 시에만 재시도
 *
 * 2) 실패 시 fail URL annotation 자동 부착
 *    - goto 성공 후 expect 실패한 케이스도 현재 page.url()을 캡처
 *    - 리포터가 result.errors 외에 annotations에서도 URL 추출 → 빈 URL 방지
 */
export const test = base.extend({
  page: async ({ page }, use, testInfo) => {
    // ── (1) page.goto 재시도 wrap ────────────────────────────
    const originalGoto = page.goto.bind(page);
    (page as any).goto = async function (url: string, options?: any) {
      const opts = options || {};
      const waitUntil = opts.waitUntil ?? 'domcontentloaded';
      const timeout = opts.timeout ?? 30000;
      const retries = 3;
      const baseDelay = 10000;

      let lastErr: unknown = null;
      for (let i = 0; i <= retries; i++) {
        try {
          return await originalGoto(url, { ...opts, waitUntil, timeout });
        } catch (e: unknown) {
          lastErr = e;
          const msg = e instanceof Error ? e.message : String(e);
          const retriable = /ERR_EMPTY_RESPONSE|ERR_CONNECTION|ERR_NETWORK|ERR_SOCKET|ERR_TIMED_OUT|Timeout|net::ERR/.test(msg);
          if (!retriable || i === retries) throw e;
          const isEmptyResp = /ERR_EMPTY_RESPONSE/.test(msg);
          if (isEmptyResp) {
            await page.context().clearCookies().catch(() => null);
          }
          const backoff = baseDelay * (i + 1);
          // eslint-disable-next-line no-console
          console.log(`  ⏳ goto 재시도 (${i + 1}/${retries}, ${backoff}ms 후${isEmptyResp ? ', cookies cleared' : ''}): ${msg.slice(0, 80)}`);
          await page.waitForTimeout(backoff);
        }
      }
      throw lastErr;
    };

    await use(page);

    // ── (2) 실패 시 현재 URL annotation 부착 ─────────────────
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      try {
        const currentUrl = page.url();
        if (currentUrl && currentUrl !== 'about:blank') {
          testInfo.annotations.push({ type: 'failUrl', description: currentUrl });
        }
      } catch (_) {
        /* page closed */
      }
    }
  },
});

export { expect };
