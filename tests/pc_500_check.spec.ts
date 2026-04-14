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

// 대시보드 URL (잔디 버튼 링크용)
const DASHBOARD_URL = "https://hanssem-qa-system.vercel.app";

test("운영환경 한샘몰 PC 500개 랜딩 테스트 리포팅", async ({
  page,
}, testInfo) => {
  test.setTimeout(7200000);

  const linkPool = new Set<string>();
  const visitedLinks = new Set<string>();
  const caseResults: any[] = [];
  const failedUrls: string[] = []; // ① 실패 URL 수집
  let passCount = 0;
  let failCount = 0;

  ["public", "fail_evidence"].forEach((dir) => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
  });

  console.log(`🚀 [자비스 시스템 가동] 점검 시작: ${testInfo.project.name}`);

  // -----------------------------
  // [지능형 링크 수집 함수]
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

      let newFound = 0;
      rawLinks.forEach((l) => {
        if (
          !EXCLUDE_KEYWORDS.some((k) => l.includes(k)) &&
          !visitedLinks.has(l) &&
          !linkPool.has(l)
        ) {
          linkPool.add(l);
          newFound++;
        }
      });

      if (newFound > 0)
        console.log(
          `🔍 신규 링크 ${newFound}개 추가 발굴 (총 풀: ${linkPool.size}개)`,
        );
    } catch (err) {
      console.log("⚠️ 링크 수집 중 오류 발생:", err);
    }
  };

  // -----------------------------
  // [메인 프로세스]
  // -----------------------------
  try {
    await page.goto(TARGET_DOMAIN, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await collectLinks();
  } catch (err) {
    console.log("⚠️ 메인 페이지 접속 지연");
  }

  while (visitedLinks.size < MAX_LINKS) {
    const poolArray = Array.from(linkPool);
    const nextLink = poolArray.find((l) => !visitedLinks.has(l));

    if (!nextLink) {
      console.log("🏁 모든 가용한 링크를 확인했습니다.");
      break;
    }

    visitedLinks.add(nextLink);
    const startTime = Date.now();
    let isPass = false;

    console.log(`[${visitedLinks.size}/${MAX_LINKS}] 진행 중: ${nextLink}`);

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
    } catch (err) {
      const safeUrl = nextLink.replace(/[/\\?%*:|"<>]/g, "-").substring(0, 40);
      await page
        .screenshot({ path: `fail_evidence/${safeUrl}.png` })
        .catch(() => {});
    }

    const elapsed = Date.now() - startTime;
    const durationStr =
      elapsed >= 1000 ? `${(elapsed / 1000).toFixed(1)}s` : `${elapsed}ms`;

    if (isPass) {
      passCount++;
    } else {
      failCount++;
      failedUrls.push(nextLink); // ① 실패 URL 수집
    }

    caseResults.push({
      name: nextLink.split("/").pop() || "HOME",
      status: isPass ? (elapsed > 5000 ? "warn" : "pass") : "fail",
      duration: durationStr,
      note: isPass ? (elapsed > 5000 ? "지연" : "정상") : "랜딩 실패",
      noteType: isPass ? (elapsed > 5000 ? "amber" : "blue") : "red",
    });
  }

  // -----------------------------
  // [데이터 저장 및 보고]
  // -----------------------------
  const totalCount = visitedLinks.size;
  const passRate =
    totalCount > 0 ? ((passCount / totalCount) * 100).toFixed(1) : "0.0";

  const kst = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });

  const resultsData = {
    lastUpdated: kst,
    reports: [
      {
        title: "한샘몰 PC 자동 랜딩 테스트",
        overallStatus: failCount > 0 ? "fail" : "pass",
        total: totalCount,
        pass: passCount,
        fail: failCount,
        passRate,
        cases: caseResults,
      },
    ],
  };

  fs.writeFileSync("public/results.json", JSON.stringify(resultsData, null, 2));

  // Git 커밋/푸시
  try {
    execSync("git add public/results.json");
    const status = execSync("git status --porcelain").toString().trim();
    if (status) {
      execSync(`git commit -m "자비스 리포트 업데이트: ${kst}"`);
      execSync("git pull --rebase --autostash");
      execSync("git push");
      console.log("🚀 리포트 배포 완료");
    } else {
      console.log("ℹ️ 변경사항 없음 — 배포 스킵");
    }
  } catch (e) {
    console.log("⚠️ Git 배포 건너뜀");
  }

  // ② 잔디 알림 — 실패 URL 목록 + 대시보드 링크 포함
  try {
    // 실패 URL 목록 (최대 10개, 초과 시 안내)
    const failUrlText =
      failedUrls.length > 0
        ? failedUrls
            .slice(0, 10)
            .map((url, i) => `${i + 1}. ${url}`)
            .join("\n") +
          (failedUrls.length > 10
            ? `\n... 외 ${failedUrls.length - 10}건 (대시보드에서 확인)`
            : "")
        : "없음";

    await axios.post(
      JANDI_WEBHOOK_URL,
      {
        body:
          failCount > 0
            ? `❌ 테스트 완료: ${passCount}성공 / ${failCount}실패`
            : `✅ 테스트 완료: ${passCount}성공 / ${failCount}실패`,
        connectColor: failCount > 0 ? "#FF4444" : "#00C73C",
        connectInfo: [
          {
            title: "한샘몰 운영 점검 결과",
            description: `대상 건수: ${totalCount}건\n통과율: ${passRate}%\n실행 시각: ${kst}`,
          },
          // ② 실패 URL 목록
          ...(failCount > 0
            ? [
                {
                  title: `❌ 실패 URL (${failedUrls.length}건)`,
                  description: failUrlText,
                },
              ]
            : []),
          // ② 대시보드 링크 — 큰 버튼으로 표시
          {
            title: "📊 상세 리포트 보기",
            description: "https://hanssem-qa-system.vercel.app/",
          },
        ],
      },
      {
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
      },
    );
    console.log("📤 잔디 알림 전송 완료");
  } catch (err: any) {
    console.log("❌ 잔디 전송 실패:", err.message);
  }
});
