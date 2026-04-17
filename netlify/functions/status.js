exports.handler = async function () {
  const token = process.env.PAT_TOKEN;
  if (!token) {
    return { statusCode: 500, body: "PAT_TOKEN 환경변수가 설정되지 않았습니다." };
  }

  const res = await fetch(
    "https://api.github.com/repos/daewon82/hanssem-qa-system/actions/runs?status=in_progress&per_page=5",
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
      },
    }
  );

  if (!res.ok) {
    return { statusCode: res.status, body: await res.text() };
  }

  const data = await res.json();
  const running = (data.workflow_runs || []).some(
    (r) => r.path?.includes("playwright") || r.name?.includes("Playwright")
  );

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ running }),
  };
};