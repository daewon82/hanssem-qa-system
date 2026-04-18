import axios from "axios";

const REPO = "daewon82/hanssem-qa-system";
const API_URL = `https://api.github.com/repos/${REPO}/contents/progress.json`;

async function ghPagesWrite(path: string, contentObj: object, message: string): Promise<void> {
  const headers = {
    Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
    "Content-Type": "application/json",
  };
  const url = `https://api.github.com/repos/${REPO}/contents/${path}`;
  const getRes = await axios.get(`${url}?ref=gh-pages`, { headers }).catch(() => null);
  const sha = getRes?.data?.sha;
  const content = Buffer.from(JSON.stringify(contentObj, null, 2)).toString("base64");
  await axios.put(url, { message: `${message} [skip ci]`, content, branch: "gh-pages", ...(sha ? { sha } : {}) }, { headers });
}

export async function publishResults(
  report: { id: string; title: string; lastUpdated: string; total: number; pass: number; fail: number; passRate: string; sheetUrl?: string; cases: any[] },
  fullData: object,
  fullDataPath: string
): Promise<void> {
  if (!process.env.GITHUB_ACTIONS || !process.env.GITHUB_TOKEN) return;
  try {
    await ghPagesWrite(fullDataPath, fullData, `results: ${fullDataPath}`);
    const resultsUrl = `https://api.github.com/repos/${REPO}/contents/results.json`;
    const headers = { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, "Content-Type": "application/json" };
    const getRes = await axios.get(`${resultsUrl}?ref=gh-pages`, { headers }).catch(() => null);
    const sha = getRes?.data?.sha;
    let existing: any = { lastUpdated: report.lastUpdated, reports: [] };
    if (getRes?.data?.content) {
      existing = JSON.parse(Buffer.from(getRes.data.content.replace(/\n/g, ""), "base64").toString("utf8"));
    }
    const idx = existing.reports.findIndex((r: any) => r.id === report.id);
    if (idx >= 0) existing.reports[idx] = report; else existing.reports.push(report);
    existing.lastUpdated = report.lastUpdated;
    const content = Buffer.from(JSON.stringify(existing, null, 2)).toString("base64");
    await axios.put(resultsUrl, { message: `results: ${report.id} [skip ci]`, content, branch: "gh-pages", ...(sha ? { sha } : {}) }, { headers });
    console.log(`📊 ${report.id} 결과 즉시 반영 완료`);
  } catch (e: any) {
    console.log(`⚠️ publishResults 실패: ${e.message}`);
  }
}

export async function updateProgress(
  phase: string,
  count?: number,
  total?: number
): Promise<void> {
  if (!process.env.GITHUB_ACTIONS || !process.env.GITHUB_TOKEN) return;
  const headers = {
    Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
    "Content-Type": "application/json",
  };
  try {
    const getRes = await axios
      .get(`${API_URL}?ref=gh-pages`, { headers })
      .catch(() => null);
    const sha = getRes?.data?.sha;
    const payload: any = { phase, startedAt: new Date().toISOString() };
    if (count !== undefined) payload.count = count;
    if (total !== undefined) payload.total = total;
    const content = Buffer.from(JSON.stringify(payload)).toString("base64");
    await axios.put(
      API_URL,
      {
        message: `progress: ${phase}${count !== undefined ? ` ${count}/${total}` : ""} [skip ci]`,
        content,
        branch: "gh-pages",
        ...(sha ? { sha } : {}),
      },
      { headers }
    );
    console.log(`📡 진행상태 업데이트: ${phase}${count !== undefined ? ` (${count}/${total})` : ""}`);
  } catch (e: any) {
    console.log(`⚠️ 진행상태 업데이트 실패: ${e.message}`);
  }
}
