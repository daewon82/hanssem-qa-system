import { test, devices, Browser } from "@playwright/test";
import fs from "fs";
import axios from "axios";
import { updateProgress, publishResults } from "./utils";
import { analyzeFailures } from "./ai-analyzer";
import { updateCoverage } from "./coverage";

// [공통 설정]
const MAX_LINKS = 100;
const DASHBOARD_URL = "https://daewon82.github.io/hanssem-qa-system/";
const JANDI_WEBHOOK_URL =
  "https://wh.jandi.com/connect-api/webhook/24103837/37635b6c2df20f085651789f31762614";
const SPREADSHEET_ID = "1nZ37wkzNTDT-C7gXrH7X4ddiXyY4ZAbfG2zcSKM1n3k";

const EXCLUDE_KEYWORDS = [
  "logout",
  "login",
  "javascript",
  "order",
  "settle",
  "cart",
  "member",
  "company.hanssem.com",
];

const EXCLUDE_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png", ".gif", ".svg", ".ico", ".css", ".js", ".woff", ".woff2", ".ttf", ".zip", ".xlsx", ".docx", ".mp4", ".webp"];
const EXCLUDE_PATH_PATTERNS = ["/api/", "/__/", "/v1/", "/v2/", "/static/", "/assets/"];

const isValidPageUrl = (rawUrl: string): boolean => {
  try {
    const u = new URL(rawUrl);
    if (rawUrl.length > 400) return false;
    if (u.pathname.includes("http")) return false;
    const path = u.pathname.toLowerCase();
    if (EXCLUDE_EXTENSIONS.some((ext) => path.endsWith(ext))) return false;
    if (EXCLUDE_PATH_PATTERNS.some((p) => path.includes(p))) return false;
    return true;
  } catch {
    return false;
  }
};

interface CrawlConfig {
  platform: "PC" | "MW";
  targetDomain: string;
  linkFilterDomain: string;
  reportId: string;
  reportTitle: string;
  outputJsonFile: string;
  progressPhase: string;
  deviceOptions: any;
}

