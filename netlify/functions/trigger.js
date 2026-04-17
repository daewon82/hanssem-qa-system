exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const token = process.env.PAT_TOKEN;
  if (!token) {
    return { statusCode: 500, body: "PAT_TOKEN 환경변수가 설정되지 않았습니다." };
  }

  const res = await fetch(
    "https://api.github.com/repos/daewon82/hanssem-qa-system/actions/workflows/playwright.yml/dispatches",
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ref: "main" }),
    }
  );

  return {
    statusCode: res.status,
    body: res.status === 204 ? "" : await res.text(),
  };
};