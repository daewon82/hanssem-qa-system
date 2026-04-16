import { test } from "@playwright/test";
import fs from "fs";
import axios from "axios";
// import { GoogleSpreadsheet } from "google-spreadsheet";
// import { authenticate } from "@google-cloud/local-auth";
// import { google } from "googleapis";

// [설정]
const TARGET_DOMAIN = "https://m.store.hanssem.com";
const MAX_LINKS = 50;

const SPREADSHEET_ID = "1nZ37wkzNTDT-C7gXrH7X4ddiXyY4ZAbfG2zcSKM1n3k";
// const TEMPLATE_GID = 1626254051;
// const TOKEN_PATH = "/Users/dwlee/Web_E2E_Test/token.json";
// const CREDENTIALS_PATH = "/Users/dwlee/Downloads/pc_secret.json";

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

const JANDI_WEBHOOK_URL =
  "https://wh.jandi.com/connect-api/webhook/24103837/37635b6c2df20f085651789f31762614";

const normalizeUrl = (url: string) =>
  url.replace(/(https?:\/\/)+/g, "https://").replace(/\/$/, "");

const DASHBOARD_URL = normalizeUrl("https://hanssem-qa-system.vercel.app");

// 구글 인증
// async function getAuthClient() {
//   if (fs.existsSync(TOKEN_PATH)) {
//     try {
//       const token = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf8"));
//       const keys = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, "utf8"));
//       const { client_id, client_secret } = keys.installed || keys.web;
//       const auth = new google.auth.OAuth2(client_id, client_secret);
//       auth.setCredentials(token);
//       auth.on("tokens", (tokens) => {
//         const updated = { ...token, ...tokens };
//         fs.writeFileSync(TOKEN_PATH, JSON.stringify(updated));
//         console.log("🔄 구글 토큰 자동 갱신 완료");
//       });
//       return auth;
//     } catch {
//       console.log("⚠️ 저장된 토큰 오류. 재인증합니다.");
//     }
//   }
//   const client = await authenticate({
//     scopes: ["https://www.googleapis.com/auth/spreadsheets"],
//     keyfilePath: CREDENTIALS_PATH,
//   });
//   if (client.credentials) {
//     const dir = TOKEN_PATH.substring(0, TOKEN_PATH.lastIndexOf("/"));
//     if (dir && !fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
//     fs.writeFileSync(TOKEN_PATH, JSON.stringify(client.credentials));
//     console.log("💾 구글 인증 토큰 저장 완료");
//   }
//   return client;
// }

