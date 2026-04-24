# 한샘몰 서비스 품질 관리 시스템 (QA System)

한샘몰 운영환경을 매일 자동 QA 하는 E2E 테스트 플랫폼입니다.

[![Dashboard](https://img.shields.io/badge/Dashboard-Live-success)](https://daewon82.github.io/hanssem-qa-system/)
[![Tests](https://img.shields.io/badge/Tests-145+-blue)]()
[![Coverage](https://img.shields.io/badge/TC_Coverage-68%25-green)]()

---

## 🎯 개요

- **대시보드**: https://daewon82.github.io/hanssem-qa-system/
- **대상 사이트**: https://store.hanssem.com
- **실행 주기**: 매일 KST 05~07시 (GitHub Actions cron)
- **스택**: Playwright · TypeScript · GitHub Actions · GitHub Pages

## 🧪 테스트 구성

| 프로젝트 | 테스트 | 용도 |
|---|---|---|
| **Crawling** | PC/MW 500 URL 랜딩 | 가용성 회귀 감지 |
| **Random** | PC/MW 200 URL 랜덤 샘플 | 누적 이력 기반 신규 URL 발견 |
| **AutoE2E_Public_PC** | 12 spec (navigation, search, quality, price 등) | 비로그인 기능 검증 |
| **AutoE2E_Authed** | 5 spec (auth, cart, mypage, product, coupon) | 로그인 필요 시나리오 |
| **AutoE2E_Public_Mobile** | 동일 12 spec (Pixel 5) | 모바일 반응형 |

**총 145+ 유니크 테스트** · 실제 실행 230회 (프로젝트 조합)

## 🚀 빠른 시작

### 로컬 실행
```bash
# 1. 의존성 설치
npm install
npm run install-browsers

# 2. 환경변수 설정 (로그인 테스트용)
export HANSSEM_ID='<테스트 계정 이메일>'
export HANSSEM_PW='<비밀번호>'

# 3. 테스트 실행
npm test                  # 전체
npm run test:pc           # PC만
npm run test:mw           # 모바일만
npm run test:autoe2e      # AutoE2E 전체
npm run test:ui           # 대화형 UI 모드
npm run test:debug        # 디버그 모드

# 4. 리포트 확인
npm run report
```

### CI 환경 (GitHub Actions)
`daily-trigger.yml` (KST 05:00) 또는 수동 workflow dispatch로 실행.
결과는 자동으로 gh-pages 브랜치에 배포되어 대시보드에 반영됨.

## 📁 프로젝트 구조

```
hanssem-qa-system/
├── tests/
│   ├── pc_mw_500_crawling.spec.ts    # 500 URL 크롤링
│   ├── pc_mw_200_random.spec.ts      # 200 URL 랜덤
│   ├── autoe2e/                      # E2E 기능 테스트 (17 spec)
│   │   ├── global-setup.ts
│   │   ├── helpers/{auth,gotoRetry}.ts
│   │   ├── pages/                    # POM (Page Object Model)
│   │   └── *.spec.ts                 # 12 public + 5 authed
│   ├── utils.ts                      # updateProgress/publishResults
│   ├── ai-analyzer.ts                # Claude AI 실패 분석
│   └── autoe2e-reporter.ts           # 커스텀 Playwright Reporter
├── public/                           # 대시보드 정적 자산
│   ├── index.html                    # 메인 대시보드 (6 카드)
│   ├── detail.html                   # 리포트 상세 + AI 분석
│   ├── incidents.html                # 장애 이력
│   └── *.json                        # results / progress / 각 리포트
├── scripts/
│   ├── send-jandi-summary.js         # Jandi 통합 알림
│   └── trigger-workflow.sh           # 공통 dispatch 헬퍼
├── .github/workflows/
│   ├── playwright.yml                # 메인 테스트 워크플로우
│   ├── daily-trigger.yml             # 매일 자동 트리거
│   └── retry-trigger.yml             # 누락 감지 재트리거
├── playwright.config.ts
├── tsconfig.json
├── CLAUDE.md                         # AI 에이전트용 프로젝트 가이드
└── DOCUMENTATION.md                  # 상세 기술 문서
```

## 🔐 보안 정책

프로덕션 저장소(public)의 특성상 다음 원칙을 엄격히 준수합니다:

- ✅ 토큰/크리덴셜은 **GitHub Secrets** 로만 주입
- ❌ 소스코드에 직접 하드코딩 금지
- ❌ `public/` 에 민감 정보 포함 금지
- ❌ GitHub push protection 우회 금지

자세한 내용은 [CLAUDE.md](./CLAUDE.md) 의 "🔐 보안 원칙" 섹션 참조.

### 환경변수 / Secrets

| 이름 | 필수 | 용도 |
|---|---|---|
| `HANSSEM_ID` | AutoE2E_Authed | 테스트 계정 ID |
| `HANSSEM_PW` | AutoE2E_Authed | 테스트 계정 PW |
| `JANDI_WEBHOOK_URL` | 선택 | Jandi 알림 |
| `ANTHROPIC_API_KEY` | 선택 | AI 실패 분석 |
| `MIN_FAILURES_FOR_AI` | 선택 (기본 3) | AI 호출 최소 실패 건수 |
| `MAX_AI_CALLS_PER_RUN` | 선택 (기본 10) | 단일 run 당 최대 AI 호출 |

## 📊 대시보드

https://daewon82.github.io/hanssem-qa-system/

- **6개 카드** (PC 3 + MW 3): 통과율 · 전체/통과/실패 + 실행 버튼
- **실시간 진행률**: progress.json 15초 폴링
- **AI 실패 분석**: Claude가 공통 원인 + 수정 제안 자동 생성
- **장애 이력 차트**: 월별 집계

## 🤖 AI 에이전트 협업 가이드

이 프로젝트는 Claude 등 AI 에이전트가 안전하게 수정할 수 있도록 `CLAUDE.md` 에 다음을 명시합니다:

- 프로젝트 구조 / Playwright 설정
- 보안 금지/필수 사항 (토큰 하드코딩 금지 등)
- 작업 전 체크리스트
- 환경변수 목록

자세한 내용: [CLAUDE.md](./CLAUDE.md) · [DOCUMENTATION.md](./DOCUMENTATION.md)

## 📜 문서

- [CLAUDE.md](./CLAUDE.md) — AI 에이전트용 프로젝트 가이드 (보안 원칙 포함)
- [DOCUMENTATION.md](./DOCUMENTATION.md) — 상세 기술 문서

## 🧭 커버리지

| 항목 | 커버 |
|---|---|
| 이커머스 일반 체크리스트 (100개) | 70개 |
| 한샘 QA 시트 (66개) | ~45개 |
| 제외 영역 | 실결제, OAuth, 회원가입·탈퇴 |

## 📅 운영 규칙

- **workers: 1** 고정 (한샘 rate-limit 회피)
- **retries: 1** (AutoE2E만 — flaky 재시도)
- 일일 결과는 gh-pages에 자동 커밋 (`[skip ci]`)
- Jandi 알림은 1회 통합 전송 (워크플로우 종료 시)

---

**문의**: dwlee@hanssem.com
