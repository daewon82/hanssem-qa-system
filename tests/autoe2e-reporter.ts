/**
 * AutoE2E 커스텀 Playwright 리포터
 *
 * 기능:
 * - AutoE2E_* 프로젝트의 테스트 결과를 집계
 * - public/autoe2e.json 에 전체 결과 저장
 * - public/results.json 의 reports 배열에 `autoe2e` 리포트 업데이트
 * - Claude AI 자동 분석 연동 (ai-analyzer.ts)
 * - coverage 통계 업데이트 (coverage.ts)
 */
import type { FullConfig, FullResult, Reporter, Suite, TestCase, TestResult } from "@playwright/test/reporter";
import fs from "fs";
import { analyzeFailures } from "./ai-analyzer";
import { updateCoverage } from "./coverage";
import { publishResults } from "./utils";

interface CaseRecord {
  name: string;
  url: string;
  status: "pass" | "fail" | "skipped";
  duration: string;
  reason: string;
  priority: "critical" | "high" | "medium" | "low";
  project: string;
  file: string;
}

const stripAnsi = (str: string) => str.replace(/\x1B\[[0-9;]*m/g, "").trim();

// spec 파일별 우선순위 매핑 (critical 비즈니스 플로우 > high 주요 기능 > ...)
const PRIORITY_BY_FILE: Record<string, "critical" | "high" | "medium" | "low"> = {
  "auth.spec.ts":       "critical",
  "cart.spec.ts":       "critical",
  "product.spec.ts":    "critical",
  "mypage.spec.ts":     "high",
  "search.spec.ts":     "high",
  "navigation.spec.ts": "high",
  "category.spec.ts":   "medium",
  "furnishing.spec.ts": "medium",
  "interior.spec.ts":   "medium",
  "store.spec.ts":      "low",
};

class AutoE2EReporter implements Reporter {
  private cases: CaseRecord[] = [];

  onTestEnd(test: TestCase, result: TestResult): void {
    // AutoE2E 프로젝트만 집계
    const project = test.parent.project()?.name || "";
    if (!project.startsWith("AutoE2E")) return;

    const file = (test.location.file.split("/").pop() || "").trim();
    const priority = PRIORITY_BY_FILE[file] || "medium";

    const status: "pass" | "fail" | "skipped" =
      result.status === "passed" ? "pass" :
      result.status === "skipped" ? "skipped" : "fail";

    const reason = status === "fail"
      ? stripAnsi(result.errors?.[0]?.message?.split("\n")[0] ?? "실패").slice(0, 150)
      : "";

    // URL 추출: error 메시지에서 고르거나 빈 문자열
    let url = "";
    if (status === "fail") {
      const msg = result.errors?.[0]?.message || "";
      const m = msg.match(/navigating to "(https?:\/\/[^"]+)"/) || msg.match(/at (https?:\/\/\S+)/);
      if (m) url = m[1];
    }

    this.cases.push({
      name: test.title,
      url,
      status,
      duration: (result.duration / 1000).toFixed(2) + "s",
      reason,
      priority,
      project,
      file,
    });
  }

  async onEnd(_result: FullResult): Promise<void> {
    if (this.cases.length === 0) return; // AutoE2E 테스트가 없으면 스킵

    const passed = this.cases.filter(c => c.status === "pass").length;
    const failed = this.cases.filter(c => c.status === "fail").length;
    const skipped = this.cases.filter(c => c.status === "skipped").length;
    const total = this.cases.length;
    const effective = total - skipped; // skip 제외한 실질 테스트 수
    const passRate = effective > 0 ? ((passed / effective) * 100).toFixed(1) : "0";
    const kst = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });

    const failCases = this.cases.filter(c => c.status === "fail");

    // AI 분석 (실패 있을 때)
    let aiAnalysis = null;
    if (failCases.length > 0) {
      aiAnalysis = await analyzeFailures(
        failCases.map(c => ({ name: c.name, url: c.url, reason: c.reason })),
        { platform: "PC", testType: "e2e" }
      );
    }

    // public/autoe2e.json 전체 결과
    const fullPayload: any = {
      title: "운영환경 AutoE2E 테스트",
      lastUpdated: kst,
      total, pass: passed, fail: failed, skipped,
      passRate,
      cases: this.cases,
    };
    if (aiAnalysis) fullPayload.aiAnalysis = aiAnalysis;

    try { fs.mkdirSync("public", { recursive: true }); } catch {}
    fs.writeFileSync("public/autoe2e.json", JSON.stringify(fullPayload, null, 2));

    // public/results.json의 reports에 반영
    let existing: any = { lastUpdated: kst, reports: [] };
    try { existing = JSON.parse(fs.readFileSync("public/results.json", "utf8")); } catch {}

    const newReport: any = {
      id: "autoe2e",
      title: "운영환경 AutoE2E 테스트",
      lastUpdated: kst,
      total, pass: passed, fail: failed,
      passRate,
      cases: failCases,
    };
    if (aiAnalysis) newReport.aiAnalysis = aiAnalysis;

    const idx = existing.reports.findIndex((r: any) => r.id === "autoe2e");
    if (idx >= 0) existing.reports[idx] = newReport;
    else existing.reports.push(newReport);
    existing.lastUpdated = kst;
    fs.writeFileSync("public/results.json", JSON.stringify(existing, null, 2));

    // gh-pages 반영
    try {
      await publishResults(newReport, fullPayload, "autoe2e.json");
    } catch (e: any) {
      console.log(`⚠️ autoe2e publishResults 실패: ${e.message}`);
    }

    // 커버리지 업데이트
    try { updateCoverage(); } catch {}

    console.log(`\n🏁 AutoE2E 리포트 저장 완료: 총 ${total} (통과 ${passed} / 실패 ${failed} / 스킵 ${skipped})`);
  }
}

export default AutoE2EReporter;