test("운영환경 한샘몰 MW 랜딩 테스트", async ({ page }, testInfo) => {
  test.setTimeout(7200000);

  const linkPool = new Set<string>();
  const visitedLinks = new Set<string>();
  const caseResults: any[] = [];
  const failedUrls: string[] = [];

  let passCount = 0;
  let failCount = 0;
  let currentRow = 6;

  ["public", "fail_evidence"].forEach((dir) => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
  });

  // -----------------------------
  // 구글 시트 초기화 (비활성화)
  // -----------------------------
  // const testStartTime = new Date();
  // const auth = await getAuthClient();
  // const doc = new GoogleSpreadsheet(SPREADSHEET_ID, auth as any);
  // await doc.loadInfo();
  // const nowStr = testStartTime.toISOString().replace(/[:T]/g, "-").split(".")[0];
  // const templateSheet = doc.sheetsById[TEMPLATE_GID];
  // const newSheet = await templateSheet.duplicate({ title: `Report_OP_${nowStr}` });
  // await newSheet.loadCells("A1:J10");
  // const headers = ["URL","메뉴명","접근성ID","랜딩확인","로딩시간(초)","결과","실패 사유"];
  // headers.forEach((h, i) => { newSheet.getCell(4, i).value = h; });
  // newSheet.getCellByA1("B2").value = testStartTime.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
  // await newSheet.saveUpdatedCells();

  console.log(`🚀 점검 시작: ${testInfo.project.name}`);

  // -----------------------------
  // 링크 수집 (스크롤로 lazy-load 유발, hanssem.com 전체)
  // -----------------------------
  const collectLinks = async () => {
    try {
      // lazy-load 콘텐츠 노출을 위한 스크롤
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
              h.includes("m.store.hanssem.com") &&
              !h.includes("#"),
          ),
      );

      rawLinks.forEach((l) => {
        try {
          const url = new URL(l);
          // 경로에 프로토콜이 포함된 잘못된 URL 제외
          if (url.pathname.includes("http")) return;
        } catch {
          return;
        }

        if (
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

  // -----------------------------
  // 시작
  // -----------------------------
  await page.goto(TARGET_DOMAIN, {
    waitUntil: "domcontentloaded",
    timeout: 40000,
  });
  await collectLinks();
  console.log(`🔗 수집된 후보 링크: ${linkPool.size}개`);

  // -----------------------------
  // 메인 루프
  // -----------------------------
  while (visitedLinks.size < MAX_LINKS) {
    const nextLink = Array.from(linkPool).find((l) => !visitedLinks.has(l));

    if (!nextLink) {
      console.log("🔗 링크 풀 소진. 재수집합니다...");

      // depth 1~2 경로를 시드로 활용 (depth-1만 쓰면 금방 소진됨)
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
      // 한 페이지만 보고 break하지 않고 여러 시드에서 한 번에 수집
      for (const seedUrl of seedCandidates.slice(0, 20)) {
        try {
          await page.goto(seedUrl, {
            waitUntil: "domcontentloaded",
            timeout: 30000,
          });
        } catch {
          /* 무시 */
        }
        const before = linkPool.size;
        await collectLinks();
        if (linkPool.size > before) {
          console.log(
            `🔗 [${seedUrl}] 에서 ${linkPool.size - before}개 추가 수집`,
          );
        }
        // 충분히 모이면 중단
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

    try {
      const response = await page.goto(nextLink, {
        waitUntil: "domcontentloaded",
        timeout: 25000,
      });
      loadTimeSec = ((Date.now() - startMs) / 1000).toFixed(2);
      httpStatus = response?.status() || "Error";
      isPass = httpStatus === 200;
    } catch {
      loadTimeSec = ((Date.now() - startMs) / 1000).toFixed(2);
      httpStatus = "Timeout/Error";
      try {
        await page.evaluate(() => window.stop()).catch(() => {});
        const safeUrl = nextLink.replace(/[/\\?%*:|"<>]/g, "-");
        await page.screenshot({
          path: `fail_evidence/${safeUrl}.png`,
          timeout: 5000,
        });
      } catch {
        // 스크린샷 실패 시 무시하고 계속 진행
      }
    }

    // 구글 시트 실시간 기록 (비활성화)
    // try {
    //   await newSheet.loadCells(`A${currentRow}:G${currentRow}`);
    //   const rowData = [nextLink,"자동수집","N/A",httpStatus.toString(),loadTimeSec,isPass?"PASS":"FAIL",isPass?"-":httpStatus==="Timeout/Error"?"접속실패":"성능지연"];
    //   rowData.forEach((val, idx) => {
    //     const cell = newSheet.getCell(currentRow - 1, idx);
    //     cell.value = val;
    //     if (idx === 5 && val === "FAIL") {
    //       cell.backgroundColor = { red: 1, green: 0, blue: 0 };
    //       cell.textFormat = { foregroundColor: { red: 1, green: 1, blue: 1 }, bold: true };
    //     }
    //   });
    //   await newSheet.saveUpdatedCells();
    //   currentRow++;
    // } catch (err: any) {
    //   console.log("⚠️ 시트 기록 오류:", err.message);
    //   currentRow++;
    // }
    currentRow++;

    if (isPass) {
      passCount++;
      console.log(`  ✅ 통과 (${loadTimeSec}s)`);
    } else {
      failCount++;
      failedUrls.push(nextLink);
      console.log(`  ❌ 실패 (${loadTimeSec}s)`);
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

    // 20개마다 추가 링크 수집
    if (visitedLinks.size % 20 === 0) {
      await collectLinks();
    }
  }

  // -----------------------------
  // 구글 시트 종료 시간 기록 (비활성화)
  // -----------------------------
  // try {
  //   const endTime = new Date();
  //   await newSheet.loadCells("B3");
  //   newSheet.getCellByA1("B3").value = endTime.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
  //   await newSheet.saveUpdatedCells();
  //   console.log("📊 구글 시트 기록 완료");
  // } catch (err: any) {
  //   console.log("⚠️ 시트 종료 기록 오류:", err.message);
  // }

  // -----------------------------
  // results.json 저장
  // -----------------------------
  const totalCount = visitedLinks.size;
  const passRate =
    totalCount > 0 ? ((passCount / totalCount) * 100).toFixed(1) : "0";
  const kst = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
  const sheetUrl = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}`;

  // 기존 results.json 읽기 (다른 리포트 슬롯 보존)
  let existingData: any = { lastUpdated: kst, reports: [] };
  try {
    const raw = fs.readFileSync("public/results.json", "utf8");
    existingData = JSON.parse(raw);
  } catch {}

  const newReport = {
    id: "mw-landing",
    title: "운영환경 MW 500개 랜딩 테스트",
    lastUpdated: kst,
    total: totalCount,
    pass: passCount,
    fail: failCount,
    passRate,
    sheetUrl,
    cases: caseResults.filter((c) => c.status === "fail"),
  };

  const reportIdx = existingData.reports.findIndex(
    (r: any) => r.id === "mw-landing",
  );
  if (reportIdx >= 0) {
    existingData.reports[reportIdx] = newReport;
  } else {
    existingData.reports.push(newReport);
  }
  existingData.lastUpdated = kst;

  fs.writeFileSync(
    "public/results.json",
    JSON.stringify(existingData, null, 2),
  );

  // -----------------------------
  // mw_500.json 전체 결과 저장
  // -----------------------------
  fs.writeFileSync(
    "public/mw_500.json",
    JSON.stringify(
      {
        title: "운영환경 MW 500개 랜딩 테스트",
        lastUpdated: kst,
        total: totalCount,
        pass: passCount,
        fail: failCount,
        passRate,
        cases: caseResults,
      },
      null,
      2,
    ),
  );

  // -----------------------------
  // 잔디 알림 (GitHub Actions 에서만 전송)
  // -----------------------------
  if (!process.env.CI) {
    console.log("⏭️ 로컬 실행 — 잔디 알림 스킵");
  } else
    try {
      const failUrlText =
        failedUrls.length > 0 ? failedUrls.slice(0, 10).join("\n") : "없음";

      await axios.post(JANDI_WEBHOOK_URL, {
        body: `[운영환경 MW 500개 랜딩 테스트] 결과: ${passCount} 성공 / ${failCount} 실패`,
        connectColor: failCount > 0 ? "#FF4444" : "#00C73C",
        connectInfo: [
          {
            title: "결과 요약",
            description: `총 ${totalCount}건 / 통과율 ${passRate}%`,
          },
          { title: "실패 URL", description: failUrlText },
          { title: "📊 리포트 보기", description: DASHBOARD_URL },
        ],
      });
      console.log("📤 잔디 전송 완료");
    } catch (err: any) {
      console.log("❌ 잔디 실패:", err.message);
    }

  console.log(`🏁 모든 점검 완료! 총 ${totalCount}건 확인.`);
});
