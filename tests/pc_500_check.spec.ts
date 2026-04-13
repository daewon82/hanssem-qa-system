import { test, expect } from "@playwright/test";
import fs from "fs";
import axios from "axios";
import nodemailer from "nodemailer";

const TARGET_DOMAIN = "https://store.hanssem.com";
const MAX_LINKS = 500;
const EXCLUDE_KEYWORDS = ["logout", "login", "javascript", "order", "settle"];

// [알림 설정]
const JANDI_WEBHOOK_URL =
  "https://wh.jandi.com/connect-api/webhook/24103837/a0a350d5a07914408b54cad34d2a7a98";

// [이메일 설정] 보안을 위해 비밀번호는 환경 변수에서 가져옵니다.
const EMAIL_AUTH = {
  user: "dwlee@hanssem.com",
  // GitHub Secrets에 저장한 값을 우선 사용하고, 로컬 테스트용으로 기본값을 둡니다.
  pass: process.env.MAIL_PASSWORD,
};
const EMAIL_RECIPIENTS =
  "jungws@hanssem.com, hanjg@hanssem.com, leesy0020@hanssem.com, byunsk@hanssem.com, jangmr0250@hanssem.com";

test("운영환경 한샘몰 PC 500개 랜딩 테스트 리포팅", async ({
  page,
}, testInfo) => {
  test.setTimeout(7200000);

  const linkPool = new Set<string>();
  const visitedLinks = new Set<string>();
  let passCount = 0;
  let failCount = 0;

  const caseResults: {
    name: string;
    status: "pass" | "fail" | "warn";
    duration: string;
    note: string;
    noteType: "blue" | "red" | "amber";
  }[] = [];

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
    } catch (err) {
      console.log("⚠️ 링크 수집 실패:", err);
    }
  };

  // --- 잔디 전송 함수 ---
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
              description: `✅ 성공: ${pass}건\n🚨 실패: ${fail}건\n📊 품질 지수: ${successRate}%\n\n👉 상세 내용은 https://hanssem-qa-system.vercel.app/ 에서 확인 가능합니다.`,
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

  // --- 이메일 전송 함수 ---
  const sendToEmail = async (pass: number, fail: number, total: number) => {
    const successRate = total > 0 ? ((pass / total) * 100).toFixed(1) : "0";

    // 사내 SMTP 설정 (메일 서버 주소는 상황에 따라 mail.hanssem.com 등으로 확인 필요)
    const transporter = nodemailer.createTransport({
      host: "mail.hanssem.com",
      port: 587,
      secure: false,
      auth: EMAIL_AUTH,
    });

    const mailOptions = {
      from: `"QA 봇" <${EMAIL_AUTH.user}>`,
      to: EMAIL_RECIPIENTS,
      subject: `📢 [QA 리포트] 한샘몰 품질 점검 결과 (${successRate}%)`,
      html: `
        <div style="font-family: 'Malgun Gothic', sans-serif; line-height: 1.6; color: #333;">
          <h2 style="color: #1A4F9C;">🚀 한샘몰 통합 품질 점검 결과</h2>
          <p>안녕하세요, 금일 실시한 운영환경 PC 500개 랜딩 테스트 점검 결과를 공유 드립니다.</p>
          <div style="padding: 20px; background: #f9f9f9; border-radius: 8px; border: 1px solid #eee;">
            <ul style="list-style: none; padding: 0;">
              <li>✅ <b>성공:</b> ${pass}건</li>
              <li>🚨 <b>실패:</b> <span style="color: red;">${fail}건</span></li>
              <li>📊 <b>품질 지수:</b> <b>${successRate}%</b></li>
            </ul>
          </div>
          <p>🔗 <b>상세 대시보드:</b> <a href="https://hanssem-qa-system.vercel.app/" style="color: #1A4F9C; font-weight: bold;">리포트 페이지 바로가기</a></p>
          <hr style="border: 0; border-top: 1px solid #eee;">
          <p style="color: #888; font-size: 11px;">* 본 메일은 QA 자동화 시스템에 의해 자동으로 발송되었습니다.</p>
        </div>
      `,
    };

    try {
      await transporter.sendMail(mailOptions);
      console.log("✅ 이메일 발송 성공");
    } catch (error: any) {
      console.log("❌ 이메일 발송 실패:", error.message);
    }
  };

  try {
    await page.goto(TARGET_DOMAIN, {
      waitUntil: "domcontentloaded",
      timeout: 40000,
    });
    await collectLinks();
  } catch {
    console.log("⚠️ 초기 접속 지연");
  }

  while (visitedLinks.size < MAX_LINKS) {
    const poolArray = Array.from(linkPool);
    let link = poolArray.find((l) => !visitedLinks.has(l));
    if (!link) {
      await collectLinks();
      link = Array.from(linkPool).find((l) => !visitedLinks.has(l));
      if (!link) break;
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
    let pageName = link;
    try {
      const url = new URL(link);
      const segments = url.pathname
        .replace(/\/$/, "")
        .split("/")
        .filter(Boolean);
      pageName =
        segments.length > 0 ? segments[segments.length - 1] : url.hostname;
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

  const totalCount = visitedLinks.size;
  const warnCount = caseResults.filter((c) => c.status === "warn").length;
  const successRate =
    totalCount > 0
      ? parseFloat(((passCount / totalCount) * 100).toFixed(1))
      : 0;
  const overallStatus =
    failCount > 0 ? "fail" : warnCount > 0 ? "warn" : "pass";

  // --- 결과 데이터 저장 로직 ---
  let existingData: any = { kpi: {}, reports: [], monthlyDeploys: [] };
  if (fs.existsSync("public/results.json")) {
    try {
      const raw = fs.readFileSync("public/results.json", "utf-8");
      existingData = JSON.parse(raw);
    } catch {}
  }

  const thisReport = {
    title: "PC 랜덤 랜딩 테스트",
    iconLabel: "PC",
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
    passRate: successRate,
    cases: caseResults,
  };

  if (!existingData.reports) existingData.reports = [];
  const idx = existingData.reports.findIndex(
    (r: any) => r.title === thisReport.title,
  );
  if (idx >= 0) existingData.reports[idx] = thisReport;
  else existingData.reports.unshift(thisReport);

  fs.writeFileSync(
    "public/results.json",
    JSON.stringify(existingData, null, 2),
  );

  // --- [최종 알림 발송] 잔디와 메일 모두 보냅니다 ---
  await sendToJandi(passCount, failCount, totalCount);
  await sendToEmail(passCount, failCount, totalCount);
});