async function runCrawl(browser: Browser, config: CrawlConfig) {
  await updateProgress(config.progressPhase, 0, MAX_LINKS);

  const context = await browser.newContext({
    ...config.deviceOptions,
    baseURL: config.targetDomain,
    ignoreHTTPSErrors: true,
    bypassCSP: true,
  });
  const page = await context.newPage();

  const linkPool = new Set<string>();
  const linkQueue: string[] = [];
  const visitedLinks = new Set<string>();
  const caseResults: any[] = [];
  const failedUrls: string[] = [];

  let passCount = 0;
  let failCount = 0;

  ["public", "fail_evidence"].forEach((dir) => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
  });

  console.log(`🚀 ${config.platform} 점검 시작: ${config.targetDomain}`);

  const extractAndAddLinks = async () => {
    const rawLinks = await page.evaluate((domain) =>
      Array.from(document.querySelectorAll("a"))
        .map((a) => (a as HTMLAnchorElement).href)
        .filter(
          (h) =>
            h &&
            h.startsWith("http") &&
            h.includes(domain) &&
            !h.includes("#"),
        ),
      config.linkFilterDomain
    );

    rawLinks.forEach((l) => {
      if (
        isValidPageUrl(l) &&
        !EXCLUDE_KEYWORDS.some((k) => l.includes(k)) &&
        !visitedLinks.has(l) &&
        !linkPool.has(l) &&
        linkPool.size < 1500
      ) {
        linkPool.add(l);
        linkQueue.push(l);
      }
    });
  };

  const collectLinksHeavy = async () => {
    try {
      for (let i = 0; i < 2; i++) {
        await page.mouse.wheel(0, 3000);
        await page.waitForTimeout(400);
      }
      await extractAndAddLinks();
    } catch (err) {
      console.log("⚠️ 링크 수집 오류:", err);
    }
  };

  const collectLinksQuick = async () => {
    try {
      await extractAndAddLinks();
    } catch (err) {
      console.log("⚠️ 링크 수집 오류:", err);
    }
  };

  try {
    await page.goto(config.targetDomain, { waitUntil: "domcontentloaded", timeout: 40000 });
    await collectLinksHeavy();
  } catch (e) {
    console.log(`⚠️ 메인 페이지 초기 접속 실패: ${e}`);
  }
  console.log(`🔗 수집된 후보 링크: ${linkPool.size}개`);

  let consecutiveTimeouts = 0;
  let lastProgressUpdate = 0;

  while (visitedLinks.size < MAX_LINKS) {
    const nextLink = linkQueue.shift();

    if (!nextLink) {
      console.log("🔗 링크 풀 소진. 재수집합니다...");

      const seedCandidates = [
        config.targetDomain,
        ...Array.from(visitedLinks).filter((l) => {
          try {
            const path = new URL(l).pathname.split("/").filter(Boolean);
            return path.length <= 2;
          } catch {
            return false;
          }
        }),
      ];

      const beforeTotal = linkPool.size;
      for (const seedUrl of seedCandidates.slice(0, 20)) {
        try {
          await page.goto(seedUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
        } catch { /* 무시 */ }
        const before = linkPool.size;
        await collectLinksHeavy();
        if (linkPool.size > before) {
          console.log(`🔗 [${seedUrl}] 에서 ${linkPool.size - before}개 추가 수집`);
        }
        if (linkPool.size - beforeTotal >= 50) break;
      }

      if (linkPool.size === beforeTotal) {
        console.log("⚠️ 모든 시드 순환 후에도 새 링크 없음. 종료합니다.");
        break;
      }
      continue;
    }

    visitedLinks.add(nextLink);
    console.log(`[${config.platform}][${visitedLinks.size}/${MAX_LINKS}] 점검 중: ${nextLink}`);

    let isPass = false;
    const startMs = Date.now();
    let loadTimeSec = "0.00";
    let httpStatus: string | number = "Error";

    const attemptGoto = async (): Promise<boolean> => {
      try {
        const response = await page.goto(nextLink, { waitUntil: "domcontentloaded", timeout: 25000 });
        loadTimeSec = ((Date.now() - startMs) / 1000).toFixed(2);
        httpStatus = response?.status() || "Error";
        isPass = httpStatus === 200;

        // Body 404 체크 (SPA 라우팅: URL 200이지만 실제 에러 페이지인 경우)
        if (isPass) {
          try {
            const bodyText = await page.evaluate(() => document.body?.innerText?.slice(0, 1000) || "");
            if (/페이지를 찾을 수 없|페이지가 존재하지 않|찾으시는 페이지|잘못된 접근|404 Not Found|NOT FOUND/i.test(bodyText)) {
              isPass = false;
              httpStatus = "200(body 404)";
            } else {
              await collectLinksQuick();
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
          const safeUrl = nextLink.replace(/[/\\?%*:|"<>]/g, "-").slice(0, 200);
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
      failedUrls.push(nextLink);
      console.log(`  ❌ 실패 (${loadTimeSec}s)`);
      try {
        const safeUrl = nextLink.replace(/[/\\?%*:|"<>]/g, "-").slice(0, 200);
        await page.screenshot({ path: `fail_evidence/${safeUrl}.png`, timeout: 5000 });
      } catch { /* 무시 */ }
    }

    if (visitedLinks.size % 10 === 0 || visitedLinks.size === MAX_LINKS) {
      console.log(`[PROGRESS] ${config.platform}_500: ${visitedLinks.size}/${MAX_LINKS}`);
    }

    // 30초 간격 (gh-pages deploy 트리거 감소 목적)
    if (Date.now() - lastProgressUpdate > 30000) {
      await updateProgress(config.progressPhase, visitedLinks.size, MAX_LINKS);
      lastProgressUpdate = Date.now();
    }

    const failReason = isPass
      ? ""
      : httpStatus === "Timeout/Error"
        ? "접속 실패"
        : `${httpStatus}`;

    caseResults.push({
      name: nextLink.split("/").pop() || "HOME",
      url: nextLink,
      status: isPass ? "pass" : "fail",
      duration: `${loadTimeSec}s`,
      reason: failReason,
      priority: "medium", // crawling은 기본 medium (중요 URL 판정은 향후 도메인 로직 추가)
    });
  }

  // results.json 저장
  const totalCount = visitedLinks.size;
  const passRate = totalCount > 0 ? ((passCount / totalCount) * 100).toFixed(1) : "0";
  const kst = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
  const sheetUrl = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}`;

  let existingData: any = { lastUpdated: kst, reports: [] };
  try {
    const raw = fs.readFileSync("public/results.json", "utf8");
    existingData = JSON.parse(raw);
  } catch {}

  // AI 실패 분석 (ANTHROPIC_API_KEY 있을 때만 동작)
  const failCases = caseResults.filter((c) => c.status === "fail");
  const aiAnalysis = await analyzeFailures(
    failCases.map((c) => ({ name: c.name, url: c.url, reason: c.reason, duration: c.duration })),
    { platform: config.platform, testType: "crawling" }
  );

  const newReport: any = {
    id: config.reportId,
    title: config.reportTitle,
    lastUpdated: kst,
    total: totalCount,
    pass: passCount,
    fail: failCount,
    passRate,
    sheetUrl,
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

  // -----------------------------
  // URL 풀 저장 (랜덤 테스트용 — 누적 이력 제외)
  // -----------------------------
  const historyFile = `public/${config.platform.toLowerCase()}_tested_urls.json`;
  const poolFile = `public/${config.platform.toLowerCase()}_url_pool.json`;

  let history: string[] = [];
  try {
    history = JSON.parse(fs.readFileSync(historyFile, "utf8")).urls || [];
  } catch { /* 이력 파일 없음 — 신규 생성 */ }

  // 현재 크롤링 방문 URL을 이력에 누적
  const updatedHistory = Array.from(new Set([...history, ...Array.from(visitedLinks)]));
  const historySet = new Set(updatedHistory);

  // 풀 = 수집된 URL − 누적 이력 (과거 및 이번 크롤링에서 테스트한 URL 제외)
  let remaining = Array.from(linkPool).filter((u) => !historySet.has(u));

  // 풀이 너무 작으면 이력 리셋 (한 사이클 완료 → 다음 사이클 시작)
  if (remaining.length < 100) {
    console.log(`♻️ ${config.platform} 미테스트 URL ${remaining.length}개 — 이력 리셋 (다음 사이클 시작)`);
    const resetHistory = Array.from(visitedLinks); // 이번 크롤링만 이력에 남김
    fs.writeFileSync(historyFile, JSON.stringify({ lastUpdated: kst, urls: resetHistory }, null, 2));
    const resetSet = new Set(resetHistory);
    remaining = Array.from(linkPool).filter((u) => !resetSet.has(u));
  } else {
    fs.writeFileSync(historyFile, JSON.stringify({ lastUpdated: kst, urls: updatedHistory }, null, 2));
  }

  fs.writeFileSync(
    poolFile,
    JSON.stringify({ generated: kst, platform: config.platform, urls: remaining }, null, 2)
  );
  console.log(`📦 ${config.platform} URL 풀: ${remaining.length}개 (누적 이력: ${updatedHistory.length}개 제외)`);

  // 커버리지 통계 업데이트
  const coverage = updateCoverage();
  console.log(`📊 커버리지: 누적 ${coverage.totalUniqueUrls}개 URL (PC ${coverage.pc.uniqueUrls} / MW ${coverage.mw.uniqueUrls}), 오늘 통과율 ${coverage.todayPassRate}%`);

  // 잔디 알림 (GitHub Actions 에서만 전송)
  if (!process.env.CI) {
    console.log("⏭️ 로컬 실행 — 잔디 알림 스킵");
  } else {
    try {
      const failUrlText = failedUrls.length > 0 ? failedUrls.slice(0, 10).join("\n") : "없음";
      await axios.post(JANDI_WEBHOOK_URL, {
        body: `[${config.reportTitle}] 결과: ${passCount} 성공 / ${failCount} 실패`,
        connectColor: failCount > 0 ? "#FF4444" : "#00C73C",
        connectInfo: [
          { title: "결과 요약", description: `총 ${totalCount}건 / 통과율 ${passRate}%` },
          { title: "실패 URL", description: failUrlText },
          { title: "📊 리포트 보기", description: DASHBOARD_URL },
        ],
      });
      console.log("📤 잔디 전송 완료");
    } catch (err: any) {
      console.log("❌ 잔디 실패:", err.message);
    }
  }

  console.log(`🏁 ${config.platform} 점검 완료! 총 ${totalCount}건 확인.`);

  await context.close();
}

// PC → MW 순차 실행 보장
test.describe.configure({ mode: "serial" });

test("운영환경 한샘몰 PC 랜딩 테스트", async ({ browser }) => {
  test.setTimeout(7200000);
  await runCrawl(browser, {
    platform: "PC",
    targetDomain: "https://store.hanssem.com",
    linkFilterDomain: "store.hanssem.com",
    reportId: "pc-landing",
    reportTitle: "운영환경 PC 500개 랜딩 테스트",
    outputJsonFile: "pc_500.json",
    progressPhase: "pc-landing",
    deviceOptions: devices["Desktop Chrome"],
  });
});

test("운영환경 한샘몰 MW 랜딩 테스트", async ({ browser }) => {
  test.setTimeout(7200000);
  await runCrawl(browser, {
    platform: "MW",
    targetDomain: "https://m.store.hanssem.com",
    linkFilterDomain: "m.store.hanssem.com",
    reportId: "mw-landing",
    reportTitle: "운영환경 MW 500개 랜딩 테스트",
    outputJsonFile: "mw_500.json",
    progressPhase: "mw-landing",
    deviceOptions: devices["Pixel 5"],
  });
});
