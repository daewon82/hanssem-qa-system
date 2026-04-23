import { test, devices, Browser } from "@playwright/test";
import fs from "fs";
import axios from "axios";
import { updateProgress, publishResults } from "./utils";

// [공통 설정]
const MAX_LINKS = 500;
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
        if (isPass) await collectLinksQuick();
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
      console.log(`  ⏳ ${httpStatus} 오류. 5초 후 재시도...`);
      await page.waitForTimeout(5000);
      await attemptGoto();
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

    if (Date.now() - lastProgressUpdate > 5000) {
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

  const newReport = {
    id: config.reportId,
    title: config.reportTitle,
    lastUpdated: kst,
    total: totalCount,
    pass: passCount,
    fail: failCount,
    passRate,
    sheetUrl,
    cases: caseResults.filter((c) => c.status === "fail"),
  };

  const reportIdx = existingData.reports.findIndex((r: any) => r.id === config.reportId);
  if (reportIdx >= 0) {
    existingData.reports[reportIdx] = newReport;
  } else {
    existingData.reports.push(newReport);
  }
  existingData.lastUpdated = kst;

  fs.writeFileSync("public/results.json", JSON.stringify(existingData, null, 2));

  fs.writeFileSync(
    `public/${config.outputJsonFile}`,
    JSON.stringify(
      { title: config.reportTitle, lastUpdated: kst, total: totalCount, pass: passCount, fail: failCount, passRate, cases: caseResults },
      null,
      2,
    ),
  );

  await publishResults(
    newReport,
    { title: config.reportTitle, lastUpdated: kst, total: totalCount, pass: passCount, fail: failCount, passRate, cases: caseResults },
    config.outputJsonFile
  );

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
