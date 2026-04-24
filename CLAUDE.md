# 자비스 (JARVIS) — 프로젝트 총괄 PM

## 역할 정의
- **이름**: 자비스 (JARVIS)
- **역할**: 프로젝트 총괄 매니저 (PM)
- **보고 대상**: 사용자 (dwlee@hanssem.com)

---

# 한샘몰 서비스 품질 관리 시스템 (QA System)

## 프로젝트 개요
- **목적**: 한샘몰 자동 QA — Crawling + Random + AutoE2E 기능 검증
- **대시보드**: https://daewon82.github.io/hanssem-qa-system/
- **GitHub**: https://github.com/daewon82/hanssem-qa-system
- **스택**: Playwright + TypeScript + GitHub Actions + GitHub Pages

---

## 디렉토리 구조

```
hanssem-qa-system/
├── .github/workflows/
│   ├── playwright.yml          # 테스트 실행 (workflow_dispatch + inputs.test_filter)
│   ├── daily-trigger.yml       # KST 05:00 자동 트리거 (cron 지연 2h 감안)
│   └── retry-trigger.yml       # KST 06:00 누락 감지 재트리거
├── tests/
│   ├── utils.ts                     # updateProgress, publishResults
│   ├── ai-analyzer.ts               # Claude AI 실패 분석
│   ├── coverage.ts                  # 커버리지 통계 계산
│   ├── autoe2e-reporter.ts          # 커스텀 Playwright Reporter
│   ├── pc_mw_500_crawling.spec.ts   # PC/MW 크롤링 (MAX_LINKS 가변)
│   ├── pc_mw_200_random.spec.ts     # PC/MW 랜덤 (누적 이력 기반)
│   └── autoe2e/                     # AutoE2E 기능 테스트 (17 spec)
│       ├── global-setup.ts              # 1회 로그인 → storageState
│       ├── helpers/
│       │   ├── auth.ts                  # CREDENTIALS, URLS, login
│       │   └── gotoRetry.ts             # ERR_EMPTY_RESPONSE 재시도 헬퍼
│       ├── pages/                       # POM (BasePage/NavigationPage/CategoryPage/CartPage)
│       ├── auth.spec.ts                 # 로그인/로그아웃 (5)
│       ├── cart.spec.ts                 # 장바구니 + C21~C30 (14)
│       ├── category.spec.ts             # 9개 카테고리 + 필터 칩 (13)
│       ├── furnishing.spec.ts           # 홈퍼니싱 (6)
│       ├── interior.spec.ts             # 인테리어 (12)
│       ├── mypage.spec.ts               # MY 한샘 + 배송지 CRUD (14)
│       ├── navigation.spec.ts           # GNB (9)
│       ├── product.spec.ts              # 상품 상세 + 쿠폰 (8)
│       ├── search.spec.ts               # 검색 + D31~D40 보안 (20)
│       ├── store.spec.ts                # 매장찾기 (2)
│       ├── a11y.spec.ts                 # 접근성 L96~L100 (5)
│       ├── consistency.spec.ts          # 데이터 일관성 K91~K95 (5)
│       ├── coupon.spec.ts               # 쿠폰 I81~I85 (5)
│       ├── performance.spec.ts          # 성능 J86~J90 (5)
│       ├── price.spec.ts                # 가격 B11~B20 (10)
│       ├── quality.spec.ts              # 상품 품질 A01~A10 (10)
│       └── ui.spec.ts                   # UI/UX E41~E50 (10)
├── public/                         # 대시보드 리소스
│   ├── index.html                  # 메인 대시보드 (6 카드)
│   ├── detail.html                 # 리포트 상세 + AI 분석 박스
│   ├── incidents.html              # 장애 이력 (읽기 전용)
│   ├── results.json                # 전체 결과 + 장애 데이터
│   ├── pc_500.json / mw_500.json   # Crawling
│   ├── pc_random.json / mw_random.json
│   ├── pc_e2e.json / mw_e2e.json
│   ├── pc_url_pool.json / mw_url_pool.json        # Random 풀
│   ├── pc_tested_urls.json / mw_tested_urls.json  # 누적 이력
│   └── progress.json               # 실시간 진행상태
├── scripts/
│   └── send-jandi-summary.js       # 통합 잔디 알림 (JANDI_WEBHOOK_URL env)
├── tsconfig.json
├── playwright.config.ts
└── package.json
```

---

## Playwright 프로젝트 구성 (5개)

