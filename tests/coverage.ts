/**
 * 테스트 커버리지 측정 유틸
 *
 * 각 테스트 종료 시 results.json의 coverage 섹션을 업데이트한다.
 * 커버리지 계산 기준:
 * - 누적 고유 URL 수 (tested_urls.json)
 * - 오늘 테스트한 URL 수
 * - 도메인별 PASS 비율
 */
import fs from "fs";

export interface CoverageStats {
  lastUpdated: string;
  pc: PlatformCoverage;
  mw: PlatformCoverage;
  totalUniqueUrls: number;          // PC + MW 누적 고유 URL 수
  todayTested: number;              // 오늘 테스트한 URL 수 (PC + MW)
  todayPassRate: string;            // 오늘 전체 PASS 비율
}

export interface PlatformCoverage {
  uniqueUrls: number;
  todayTested: number;
  todayPassed: number;
  todayFailed: number;
  cyclesCompleted: number;          // 이력 리셋 횟수 (전 사이클 완주)
}

/** tested_urls.json 읽기 */
function loadHistory(platform: "pc" | "mw"): string[] {
  try {
    const raw = fs.readFileSync(`public/${platform}_tested_urls.json`, "utf8");
    return JSON.parse(raw).urls || [];
  } catch {
    return [];
  }
}

/** 현재 reports 배열에서 해당 플랫폼의 오늘 통계 집계 */
function todayStats(reports: any[], idPrefix: string): { tested: number; passed: number; failed: number } {
  let tested = 0, passed = 0, failed = 0;
  for (const r of reports) {
    if (!r?.id?.startsWith(idPrefix + "-")) continue;
    tested += r.total || 0;
    passed += r.pass || 0;
    failed += r.fail || 0;
  }
  return { tested, passed, failed };
}

/** 기존 coverage의 cyclesCompleted 보존 + 현재 값 병합 */
export function updateCoverage(): CoverageStats {
  const resultsPath = "public/results.json";
  let data: any = { reports: [] };
  try {
    data = JSON.parse(fs.readFileSync(resultsPath, "utf8"));
  } catch {}

  const pcHistory = loadHistory("pc");
  const mwHistory = loadHistory("mw");
  const pcStats = todayStats(data.reports || [], "pc");
  const mwStats = todayStats(data.reports || [], "mw");

  const prevCoverage = data.coverage || {};
  const prevPcCycles = prevCoverage?.pc?.cyclesCompleted || 0;
  const prevMwCycles = prevCoverage?.mw?.cyclesCompleted || 0;

  // 사이클 완료 감지: 이력이 리셋된 경우 (이전 이력 대비 크게 줄었으면)
  const pcCycles = pcHistory.length < (prevCoverage?.pc?.uniqueUrls || 0) - 200 ? prevPcCycles + 1 : prevPcCycles;
  const mwCycles = mwHistory.length < (prevCoverage?.mw?.uniqueUrls || 0) - 200 ? prevMwCycles + 1 : prevMwCycles;

  const totalToday = pcStats.tested + mwStats.tested;
  const totalTodayPassed = pcStats.passed + mwStats.passed;
  const todayPassRate = totalToday > 0 ? ((totalTodayPassed / totalToday) * 100).toFixed(1) : "0";

  const coverage: CoverageStats = {
    lastUpdated: new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }),
    pc: {
      uniqueUrls: pcHistory.length,
      todayTested: pcStats.tested,
      todayPassed: pcStats.passed,
      todayFailed: pcStats.failed,
      cyclesCompleted: pcCycles,
    },
    mw: {
      uniqueUrls: mwHistory.length,
      todayTested: mwStats.tested,
      todayPassed: mwStats.passed,
      todayFailed: mwStats.failed,
      cyclesCompleted: mwCycles,
    },
    totalUniqueUrls: pcHistory.length + mwHistory.length,
    todayTested: totalToday,
    todayPassRate,
  };

  data.coverage = coverage;
  fs.writeFileSync(resultsPath, JSON.stringify(data, null, 2));
  return coverage;
}
