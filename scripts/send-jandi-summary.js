/**
 * 워크플로우 종료 시 모든 테스트 결과를 통합해서 잔디로 한 번만 전송.
 *
 * 동작:
 * - public/results.json 읽어 6개 리포트 모두 집계
 * - 전체 pass / fail 요약 + 각 리포트별 상세
 * - 실패 URL 상위 10개 포함
 * - GitHub Actions 환경에서만 실행 (로컬은 스킵)
 */
const fs = require("fs");
const https = require("https");

// Jandi 웹훅 URL — 환경변수(GitHub Secrets)에서 주입, 미설정 시 알림 스킵
const JANDI_WEBHOOK_URL = process.env.JANDI_WEBHOOK_URL;
const DASHBOARD_URL = process.env.DASHBOARD_URL || "https://daewon82.github.io/hanssem-qa-system/";

if (!JANDI_WEBHOOK_URL) {
  console.log("⏭️  JANDI_WEBHOOK_URL 환경변수 미설정 — Jandi 알림 스킵");
  process.exit(0);
}

function post(url, data) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
    }, (res) => {
      let chunks = "";
      res.on("data", (c) => (chunks += c));
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve({ status: res.statusCode, body: chunks });
        else reject(new Error(`HTTP ${res.statusCode}: ${chunks}`));
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  if (!process.env.GITHUB_ACTIONS) {
    console.log("⏭️ 로컬 실행 — 잔디 통합 알림 스킵");
    return;
  }

  let data;
  try {
    data = JSON.parse(fs.readFileSync("public/results.json", "utf8"));
  } catch (e) {
    console.log("⚠️ results.json 읽기 실패:", e.message);
    return;
  }

  // 대시보드와 동일한 명칭/순서 (index.html의 REPORT_CONFIGS와 1:1 매핑)
  const DASHBOARD_NAMES = {
    "pc-landing": "PC 500 Crawling Test",
    "pc-random":  "PC 200 Random Test",
    "pc-e2e":     "PC E2E Test",
    "mw-landing": "MW 500 Crawling Test",
    "mw-random":  "MW 200 Random Test",
    "mw-e2e":     "MW E2E Test",
  };
  const ORDER = ["pc-landing", "pc-random", "pc-e2e", "mw-landing", "mw-random", "mw-e2e"];

  const reportsMap = Object.fromEntries((data.reports || []).map((r) => [r.id, r]));
  const reports = ORDER.map((id) => reportsMap[id]).filter(Boolean);

  if (reports.length === 0) {
    console.log("⚠️ 잔디 알림 스킵 — 대상 리포트 없음");
    return;
  }

  // 부분 실행 방지: 6개 리포트 모두 '최근 2시간' 내 업데이트된 경우에만 전송
  // (워크플로우 중단/실패로 일부 리포트가 빠진 경우 알림 스킵)
  const nowMs = Date.now();
  const freshnessThresholdMs = 2 * 60 * 60 * 1000; // 2시간
  const parseKst = (s) => {
    // "2026. 4. 24. AM 10:30:15" 형식 파싱
    if (!s) return 0;
    const m = s.match(/(\d{4})\.\s*(\d+)\.\s*(\d+)\.\s*(AM|PM)?\s*(\d+):(\d+):(\d+)/);
    if (!m) return 0;
    let [, y, mo, d, ampm, h, mi, se] = m;
    h = parseInt(h);
    if (ampm === "PM" && h < 12) h += 12;
    if (ampm === "AM" && h === 12) h = 0;
    return Date.UTC(+y, +mo - 1, +d, h - 9, +mi, +se); // KST → UTC ms
  };

  const missing = ORDER.filter((id) => !reportsMap[id]);
  const stale = reports.filter((r) => {
    const ts = parseKst(r.lastUpdated);
    return ts === 0 || nowMs - ts > freshnessThresholdMs;
  }).map((r) => r.id);

  if (missing.length > 0 || stale.length > 0) {
    console.log(`⚠️ 잔디 알림 스킵 — 부분 실행 감지`);
    if (missing.length > 0) console.log(`   누락: ${missing.join(", ")}`);
    if (stale.length > 0)   console.log(`   오래됨(2h 초과): ${stale.join(", ")}`);
    return;
  }

  const totalAll = reports.reduce((s, r) => s + (r.total || 0), 0);
  const passAll = reports.reduce((s, r) => s + (r.pass || 0), 0);
  const failAll = reports.reduce((s, r) => s + (r.fail || 0), 0);
  const passRate = totalAll > 0 ? ((passAll / totalAll) * 100).toFixed(1) : "0";

  const summaryLines = reports.map((r) => {
    const rate = r.passRate || "0";
    const mark = (r.fail || 0) === 0 ? "✅" : "❌";
    const name = DASHBOARD_NAMES[r.id] || r.title || r.id;
    return `${mark} ${name}: ${r.pass || 0}/${r.total || 0} (${rate}%)`;
  });

  // 실패 URL 수집 (상위 10개)
  const failUrls = [];
  for (const r of reports) {
    const name = DASHBOARD_NAMES[r.id] || r.id;
    for (const c of (r.cases || [])) {
      if (c.status === "fail") {
        failUrls.push(`[${name}] ${c.url || c.name || "-"}`);
        if (failUrls.length >= 10) break;
      }
    }
    if (failUrls.length >= 10) break;
  }

  const isOk = failAll === 0;
  const payload = {
    body: `[한샘몰 QA 일일 테스트 결과] 통과 ${passAll} / 실패 ${failAll} (총 ${totalAll}건, 통과율 ${passRate}%)`,
    connectColor: isOk ? "#00C73C" : "#FF4444",
    connectInfo: [
      { title: "📊 리포트 요약", description: summaryLines.join("\n") },
      ...(failUrls.length > 0 ? [{ title: `실패 URL (상위 ${failUrls.length}건)`, description: failUrls.join("\n") }] : []),
      { title: "📈 대시보드 보기", description: DASHBOARD_URL },
    ],
  };

  try {
    await post(JANDI_WEBHOOK_URL, payload);
    console.log(`📤 잔디 통합 알림 전송 완료 (${reports.length}개 리포트)`);
  } catch (e) {
    console.log("❌ 잔디 전송 실패:", e.message);
  }
}

main();