| Project | testMatch | 디바이스 | baseURL | retries |
|---|---|---|---|---|
| `Crawling` | `pc_mw_500_crawling.spec.ts` | 동적 (내부 context) | — | 0 |
| `Random` | `pc_mw_200_random.spec.ts` | 동적 (내부 context) | — | 0 |
| `AutoE2E_Public_PC` | `autoe2e/{public 12개}.spec.ts` | Desktop Chrome | `store.hanssem.com` | 1 |
| `AutoE2E_Authed` | `autoe2e/{auth,cart,mypage,product,coupon}.spec.ts` | Desktop Chrome + storageState | `store.hanssem.com` | 1 |
| `AutoE2E_Public_Mobile` | 동일 (Public 12개) | Pixel 5 | `m.store.hanssem.com` | 1 |

- `workers: 1` 고정 (한샘 rate-limit 회피)
- MW 프로젝트: `grepInvert: /@pc-only/` — PC 전용 테스트 제외

---

## 테스트 스위트

### Crawling (`pc_mw_500_crawling.spec.ts`)
- PC → MW 순차 (`test.describe.configure({ mode: "serial" })`)
- `MAX_LINKS`: 100 (임시) / 500 (운영)
- 필터: 도메인, 확장자, 경로 패턴, 키워드 (login/cart/order 등)
- 판정: HTTP 200 + Body 404 체크 (SPA 라우팅 방어)
- 재시도: 5xx 10초 간격 2회
- 산출물: `pc_500.json`, `mw_500.json`, `pc_url_pool.json`, `pc_tested_urls.json`

### Random (`pc_mw_200_random.spec.ts`)
- `RANDOM_COUNT`: 100 (임시) / 200 (운영)
- 크롤링이 만든 `url_pool.json` 읽어 Fisher-Yates 셔플
- 누적 이력(`tested_urls.json`)에 있는 URL 자동 제외
- 풀 < 100 시 이력 리셋 (사이클 자동 전환)

### AutoE2E (17 spec / ~140 테스트)
- `tests/autoe2e/` 하위. Page Object Model (`pages/`) + `helpers/gotoRetry.ts` 공용
- `BasePage.goto`가 자동으로 `gotoWithRetry` 사용 (ERR_EMPTY_RESPONSE 자동 회복)
- PC 전용 테스트는 **`@pc-only` 태그** → MW 프로젝트 grepInvert로 자동 제외
- 로그인 플로우:
  1. `global-setup.ts`: `HANSSEM_ID/PW` 환경변수 기반 로그인 → `.auth/user.json`
  2. 크리덴셜 없으면 빈 storageState + 경고 (Authed만 영향, 다른 프로젝트 유지)
  3. `auth.spec.ts`는 매번 실제 로그인 재수행 (`test.use({ storageState: empty })`)

---

## 커스텀 리포터 (`tests/autoe2e-reporter.ts`)

- AutoE2E 결과를 PC/MW 플랫폼별로 분리 집계
  - `AutoE2E_Public_PC` + `AutoE2E_Authed` → `pc-e2e`
  - `AutoE2E_Public_Mobile` → `mw-e2e`
- 각 리포트에 `priority` 부여 (파일별 매핑: auth/cart/product/price/coupon=critical 등)
- 실패 발생 시 Claude API로 원인 분석 (`ANTHROPIC_API_KEY` 있을 때만)
- 30초 간격 progress.json 업데이트 (pc-e2e / mw-e2e phase)

---

## GitHub Actions 워크플로우

### playwright.yml
- **트리거**: `workflow_dispatch`
- **입력**: `test_filter` (`all | pc-landing | pc-random | pc-e2e | mw-landing | mw-random | mw-e2e`)
- **case 분기**:
  - `pc-landing` → `--project=Crawling --grep "PC 랜딩"`
  - `pc-e2e` → `--project=AutoE2E_Public_PC --project=AutoE2E_Authed`
  - ...
- 결과 커밋 → peaceiris/actions-gh-pages@v3 배포 → `send-jandi-summary.js`

### daily-trigger.yml
- `cron: "0 20 * * *"` (UTC) = KST **05:00**
- GitHub cron 지연(1~2h) 감안해 앞당김 → 실효 실행 ~07:00

### retry-trigger.yml
- `cron: "0 21 * * *"` (UTC) = KST **06:00**
- daily-trigger 누락 시 보완

### Secrets
- `GITHUB_TOKEN` (자동 제공 — gh-pages 쓰기)
- `PAT_TOKEN` (daily-trigger → playwright.yml dispatch)
- `HANSSEM_ID` / `HANSSEM_PW` (AutoE2E_Authed)
- `ANTHROPIC_API_KEY` (AI 실패 분석 — 선택)
- `JANDI_WEBHOOK_URL` (잔디 알림 — 선택)

---

## 대시보드 (`public/`)

### index.html
- **커버리지 통계 바**: 누적 URL / 오늘 테스트 / 통과율 / 사이클
- **6개 카드** (3×2 그리드, PC 1행 · MW 2행):
  - PC 500 Crawling · PC 200 Random · PC E2E
  - MW 500 Crawling · MW 200 Random · MW E2E
