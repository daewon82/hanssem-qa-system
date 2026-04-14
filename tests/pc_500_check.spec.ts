import { test } from "@playwright/test";
import fs from "fs";
import axios from "axios";
import { execSync } from "child_process";

const TARGET_DOMAIN = "https://store.hanssem.com";
const MAX_LINKS = 500;

const EXCLUDE_KEYWORDS = [
  "logout",
  "login",
  "javascript",
  "order",
  "settle",
  "cart",
  "member",
];

const JANDI_WEBHOOK_URL =
  "https://wh.jandi.com/connect-api/webhook/24103837/4c878ba74e1e0cf15180f85bdd47c1f6";

// ✅ 핵심: URL 정규화 함수
const normalizeUrl = (url: string) => {
  return url.replace(/(https?:\/\/)+/g, "https://").replace(/\/$/, "");
};

// ✅ 반드시 여기만 관리
const DASHBOARD_URL = normalizeUrl("https://hanssem-qa-system.vercel.app");

test("운영환경 한샘몰 PC 랜딩 테스트", async ({ page }, testInfo) => {
  test.setTimeout(7200000);

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

  // -----------------------------
  // 링크 수집
  // -----------------------------
  const collectLinks = async () => {
    try {
      for (let i = 0; i < 2; i++) {
        await page.mouse.wheel(0, 3000);
        await page.waitForTimeout(800);
      }

      const rawLinks = await page.evaluate((domain) => {
        return Array.from(document.querySelectorAll("a"))
          .map((a) => a.href)
          .filter(
            (h) =>
              h &&
              h.startsWith(domain) &&
              !h.includes("#") &&
              !h.includes("javascript:"),
          );
      }, TARGET_DOMAIN);

      rawLinks.forEach((l) => {
        try {
          const url = new URL(l);
          // 경로에 프로토콜이 포함된 잘못된 URL 제외 (e.g. /goods/https://...)
          if (url.pathname.includes("http")) return;
        } catch {
          return;
        }

        if (
          !EXCLUDE_KEYWORDS.some((k) => l.includes(k)) &&
          !visitedLinks.has(l) &&
          !linkPool.has(l)
        ) {
          linkPool.add(l);
        }
      });
    } catch (err) {
      console.log("⚠️ 링크 수집 오류:", err);
    }
  };

  // -----------------------------
  // 시작
  // -----------------------------
  await page.goto(TARGET_DOMAIN, {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });

  await collectLinks();

  // -----------------------------
  // 메인 루프
  // -----------------------------
  while (visitedLinks.size < MAX_LINKS) {
    const nextLink = Array.from(linkPool).find((l) => !visitedLinks.has(l));

    if (!nextLink) break;

    visitedLinks.add(nextLink);

    let isPass = false;
    const startTime = Date.now();

    try {
      const response = await page.goto(nextLink, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });

      if (linkPool.size < MAX_LINKS + 50) {
        await collectLinks();
      }

      const contentCount = await page.locator("div, img").count();

      if (response?.status() === 200 && contentCount > 10) {
        isPass = true;
      }
    } catch {
      const safeUrl = nextLink.replace(/[/\\?%*:|"<>]/g, "-");
      await page.screenshot({
        path: `fail_evidence/${safeUrl}.png`,
      });
    }

    const elapsed = Date.now() - startTime;

    if (isPass) passCount++;
    else {
      failCount++;
      failedUrls.push(nextLink);
    }

    caseResults.push({
      name: nextLink.split("/").pop() || "HOME",
      status: isPass ? "pass" : "fail",
      duration: `${elapsed}ms`,
    });
  }

  // -----------------------------
  // 결과 저장
  // -----------------------------
  const totalCount = visitedLinks.size;
  const passRate =
    totalCount > 0 ? ((passCount / totalCount) * 100).toFixed(1) : "0";

  const kst = new Date().toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
  });

  const resultsData = {
    lastUpdated: kst,
    reports: [
      {
        title: "한샘몰 자동 테스트",
        total: totalCount,
        pass: passCount,
        fail: failCount,
        passRate,
        cases: caseResults,
      },
    ],
  };

  fs.writeFileSync("public/results.json", JSON.stringify(resultsData, null, 2));

  // -----------------------------
  // Git push
  // -----------------------------
  try {
    execSync("git add public/results.json");

    const status = execSync("git status --porcelain").toString().trim();

    if (status) {
      execSync(`git commit -m "auto update ${Date.now()}"`);
      execSync("git push origin main --force");
      console.log("🚀 강제 배포 완료");
    }
  } catch {
    console.log("⚠️ Git 스킵");
  }

  // -----------------------------
  // 잔디 알림
  // -----------------------------
  try {
    const failUrlText =
      failedUrls.length > 0 ? failedUrls.slice(0, 10).join("\n") : "없음";

    await axios.post(JANDI_WEBHOOK_URL, {
      body: `결과: ${passCount} 성공 / ${failCount} 실패`,
      connectColor: failCount > 0 ? "#FF4444" : "#00C73C",
      connectInfo: [
        {
          title: "결과 요약",
          description: `총 ${totalCount}건 / 통과율 ${passRate}%`,
        },
        {
          title: "실패 URL",
          description: failUrlText,
        },
        {
          title: "📊 리포트 보기",
          description: DASHBOARD_URL, // ✅ 여기 핵심
        },
      ],
    });

    console.log("📤 잔디 전송 완료");
  } catch (err: any) {
    console.log("❌ 잔디 실패:", err.message);
  }
});
