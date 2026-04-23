/**
 * Claude API 기반 테스트 실패 자동 분석 + 수정 제안
 *
 * 환경변수 ANTHROPIC_API_KEY 필요 (GitHub Secrets 설정).
 * API 키가 없으면 silently skip — 로컬/개발 환경에서 실패해도 테스트는 계속 진행.
 */

export interface FailureCase {
  name: string;
  url: string;
  reason: string;
  duration?: string;
}

export interface FailureAnalysis {
  summary: string;           // 공통 원인 한 줄 요약
  rootCauses: string[];      // 가능한 원인 목록
  suggestedFixes: string[];  // 수정 제안 (코드/설정 레벨)
  priority: "critical" | "high" | "medium" | "low";  // 심각도
  generatedAt: string;
  model: string;
}

const SYSTEM_PROMPT = `당신은 Playwright E2E 테스트 자동화 전문가입니다.
테스트 실패 케이스 목록을 받아 공통 원인을 분석하고 구체적 수정 방향을 한국어로 제안합니다.

분석 기준:
- 원인 분류: 서버 오류 / DOM 변경 / 타임아웃 / 셀렉터 불일치 / 네트워크 / 인증 / 기타
- 심각도 판정: critical (결제·로그인 등 핵심) > high (주요 기능) > medium (일반) > low (엣지 케이스)
- 수정 제안: 가능하면 코드 패치 예시 포함

응답은 반드시 아래 JSON 형식만 반환하세요 (마크다운 없이):
{
  "summary": "한 줄 요약",
  "rootCauses": ["원인1", "원인2"],
  "suggestedFixes": ["수정제안1 (코드 예시 포함)", "수정제안2"],
  "priority": "critical" | "high" | "medium" | "low"
}`;

/**
 * 실패 케이스를 Claude로 분석해 수정 제안 반환.
 * API 키 없으면 null 반환 (silent skip).
 */
export async function analyzeFailures(
  failures: FailureCase[],
  context: { platform: "PC" | "MW"; testType: "crawling" | "random" | "e2e" }
): Promise<FailureAnalysis | null> {
  if (failures.length === 0) return null;
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log("⏭️ ANTHROPIC_API_KEY 없음 — AI 분석 스킵");
    return null;
  }

  try {
    // 동적 import (axios로 직접 호출 — sdk 의존성 최소화)
    const axios = (await import("axios")).default;

    const userContent = JSON.stringify({
      platform: context.platform,
      testType: context.testType,
      totalFailures: failures.length,
      samples: failures.slice(0, 15), // 토큰 절약: 샘플 15개만
    }, null, 2);

    const response = await axios.post(
      "https://api.anthropic.com/v1/messages",
      {
        model: "claude-sonnet-4-6",
        max_tokens: 2048,
        system: [
          {
            type: "text",
            text: SYSTEM_PROMPT,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [{ role: "user", content: userContent }],
      },
      {
        headers: {
          "x-api-key": process.env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        timeout: 60000,
      }
    );

    const text = response.data?.content?.[0]?.text || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.log("⚠️ AI 분석 결과 JSON 파싱 실패");
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const result: FailureAnalysis = {
      summary: parsed.summary || "",
      rootCauses: parsed.rootCauses || [],
      suggestedFixes: parsed.suggestedFixes || [],
      priority: parsed.priority || "medium",
      generatedAt: new Date().toISOString(),
      model: "claude-sonnet-4-6",
    };

    console.log(`🤖 AI 분석 완료: ${result.summary} (${result.priority})`);
    return result;
  } catch (e: any) {
    console.log(`⚠️ AI 분석 실패: ${e.message}`);
    return null;
  }
}
