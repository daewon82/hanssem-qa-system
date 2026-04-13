import { test, expect } from "@playwright/test";
import fs from "fs";
import axios from "axios";

const TARGET_DOMAIN = "https://store.hanssem.com";
const MAX_LINKS = 10; // 주인님의 목표치 반영
const EXCLUDE_KEYWORDS = ["logout", "login", "javascript", "order", "settle"];
const JANDI_WEBHOOK_URL =
  "https://wh.jandi.com/connect-api/webhook/24103837/4c878ba74e1e0cf15180f85bdd47c1f6";

test("한샘몰 통합 품질 점검 및 자비스 리포팅", async ({ page }, testInfo) => {
  test.setTimeout(7200000);

  const linkPool = new Set<string>();
  const visitedLinks = new Set<string>();
  let passCount = 0;
  let failCount = 0;

  // 케이스별 결과 기록
  const caseResults: {
    name: string;
    status: "pass" | "fail" | "warn";
    duration: string;
    note: string;
    noteType: "blue" | "red" | "amber";
  }[] = [];

  // 필요한 폴더들 미리 확인 및 생성
  ["public", "fail_evidence"].forEach((dir) => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
  });

  console.log(`🚀 자비스 점검 시작 [환경: ${testInfo.project.name}]`);

  const collectLinks = async () => {
    try {
      const rawLinks = await page.evaluate(() =>
        Array.from(document.querySelectorAll("a"))
          .map((a) => a.href)
          .filter(
            (h) =>
              h &&
              h.startsWith("http") &&
              h.includes("hanssem.com") &&
              !h.includes("#"),
          ),
      );

      rawLinks.forEach((l) => {
        if (
          !EXCLUDE_KEYWORDS.some((k) => l.includes(k)) &&
          !visitedLinks.has(l)
        ) {
          linkPool.add(l);
        }
      });
      console.log(`🔎 링크 수집됨: 현재 pool 총 ${linkPool.size}개`);
    } catch (err) {
      console.log("⚠️ 링크 수집 실패:", err);
    }
  };

  const sendToJandi = async (pass: number, fail: number, total: number) => {
    try {
      const successRate = total > 0 ? ((pass / total) * 100).toFixed(1) : "0";
      const color = fail > 0 ? "#FF0000" : "#00FF00";

      await axios.post(
        JANDI_WEBHOOK_URL,
        {
          body: `📢 [${testInfo.project.name}] 테스트 완료 보고`,
          connectColor: color,
          connectInfo: [
            {
              title: "한샘몰 품질 점검 결과",
              description: `✅ 성공: ${pass}건\n🚨 실패: ${fail}건\n📈 합계: ${total}건\n📊 품질 지수: ${successRate}%`,
            },
          ],
        },
        {
          headers: {
            Accept: "application/vnd.tosslab.jandi-v2+json",
            "Content-Type": "application/json",
          },
        },
      );
      console.log("✅ 잔디 전송 성공");
    } catch (error: any) {
      console.log("❌ 잔디 전송 실패:", error?.message);
    }
  };

  // 초기 접속 및 수집
  try {
    await page.goto(TARGET_DOMAIN, {
      waitUntil: "domcontentloaded",
      timeout: 40000,
    });
    await collectLinks();
  } catch {
    console.log("⚠️ 초기 접속 지연");
  }

  // 메인 루프
  while (visitedLinks.size < MAX_LINKS) {
    const poolArray = Array.from(linkPool);
    let link = poolArray.find((l) => !visitedLinks.has(l));

    if (!link) {
      console.log("🔄 링크 부족 → 추가 수집 중...");
      await collectLinks();
      link = Array.from(linkPool).find((l) => !visitedLinks.has(l));
      if (!link) {
        console.log("❌ 더 이상 링크 없음 → 종료");
        break;
      }
    }

    visitedLinks.add(link);
    let isPass = false;
    const startTime = Date.now();

    for (let retry = 0; retry < 3; retry++) {
      try {
        const response = await page.goto(link, {
          waitUntil: "domcontentloaded",
          timeout: 20000,
        });
        if (response?.status() === 200) {
          isPass = true;
          break;
        }
      } catch {
        if (retry === 2) {
          const safeUrl = link.replace(/[/\\?%*:|"<>]/g, "-").substring(0, 50);
          try {
            await page.screenshot({
              path: `fail_evidence/${testInfo.project.name}_${safeUrl}.png`,
            });
          } catch {}
        }
      }
    }

    const elapsed = Date.now() - startTime;
    const durationStr =
      elapsed >= 1000 ? `${(elapsed / 1000).toFixed(1)}s` : `${elapsed}ms`;

    // URL에서 페이지 이름 추출 (경로 마지막 세그먼트)
    let pageName = link;
    try {
      const url = new URL(link);
      const segments = url.pathname
        .replace(/\/$/, "")
        .split("/")
        .filter(Boolean);
      pageName =
        segments.length > 0 ? segments[segments.length - 1] : url.hostname;
      // 너무 길면 자르기
      if (pageName.length > 30) pageName = pageName.substring(0, 30) + "…";
    } catch {}

    if (isPass) {
      passCount++;
      caseResults.push({
        name: pageName,
        status: elapsed > 5000 ? "warn" : "pass",
        duration: durationStr,
        note: elapsed > 5000 ? "응답 지연" : "정상",
        noteType: elapsed > 5000 ? "amber" : "blue",
      });
    } else {
      failCount++;
      caseResults.push({
        name: pageName,
        status: "fail",
        duration: "—",
        note: "랜딩 실패",
        noteType: "red",
      });
    }

    console.log(
      `[${visitedLinks.size}/${MAX_LINKS}] ${isPass ? "✅" : "❌"} ${link}`,
    );
  }

  // 최종 요약
  const totalCount = visitedLinks.size;
  const warnCount = caseResults.filter((c) => c.status === "warn").length;
  const successRate =
    totalCount > 0
      ? parseFloat(((passCount / totalCount) * 100).toFixed(1))
      : 0;

  const overallStatus =
    failCount > 0 ? "fail" : warnCount > 0 ? "warn" : "pass";

  const summary = `📊 [${testInfo.project.name}] 최종 요약\n✅ 성공: ${passCount}\n🚨 실패: ${failCount}\n📈 총 처리: ${totalCount}`;
  console.log(
    `\n================================================\n${summary}\n================================================\n`,
  );

  // -----------------------------
  // 🔥 결과 데이터 구조화 및 저장 (수정본)
  // -----------------------------
  let existingData: any = {
    kpi: {},
    reports: [], // 초기화 확실히
    monthlyDeploys: [],
  };

  // 1. 기존 파일 읽기 시도
  if (fs.existsSync("public/results.json")) {
    try {
      const raw = fs.readFileSync("public/results.json", "utf-8");
      const parsed = JSON.parse(raw);
      // 읽어온 데이터가 있고 reports가 배열인 경우에만 덮어쓰기
      if (parsed && Array.isArray(parsed.reports)) {
        existingData = parsed;
      }
    } catch (e) {
      console.log("⚠️ 기존 리포트 읽기 실패 (새로 생성합니다)");
    }
  }

  // 이번 테스트 리포트 객체
  const thisReport = {
    title: "PC 랜덤 랜딩 테스트",
    iconLabel: "PC",
    iconBg: "#EFF4FF",
    iconColor: "#1A4F9C",
    overallStatus,
    runTime: new Date().toLocaleTimeString("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "Asia/Seoul",
    }),
    total: totalCount,
    pass: passCount,
    fail: failCount,
    warn: warnCount,
    skip: 0,
    passRate: successRate,
    col1Header: "페이지",
    colDuration: "응답시간",
    cases: caseResults,
  };

  // 2. 안전하게 reports 배열 확인 후 업데이트
  if (!existingData.reports) existingData.reports = [];

  const reportIndex = existingData.reports.findIndex(
    (r: any) => r && r.title === "PC 랜덤 랜딩 테스트",
  );

  if (reportIndex >= 0) {
    existingData.reports[reportIndex] = thisReport;
  } else {
    existingData.reports.unshift(thisReport);
  }

  // 3. KPI 및 날짜 업데이트
  const allReports = existingData.reports;
  const totalPass = allReports.reduce(
    (s: number, r: any) => s + (r.pass || 0),
    0,
  );
  const totalAll = allReports.reduce(
    (s: number, r: any) => s + (r.total || 0),
    0,
  );
  const overallRate =
    totalAll > 0 ? parseFloat(((totalPass / totalAll) * 100).toFixed(1)) : 0;

  existingData.lastUpdated = new Date().toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
  });
  existingData.kpi = {
    ...(existingData.kpi || {}),
    overallPassRate: overallRate,
    overallPassRateDelta: "최근 실행 기준",
    totalTests: totalAll,
    todayRun: totalCount,
    activeDefects: existingData.kpi?.activeDefects ?? 0,
    p1: existingData.kpi?.p1 ?? 0,
    p2: existingData.kpi?.p2 ?? 0,
    p3: existingData.kpi?.p3 ?? 0,
    emergencyDeploy: existingData.kpi?.emergencyDeploy ?? 0,
    emergencyDeployDelta: existingData.kpi?.emergencyDeployDelta ?? "",
    apiP95: existingData.kpi?.apiP95 ?? 0,
    apiTarget: existingData.kpi?.apiTarget ?? 500,
  };

  // monthlyDeploys 안전장치
  if (
    !existingData.monthlyDeploys ||
    existingData.monthlyDeploys.length === 0
  ) {
    existingData.monthlyDeploys = [
      { label: "1월", count: 0 },
      { label: "2월", count: 0 },
      { label: "3월", count: 0 },
      { label: "4월", count: 0 },
    ];
  }

  // 4. 최종 파일 저장
  if (!fs.existsSync("public")) fs.mkdirSync("public");
  fs.writeFileSync(
    "public/results.json",
    JSON.stringify(existingData, null, 2),
  );

  console.log("📊 results.json 업데이트 완료");

  // 잔디 전송
  await sendToJandi(passCount, failCount, totalCount);
});
