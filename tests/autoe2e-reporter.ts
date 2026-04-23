/**
 * AutoE2E 커스텀 Playwright 리포터
 *
 * 기능:
 * - AutoE2E_* 프로젝트의 테스트 결과를 집계 → PC / MW 분리 저장
 *   - pc-e2e  ← AutoE2E_Public_PC + AutoE2E_Authed (Desktop Chrome 기반)
 *   - mw-e2e  ← AutoE2E_Public_Mobile (Pixel 5)
 * - public/pc_e2e.json + public/mw_e2e.json 저장
 * - public/results.json 의 reports 배열에 pc-e2e / mw-e2e 각각 반영
 * - Claude AI 자동 분석 연동 (ai-analyzer.ts)
 * - coverage 통계 업데이트 (coverage.ts)
 */
import type { FullResult, Reporter, TestCase, TestResult } from "@playwright/test/reporter";
import fs from "fs";
import { analyzeFailures } from "./ai-analyzer";
import { updateCoverage } from "./coverage";
import { publishResults } from "./utils";

type Platform = "PC" | "MW";

interface CaseRecord {
  name: string;
  url: string;
  status: "pass" | "fail" | "skipped";
  duration: string;
  reason: string;
  priority: "critical" | "high" | "medium" | "low";
  project: string;
  file: string;
  platform: Platform;
}

const stripAnsi = (str: string) => str.replace(/\x1B\[[0-9;]*m/g, "").trim();

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

function projectToPlatform(project: string): Platform | null {
  if (project === "AutoE2E_Public_Mobile") return "MW";
  if (project === "AutoE2E_Public_PC" || project === "AutoE2E_Authed") return "PC";
  return null;
}

class AutoE2EReporter implements Reporter {
  private cases: CaseRecord[] = [];

  onTestEnd(test: TestCase, result: TestResult): void {
    const project = test.parent.project()?.name || "";
    const platform = projectToPlatform(project);
    if (!platform) return; // AutoE2E 프로젝트가 아니면 skip

    const file = (test.location.file.split("/").pop() || "").trim();
    const priority = PRIORITY_BY_FILE[file] || "medium";

    const status: "pass" | "fail" | "skipped" =
      result.status === "passed" ? "pass" :
      result.status === "skipped" ? "skipped" : "fail";

    const reason = status === "fail"
      ? stripAnsi(result.errors?.[0]?.message?.split("\n")[0] ?? "실패").slice(0, 150)
      : "";

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
      platform,
    });
  }

  async onEnd(_result: FullResult): Promise<void> {
    if (this.cases.length === 0) return;

    const kst = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
    try { fs.mkdirSync("public", { recursive: true }); } catch {}

    // 플랫폼별로 분리하여 리포트 저장
    for (const platform of ["PC", "MW"] as Platform[]) {
      const platformCases = this.cases.filter(c => c.platform === platform);
      if (platformCases.length === 0) continue;

      const passed = platformCases.filter(c => c.status === "pass").length;
      const failed = platformCases.filter(c => c.status === "fail").length;
      const skipped = platformCases.filter(c => c.status === "skipped").length;
      const total = platformCases.length;
      const effective = total - skipped;
      const passRate = effective > 0 ? ((passed / effective) * 100).toFixed(1) : "0";

      const failCases = platformCases.filter(c => c.status === "fail");

      // AI 분석 (실패 있을 때만)
      let aiAnalysis = null;
      if (failCases.length > 0) {
        aiAnalysis = await analyzeFailures(
          failCases.map(c => ({ name: c.name, url: c.url, reason: c.reason })),
          { platform, testType: "e2e" }
        );
      }

      const reportId = platform === "PC" ? "pc-e2e" : "mw-e2e";
      const reportTitle = platform === "PC" ? "운영환경 PC E2E 테스트" : "운영환경 MW E2E 테스트";
      const outputFile = platform === "PC" ? "pc_e2e.json" : "mw_e2e.json";

      const fullPayload: any = {
        title: reportTitle,
        lastUpdated: kst,
        total, pass: passed, fail: failed, skipped,
        passRate,
        cases: platformCases,
      };
      if (aiAnalysis) fullPayload.aiAnalysis = aiAnalysis;

      fs.writeFileSync(`public/${outputFile}`, JSON.stringify(fullPayload, null, 2));

      // results.json의 reports에 반영
      let existing: any = { lastUpdated: kst, reports: [] };
      try { existing = JSON.parse(fs.readFileSync("public/results.json", "utf8")); } catch {}

      const newReport: any = {
        id: reportId,
        title: reportTitle,
        lastUpdated: kst,
        total, pass: passed, fail: failed,
        passRate,
        cases: failCases,
      };
      if (aiAnalysis) newReport.aiAnalysis = aiAnalysis;

      const idx = existing.reports.findIndex((r: any) => r.id === reportId);
      if (idx >= 0) existing.reports[idx] = newReport;
      else existing.reports.push(newReport);
      existing.lastUpdated = kst;
      fs.writeFileSync("public/results.json", JSON.stringify(existing, null, 2));

      // gh-pages 반영
      try {
        await publishResults(newReport, fullPayload, outputFile);
      } catch (e: any) {
        console.log(`⚠️ ${reportId} publishResults 실패: ${e.message}`);
      }

      console.log(`🏁 ${reportId} 완료: 총 ${total} (통과 ${passed} / 실패 ${failed} / 스킵 ${skipped})`);
    }

    try { updateCoverage(); } catch {}
  }
}

export default AutoE2EReporter;
