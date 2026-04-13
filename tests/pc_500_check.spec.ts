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

test("운영환경 한샘몰 PC 500개 랜딩 테스트 리포팅", async ({
  page,
}, testInfo) => {
  // 테스트 제한 시간 설정 (2시간)
  test.setTimeout(7200000);

  const linkPool = new Set<string>();
  const visitedLinks = new Set<string>();
  const caseResults: any[] = [];
  let passCount = 0;
  let failCount = 0;

  // 폴더 생성
  ["public", "fail_evidence"].forEach((dir) => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
  });

  console.log(`🚀 [자비스 시스템 가동] 점검 시작: ${testInfo.project.name}`);

  // -----------------------------
  // [지능형 링크 수집 함수]
  // -----------------------------
  const collectLinks = async () => {
    try {
      // 1. 동적 로딩을 위해 스크롤 다운
      for (let i = 0; i < 2; i++) {
        await page.mouse.wheel(0, 3000);
        await page.waitForTimeout(800);
      }

      // 2. 현재 페이지의 모든 유효한 링크 추출
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

  // ① networkidle → domcontentloaded 로 변경 (타임아웃 위험 감소)
  try {
    await page.goto(TARGET_DOMAIN, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await collectLinks();
  } catch (err) {
    console.log("⚠️ 메인 페이지 접속 지연");
  }

  // 2. 루프: 500개 도달 시까지 반복 탐색
  while (visitedLinks.size < MAX_LINKS) {
    const poolArray = Array.from(linkPool);
    const nextLink = poolArray.find((l) => !visitedLinks.has(l));

    // 더 이상 갈 곳이 없으면 중단
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

      // 페이지 이동할 때마다 새로운 링크를 풀에 보충 (500개 채울 때까지)
      if (linkPool.size < MAX_LINKS + 50) {
        await collectLinks();
      }

      // 콘텐츠 존재 여부 확인
      const contentCount = await page.locator("div, img").count();
      if (response?.status() === 200 && contentCount > 10) {
        isPass = true;
      }
    } catch (err) {
      // 실패 시 스크린샷 저장
      const safeUrl = nextLink.replace(/[/\\?%*:|"<>]/g, "-").substring(0, 40);
      await page
        .screenshot({ path: `fail_evidence/${safeUrl}.png` })
        .catch(() => {});
    }

    // 결과 정산
    const elapsed = Date.now() - startTime;
    const durationStr =
      elapsed >= 1000 ? `${(elapsed / 1000).toFixed(1)}s` : `${elapsed}ms`;

    if (isPass) passCount++;
    else failCount++;

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

  // ② 0으로 나누기 방지
  const passRate =
    totalCount > 0 ? ((passCount / totalCount) * 100).toFixed(1) : "0.0";

  const resultsData = {
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

  // ③ Git 변경사항 있을 때만 커밋/푸시
  try {
    execSync("git add public/results.json");
    const status = execSync("git status --porcelain").toString().trim();
    if (status) {
      execSync(
        `git commit -m "자비스 리포트 업데이트: ${new Date().toISOString()}"`,
      );
      execSync("git pull --rebase --autostash");
      execSync("git push");
      console.log("🚀 리포트 배포 완료");
    } else {
      console.log("ℹ️ 변경사항 없음 — 배포 스킵");
    }
  } catch (e) {
    console.log("⚠️ Git 배포 건너뜀");
  }

  // ④ 잔디 알림 전송 — Content-Type / Accept 헤더 추가
  try {
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
            description: `대상 건수: ${totalCount}\n성공률: ${passRate}%`,
          },
          {
            title: "실행 시각",
            description: new Date().toLocaleString("ko-KR", {
              timeZone: "Asia/Seoul",
            }),
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
