import { test } from "@playwright/test";
import fs from "fs";
import { updateProgress, publishResults } from "./utils";

// [설정]
const TARGET_DOMAIN = "https://stg-store.hanssem.com";
const MAX_LINKS = 50;

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

test("Stage PC 랜딩 테스트", async ({ page }, testInfo) => {
  test.setTimeout(7200000);
  await updateProgress("stg-pc-landing", 0, MAX_LINKS);

  const linkPool = new Set<string>();
  const visitedLinks = new Set<string>();
  const caseResults: any[] = [];
  const failedUrls: string[] = [];

  let passCount = 0;
  let failCount = 0;

  ["public", "fail_evidence"].forEach((dir) => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
  });

  console.log(`🚀 점검 시작: ${testInfo.project.name}`);

  const collectLinks = async () => {
    try {
      for (let i = 0; i < 3; i++) {
        await page.mouse.wheel(0, 3000);
        await page.waitForTimeout(600);
      }

      const rawLinks = await page.evaluate(() =>
        Array.from(document.querySelectorAll("a"))
          .map((a) => a.href)
          .filter(
            (h) =>
              h &&
              h.startsWith("http") &&
              h.includes("stg-store.hanssem.com") &&
              !h.includes("#"),
          ),
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
        }
      });
    } catch (err) {
      console.log("⚠️ 링크 수집 오류:", err);
    }
  };

  await page.goto(TARGET_DOMAIN, { waitUntil: "domcontentloaded", timeout: 40000 });
  await collectLinks();
  console.log(`🔗 수집된 후보 링크: ${linkPool.size}개`);

  let consecutiveTimeouts = 0;
  let lastProgressUpdate = 0;

  while (visitedLinks.size < MAX_LINKS) {
    const nextLink = Array.from(linkPool).find((l) => !visitedLinks.has(l));

    if (!nextLink) {
      console.log("🔗 링크 풀 소진. 재수집합니다...");

      const seedCandidates = [
        TARGET_DOMAIN,
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
        await collectLinks();
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
    console.log(`[${visitedLinks.size}/${MAX_LINKS}] 점검 중: ${nextLink}`);

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
          const safeUrl = nextLink.replace(/[/\\?%*:|"<>]/g, "-");
          await page.screenshot({ path: `fail_evidence/${safeUrl}.png`, timeout: 5000 });
        } catch { /* 무시 */ }
      }
    }

    if (isPass) {
      passCount++;
      console.log(`  ✅ 통과 (${loadTimeSec}s)`);
    } else {
      failCount++;
      failedUrls.push(nextLink);
      console.log(`  ❌ 실패 (${loadTimeSec}s)`);
    }

    if (visitedLinks.size % 10 === 0 || visitedLinks.size === MAX_LINKS) {
      console.log(`[PROGRESS] STG_PC_500: ${visitedLinks.size}/${MAX_LINKS}`);
    }

    if (Date.now() - lastProgressUpdate > 5000) {
      await updateProgress("stg-pc-landing", visitedLinks.size, MAX_LINKS);
      lastProgressUpdate = Date.now();
    }

    const failReason = isPass ? "" : httpStatus === "Timeout/Error" ? "접속 실패" : `${httpStatus}`;

    caseResults.push({
      name: nextLink.split("/").pop() || "HOME",
      url: nextLink,
      status: isPass ? "pass" : "fail",
      duration: `${loadTimeSec}s`,
      reason: failReason,
    });

    if (visitedLinks.size % 20 === 0) {
      await collectLinks();
    }
  }

  const totalCount = visitedLinks.size;
  const passRate = totalCount > 0 ? ((passCount / totalCount) * 100).toFixed(1) : "0";
  const kst = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });

  let existingData: any = { lastUpdated: kst, reports: [], stageReports: [] };
  try {
    const raw = fs.readFileSync("public/results.json", "utf8");
    existingData = JSON.parse(raw);
    if (!existingData.stageReports) existingData.stageReports = [];
  } catch {}

  const newReport = {
    id: "stg-pc-landing",
    title: "Stage PC 500개 랜딩 테스트",
    lastUpdated: kst,
    total: totalCount,
    pass: passCount,
    fail: failCount,
    passRate,
    cases: caseResults.filter((c) => c.status === "fail"),
  };

  const reportIdx = existingData.stageReports.findIndex((r: any) => r.id === "stg-pc-landing");
  if (reportIdx >= 0) {
    existingData.stageReports[reportIdx] = newReport;
  } else {
    existingData.stageReports.push(newReport);
  }
  existingData.lastUpdated = kst;

  fs.writeFileSync("public/results.json", JSON.stringify(existingData, null, 2));

  fs.writeFileSync(
    "public/stg_pc_500.json",
    JSON.stringify({ title: "Stage PC 500개 랜딩 테스트", lastUpdated: kst, total: totalCount, pass: passCount, fail: failCount, passRate, cases: caseResults }, null, 2),
  );

  await publishResults(
    newReport,
    { title: "Stage PC 500개 랜딩 테스트", lastUpdated: kst, total: totalCount, pass: passCount, fail: failCount, passRate, cases: caseResults },
    "stg_pc_500.json"
  );

  console.log(`🏁 Stage PC 점검 완료! 총 ${totalCount}건 확인.`);
});
