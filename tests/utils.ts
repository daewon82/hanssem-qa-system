import axios from "axios";

const REPO = "daewon82/hanssem-qa-system";
const API_URL = `https://api.github.com/repos/${REPO}/contents/progress.json`;

export async function updateProgress(phase: string): Promise<void> {
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
    const content = Buffer.from(
      JSON.stringify({ phase, startedAt: new Date().toISOString() })
    ).toString("base64");
    await axios.put(
      API_URL,
      {
        message: `progress: ${phase} [skip ci]`,
        content,
        branch: "gh-pages",
        ...(sha ? { sha } : {}),
      },
      { headers }
    );
    console.log(`📡 진행상태 업데이트: ${phase}`);
  } catch (e: any) {
    console.log(`⚠️ 진행상태 업데이트 실패: ${e.message}`);
  }
}
