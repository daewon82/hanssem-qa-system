/**
 * Claude API 기반 테스트 실패 자동 분석 + 수정 제안
 *
 * 환경변수:
 *   ANTHROPIC_API_KEY      — 필수. 없으면 silent skip (로컬/개발 환경 대응)
 *   MIN_FAILURES_FOR_AI    — 선택. AI 호출 최소 실패 건수 (기본: 3). 이보다 적으면 스킵
 *   MAX_AI_CALLS_PER_RUN   — 선택. 단일 workflow run 당 최대 호출 횟수 (기본: 10). 비용 보호
 */

import * as fs from "fs";
import * as path from "path";

// 호출 카운터 파일 (workflow run 간 격리를 위해 /tmp 사용 — CI 재실행 시 리셋됨)
const CALL_COUNTER_PATH = path.resolve("/tmp/.ai-analyzer-call-count");

function incrementCallCount(): number {
  try {
    const cur = fs.existsSync(CALL_COUNTER_PATH)
      ? parseInt(fs.readFileSync(CALL_COUNTER_PATH, "utf8"), 10) || 0
      : 0;
    const next = cur + 1;
    fs.writeFileSync(CALL_COUNTER_PATH, String(next), "utf8");
    return next;
  } catch (_) {
    return 1; // 파일 IO 실패해도 호출 자체는 허용
  }
}

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

  // 최소 실패 건수 미달 시 스킵 (1~2건 실패로 매번 호출 방지)
  const minFailures = parseInt(process.env.MIN_FAILURES_FOR_AI || "3", 10);
  if (failures.length < minFailures) {
    console.log(`⏭️ AI 분석 스킵: 실패 ${failures.length}건 < 최소 ${minFailures}건`);
    return null;
  }

  // 단일 run 당 최대 호출 횟수 제한 (비용 보호)
  const maxCalls = parseInt(process.env.MAX_AI_CALLS_PER_RUN || "10", 10);
  const callCount = incrementCallCount();
  if (callCount > maxCalls) {
    console.log(`⏭️ AI 분석 스킵: 이번 run 호출 ${callCount}회 > 최대 ${maxCalls}회`);
    return null;
  }
  console.log(`🤖 AI 분석 시작 (이번 run ${callCount}/${maxCalls}회)`);

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
