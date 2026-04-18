import axios from "axios";

const REPO = "daewon82/hanssem-qa-system";
const API_URL = `https://api.github.com/repos/${REPO}/contents/progress.json`;

export async function updateProgress(
  phase: string,
  count?: number,
  total?: number
): Promise<void> {
  if (!process.env.CI || !process.env.GITHUB_TOKEN) return;
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