- 각 카드: 통과율 % + 전체/통과/실패 + **[실행]** 버튼 + **[상세보기]**
- 상단 **[전체 실행]** 버튼 (기존 workflow_dispatch)
- **진행상태 폴링**: `progress.json` 10초 간격 → 현재 phase 카드 로딩 표시

### detail.html
- URL 파라미터 `?id=pc-landing` 등으로 구분
- **🤖 AI 분석 박스**: `aiAnalysis.summary / rootCauses / suggestedFixes / priority`
- 케이스 테이블: 테스트명/URL · 결과(PASS/FAIL/**SKIP**) · 소요시간 · 실패 사유
- 필터: 전체/통과/실패 + 키워드 검색

### incidents.html
- 장애 이력 (읽기 전용) — 등록/삭제 기능 제거됨

---

## 테스트 실행 중 로딩 UI (필수 규칙)

**⚠️ 클릭 즉시 UI 반응 (API 응답 대기 금지)**
1. `setRunBtn(true)` → 버튼 "테스트 실행 중"
2. 단일 실행: `setCardLoading(testId, "active", "")` / 전체: `PHASE_ORDER.forEach(...)`
3. 그 후 dispatch API 호출
4. 순서 변경 금지 — 체감 반응성 핵심

**단일 테스트 실행**: `_runningPhases = new Set([testId])` → 해당 카드만 업데이트

---

## 잔디 알림 (`scripts/send-jandi-summary.js`)

- 워크플로우 종료 시 `if: always()` 스텝으로 1회 전송
- `JANDI_WEBHOOK_URL` 환경변수 (GitHub Secrets) — 미설정 시 스킵
- **부분 실행 감지**: 6개 리포트가 모두 2시간 내 업데이트 안됐으면 전송 스킵
- 내용: 통과/실패 총계 + 6개 리포트 요약 + 실패 URL 상위 10건 + 대시보드 링크

---

## 중요 설정값

### `playwright.config.ts`
- `workers: 1` (고정)
- AutoE2E 프로젝트만 `retries: 1`
- `timeout: 7200000` (2시간)
- `trace: "off"`, `screenshot: "only-on-failure"`

### 커밋 대상 파일 (playwright.yml)
```
public/results.json public/pc_500.json public/pc_e2e.json
public/mw_500.json public/mw_e2e.json
public/pc_random.json public/mw_random.json
public/pc_url_pool.json public/mw_url_pool.json
public/pc_tested_urls.json public/mw_tested_urls.json
```

### 제외된 자동화 영역
- 실결제 7종, 회원가입/탈퇴, OAuth 간편가입, 주문 취소/반품/교환, ID/PW 찾기

---

## 디버깅 가이드

| 증상 | 원인 | 해결 |
|---|---|---|
| `ERR_EMPTY_RESPONSE` | 서버 일시 오류 | `gotoWithRetry` 자동 재시도 |
| `Timeout 30000ms` | `waitUntil: 'load'` 리소스 대기 | `{ waitUntil: 'domcontentloaded' }` |
| `body 404` (URL은 200) | SPA 라우팅 | Crawling에 body 텍스트 체크 내장 |
| MW 테스트가 PC URL 접근 | 절대 URL 하드코딩 | `BASE = ''` → Playwright baseURL 사용 |
| 카드 로딩 아이콘 즉시 안 뜸 | `pollWorkflowStatus`가 이전 cancelled run에 반응 | `_dispatchTime < 90s` grace period |
| CI만 실패, 로컬 OK | GitHub Actions 미국 IP + 고레이턴시 | `retries: 1` + `gotoWithRetry` + 셀렉터 다양화 |

---

## 자주 쓰는 명령어

```bash
# 전체 테스트
npx playwright test

# 특정 프로젝트
npx playwright test --project=AutoE2E_Public_PC

# 특정 파일
npx playwright test tests/autoe2e/search.spec.ts

# 실패 테스트만 재실행 (grep)
npx playwright test --grep "구매하기|상품 리스트"

# 디버그
npx playwright test --headed --debug

# 리포트 확인
npx playwright show-report
```

---

## 리포트 ID ↔ 파일 매핑

| ID | JSON 파일 | Playwright 프로젝트 |
|---|---|---|
| `pc-landing` | `pc_500.json` | `Crawling` (PC 테스트) |
| `mw-landing` | `mw_500.json` | `Crawling` (MW 테스트) |
| `pc-random` | `pc_random.json` | `Random` (PC 테스트) |
| `mw-random` | `mw_random.json` | `Random` (MW 테스트) |
| `pc-e2e` | `pc_e2e.json` | `AutoE2E_Public_PC` + `AutoE2E_Authed` |
| `mw-e2e` | `mw_e2e.json` | `AutoE2E_Public_Mobile` |

---

**작성 기준일**: 2026-04-24 · **버전**: v2.0
