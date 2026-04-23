import { test, devices, Browser } from "@playwright/test";
import fs from "fs";
import { updateProgress, publishResults } from "./utils";
import { analyzeFailures } from "./ai-analyzer";
import { updateCoverage } from "./coverage";

// [공통 설정]
const RANDOM_COUNT = 200;

interface RandomConfig {
  platform: "PC" | "MW";
  targetDomain: string;
  reportId: string;
  reportTitle: string;
  outputJsonFile: string;
  poolFile: string;
  progressPhase: string;
  deviceOptions: any;
}

async function runRandom(browser: Browser, config: RandomConfig) {
  await updateProgress(config.progressPhase, 0, RANDOM_COUNT);

  // URL 풀 읽기 (크롤링에서 생성한 미방문 URL 목록)
  let pool: string[] = [];
  try {
    const raw = fs.readFileSync(config.poolFile, "utf8");
    pool = JSON.parse(raw).urls || [];
  } catch {
    console.log(`⚠️ ${config.platform} URL 풀 파일(${config.poolFile}) 읽기 실패 — 랜덤 테스트 스킵`);
    return;
  }

  if (pool.length === 0) {
    console.log(`⚠️ ${config.platform} URL 풀 비어있음 — 랜덤 테스트 스킵`);
    return;
  }

  // Fisher-Yates 셔플 후 N개 샘플
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const targets = shuffled.slice(0, Math.min(RANDOM_COUNT, pool.length));

  console.log(`🎲 ${config.platform} 랜덤 테스트 시작: ${targets.length}개 (풀 ${pool.length}개 중)`);

  const context = await browser.newContext({
    ...config.deviceOptions,
    baseURL: config.targetDomain,
    ignoreHTTPSErrors: true,
    bypassCSP: true,
  });
  const page = await context.newPage();

  ["public", "fail_evidence"].forEach((dir) => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
  });

  const caseResults: any[] = [];
  let passCount = 0;
  let failCount = 0;
  let consecutiveTimeouts = 0;
  let lastProgressUpdate = 0;

  for (let i = 0; i < targets.length; i++) {
    const url = targets[i];
    console.log(`[${config.platform}][${i + 1}/${targets.length}] 랜덤 점검: ${url}`);

    let isPass = false;
    const startMs = Date.now();
    let loadTimeSec = "0.00";
    let httpStatus: string | number = "Error";

    const attemptGoto = async (): Promise<boolean> => {
      try {
        const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25000 });
        loadTimeSec = ((Date.now() - startMs) / 1000).toFixed(2);
        httpStatus = response?.status() || "Error";
        isPass = httpStatus === 200;

        // Body 404 체크 (SPA 라우팅: URL 200이지만 실제 에러 페이지)
        if (isPass) {
          try {
            const bodyText = await page.evaluate(() => document.body?.innerText?.slice(0, 1000) || "");
            if (/페이지를 찾을 수 없|페이지가 존재하지 않|찾으시는 페이지|잘못된 접근|404 Not Found|NOT FOUND/i.test(bodyText)) {
              isPass = false;
              httpStatus = "200(body 404)";
            }
          } catch { /* body 확인 실패 시 pass 유지 */ }
        }

        consecutiveTimeouts = 0;
        return true;
      } catch {
        return false;
      }
    };

    const firstOk = await attemptGoto();
    if (!firstOk) {
      consecutiveTimeouts++;
      const waitSec = consecutiveTimeouts >= 3 ? 60 : 20;
      console.log(`  ⏳ 타임아웃 (연속 ${consecutiveTimeouts}회). ${waitSec}초 대기 후 재시도...`);
      await page.waitForTimeout(waitSec * 1000);
      if (consecutiveTimeouts >= 3) consecutiveTimeouts = 0;

      const retryOk = await attemptGoto();
      if (!retryOk) {
        loadTimeSec = ((Date.now() - startMs) / 1000).toFixed(2);
        httpStatus = "Timeout/Error";
        try {
          await page.evaluate(() => window.stop()).catch(() => {});
          const safeUrl = url.replace(/[/\\?%*:|"<>]/g, "-").slice(0, 200);
          await page.screenshot({ path: `fail_evidence/${safeUrl}.png`, timeout: 5000 });
        } catch { /* 무시 */ }
      }
    } else if (!isPass && typeof httpStatus === "number" && httpStatus >= 500) {
      // 5xx 서버 오류 → 10초 간격으로 최대 2회 재시도
      for (let retry = 1; retry <= 2; retry++) {
        console.log(`  ⏳ ${httpStatus} 오류. 10초 후 재시도 (${retry}/2)...`);
        await page.waitForTimeout(10000);
        await attemptGoto();
        if (isPass) break;
      }
    }

    if (isPass) {
      passCount++;
      console.log(`  ✅ 통과 (${loadTimeSec}s)`);
    } else {
      failCount++;
      console.log(`  ❌ 실패 (${loadTimeSec}s)`);
      try {
        const safeUrl = url.replace(/[/\\?%*:|"<>]/g, "-").slice(0, 200);
        await page.screenshot({ path: `fail_evidence/${safeUrl}.png`, timeout: 5000 });
      } catch { /* 무시 */ }
    }

    // 30초 간격 (gh-pages deploy 트리거 감소)
    if (Date.now() - lastProgressUpdate > 30000) {
      await updateProgress(config.progressPhase, i + 1, targets.length);
      lastProgressUpdate = Date.now();
    }

    const failReason = isPass
      ? ""
      : httpStatus === "Timeout/Error"
        ? "접속 실패"
        : `${httpStatus}`;

    caseResults.push({
      name: url.split("/").pop() || "HOME",
      url,
      status: isPass ? "pass" : "fail",
      duration: `${loadTimeSec}s`,
      reason: failReason,
      priority: "low", // random은 기본 low (discovery 성격)
    });
  }

  // 결과 저장
  const totalCount = targets.length;
  const passRate = totalCount > 0 ? ((passCount / totalCount) * 100).toFixed(1) : "0";
  const kst = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });

  let existingData: any = { lastUpdated: kst, reports: [] };
  try {
    const raw = fs.readFileSync("public/results.json", "utf8");
    existingData = JSON.parse(raw);
  } catch {}

  // AI 실패 분석 (ANTHROPIC_API_KEY 있을 때만 동작)
  const failCases = caseResults.filter((c) => c.status === "fail");
  const aiAnalysis = await analyzeFailures(
    failCases.map((c) => ({ name: c.name, url: c.url, reason: c.reason, duration: c.duration })),
    { platform: config.platform, testType: "random" }
  );

  const newReport: any = {
    id: config.reportId,
    title: config.reportTitle,
    lastUpdated: kst,
    total: totalCount,
    pass: passCount,
    fail: failCount,
    passRate,
    cases: failCases,
  };
  if (aiAnalysis) newReport.aiAnalysis = aiAnalysis;

  const reportIdx = existingData.reports.findIndex((r: any) => r.id === config.reportId);
  if (reportIdx >= 0) {
    existingData.reports[reportIdx] = newReport;
  } else {
    existingData.reports.push(newReport);
  }
  existingData.lastUpdated = kst;

  fs.writeFileSync("public/results.json", JSON.stringify(existingData, null, 2));

  const fullJsonPayload: any = { title: config.reportTitle, lastUpdated: kst, total: totalCount, pass: passCount, fail: failCount, passRate, cases: caseResults };
  if (aiAnalysis) fullJsonPayload.aiAnalysis = aiAnalysis;
  fs.writeFileSync(`public/${config.outputJsonFile}`, JSON.stringify(fullJsonPayload, null, 2));

  await publishResults(
    newReport,
    { title: config.reportTitle, lastUpdated: kst, total: totalCount, pass: passCount, fail: failCount, passRate, cases: caseResults },
    config.outputJsonFile
  );

  // 누적 테스트 이력에 이번 랜덤 URL 추가 (다음 랜덤 테스트에서 제외됨)
  const historyFile = `public/${config.platform.toLowerCase()}_tested_urls.json`;
  let history: string[] = [];
  try {
    history = JSON.parse(fs.readFileSync(historyFile, "utf8")).urls || [];
  } catch { /* 이력 파일 없음 */ }
  const updatedHistory = Array.from(new Set([...history, ...targets]));
  fs.writeFileSync(historyFile, JSON.stringify({ lastUpdated: kst, urls: updatedHistory }, null, 2));
  console.log(`📝 ${config.platform} 이력 업데이트: +${targets.length} (누적 ${updatedHistory.length}개)`);

  // 커버리지 통계 업데이트
  const coverage = updateCoverage();
  console.log(`📊 커버리지: 누적 ${coverage.totalUniqueUrls}개 URL (PC ${coverage.pc.uniqueUrls} / MW ${coverage.mw.uniqueUrls}), 오늘 통과율 ${coverage.todayPassRate}%`);

  console.log(`🏁 ${config.platform} 랜덤 점검 완료! 총 ${totalCount}건 (통과 ${passCount} / 실패 ${failCount})`);

  await context.close();
}

// PC → MW 순차 실행 보장
test.describe.configure({ mode: "serial" });

test("운영환경 한샘몰 PC 랜덤 테스트", async ({ browser }) => {
  test.setTimeout(7200000);
  await runRandom(browser, {
    platform: "PC",
    targetDomain: "https://store.hanssem.com",
    reportId: "pc-random",
    reportTitle: "운영환경 PC 200개 랜덤 테스트",
    outputJsonFile: "pc_random.json",
    poolFile: "public/pc_url_pool.json",
    progressPhase: "pc-random",
    deviceOptions: devices["Desktop Chrome"],
  });
});

test("운영환경 한샘몰 MW 랜덤 테스트", async ({ browser }) => {
  test.setTimeout(7200000);
  await runRandom(browser, {
    platform: "MW",
    targetDomain: "https://m.store.hanssem.com",
    reportId: "mw-random",
    reportTitle: "운영환경 MW 200개 랜덤 테스트",
    outputJsonFile: "mw_random.json",
    poolFile: "public/mw_url_pool.json",
    progressPhase: "mw-random",
    deviceOptions: devices["Pixel 5"],
  });
});
