#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# playwright.yml workflow 를 GitHub API로 dispatch 한다.
#
# 사용법:
#   bash scripts/trigger-workflow.sh
#
# 환경변수 (필수):
#   PAT_TOKEN   — repo 권한 있는 GitHub PAT
#
# 환경변수 (선택):
#   REPO        — GitHub 저장소 (기본: daewon82/hanssem-qa-system)
#   WORKFLOW    — 대상 워크플로우 파일명 (기본: playwright.yml)
#   REF         — 브랜치/태그 (기본: main)
#
# 종료 코드: 0(성공) / 1(실패)
# ─────────────────────────────────────────────────────────────

set -euo pipefail

REPO="${REPO:-daewon82/hanssem-qa-system}"
WORKFLOW="${WORKFLOW:-playwright.yml}"
REF="${REF:-main}"

if [ -z "${PAT_TOKEN:-}" ]; then
  echo "❌ PAT_TOKEN 환경변수가 설정되지 않았습니다."
  exit 1
fi

response=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: Bearer ${PAT_TOKEN}" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches" \
  -d "{\"ref\":\"${REF}\"}")

echo "HTTP status: $response"

if [ "$response" != "204" ]; then
  echo "❌ 트리거 실패 (status: $response)"
  exit 1
fi

echo "✅ ${WORKFLOW} 워크플로우 트리거 성공 (ref=${REF})"
