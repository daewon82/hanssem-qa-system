# 한샘몰 서비스 품질 관리 대시보드

> 한샘몰 운영환경의 프론트엔드/기능 품질을 자동으로 점검·리포팅하는 테스트 플랫폼

**대시보드**: https://daewon82.github.io/hanssem-qa-system/
**저장소**: https://github.com/daewon82/hanssem-qa-system

---

## 1. 프로젝트 개요

### 1.1 목적
- 한샘몰(`store.hanssem.com`, `m.store.hanssem.com`, `mall.hanssem.com`) 전 구간의 **가용성·기능 회귀 감지**
- 매일 자동 실행으로 **서비스 품질 변화 추적**
- 실패 원인의 **AI 기반 자동 분석**으로 개발팀 대응 시간 단축

### 1.2 핵심 가치
| 가치 | 구현 |
|---|---|
| **광역 커버리지** | 500개 URL 크롤링 + 200개 랜덤 샘플 + 140+ E2E 기능 테스트 |
| **재현성** | Crawling은 결정적, E2E는 TC 번호 기반 |
| **발견성** | Random 테스트로 크롤링 미방문 URL 탐지 — 누적 이력 관리로 매일 새 URL 커버 |
| **관찰성** | 실시간 진행률, 누적 커버리지, AI 실패 분석 대시보드 |

### 1.3 스택
- **테스트 프레임워크**: Playwright + TypeScript
- **실행 인프라**: GitHub Actions (Ubuntu 러너)
- **결과 호스팅**: GitHub Pages (`gh-pages` 브랜치)
- **알림**: 잔디(Jandi) 웹훅
- **AI 분석**: Claude Sonnet 4.6 (Anthropic API)

---

## 2. 시스템 구조

### 2.1 전체 아키텍처

```
┌─────────────────┐
│ Daily Trigger   │ ← 매일 KST 07:00 자동 실행 (cron)
│ (07:00 KST)     │
└────────┬────────┘
         │ workflow_dispatch
         ▼
┌─────────────────────────────────────┐
│ Playwright Tests (GitHub Actions)   │
│                                     │
│ 1. Crawling   (PC→MW 100 URL)      │ ← pc_mw_500_crawling.spec.ts
│ 2. Random     (PC→MW 200 URL)      │ ← pc_mw_200_random.spec.ts
│ 3. AutoE2E_Public_PC  (Desktop)    │ ← autoe2e/*.spec.ts (비로그인)
│ 4. AutoE2E_Authed     (Desktop)    │ ← autoe2e/*.spec.ts (로그인)
│ 5. AutoE2E_Public_Mobile (Pixel 5) │ ← autoe2e/*.spec.ts (모바일)
│                                     │
│ → public/results.json 업데이트       │
│ → Claude AI 실패 분석               │
│ → 커버리지 통계 집계                │
│ → 통합 잔디 알림 (1회)              │
└────────┬────────────────────────────┘
         │ peaceiris/actions-gh-pages@v3
         ▼
┌─────────────────────────────────────┐
│ gh-pages 브랜치 (대시보드)           │
│ - index.html   (카드 레이아웃)      │
│ - detail.html  (리포트 상세)        │
│ - results.json (전체 결과)          │
│ - pc_*.json / mw_*.json (개별)      │
└─────────────────────────────────────┘
```

### 2.2 디렉토리 구조

```
hanssem-qa-system/
├── .github/workflows/
│   ├── playwright.yml          # 메인 테스트 실행 워크플로우
│   ├── daily-trigger.yml       # KST 07:00 자동 트리거
│   └── retry-trigger.yml       # KST 08:00 실행 누락 감지 재트리거
├── tests/
│   ├── pc_mw_500_crawling.spec.ts  # PC/MW 크롤링 테스트
│   ├── pc_mw_200_random.spec.ts    # PC/MW 랜덤 샘플 테스트
│   ├── autoe2e/                    # AutoE2E 기능 테스트
│   │   ├── auth.spec.ts
│   │   ├── cart.spec.ts
│   │   ├── category.spec.ts
│   │   ├── furnishing.spec.ts
│   │   ├── interior.spec.ts
│   │   ├── mypage.spec.ts
│   │   ├── navigation.spec.ts
│   │   ├── product.spec.ts
│   │   ├── search.spec.ts
│   │   ├── store.spec.ts
│   │   ├── global-setup.ts         # 1회 로그인 → storageState 저장
│   │   ├── helpers/auth.ts         # CREDENTIALS, URLS, login 헬퍼
│   │   └── pages/                  # POM (Page Object Model)
│   ├── pages/                      # 프로젝트 레벨 POM (확장용)
│   ├── utils.ts                    # updateProgress, publishResults
│   ├── ai-analyzer.ts              # Claude AI 실패 분석
│   ├── coverage.ts                 # 커버리지 통계 계산
│   └── autoe2e-reporter.ts         # AutoE2E 커스텀 Playwright Reporter
├── scripts/
│   └── send-jandi-summary.js       # 최종 통합 잔디 알림 전송
├── public/                         # 대시보드 리소스
│   ├── index.html                  # 메인 대시보드
│   ├── detail.html                 # 리포트 상세보기
│   ├── incidents.html              # 장애 이력
│   ├── results.json                # 전체 결과 + 장애 데이터
│   ├── pc_500.json / mw_500.json   # Crawling 결과
│   ├── pc_random.json / mw_random.json  # Random 결과
│   ├── pc_e2e.json / mw_e2e.json   # E2E 결과
│   ├── pc_url_pool.json / mw_url_pool.json      # 랜덤 테스트용 URL 풀
│   ├── pc_tested_urls.json / mw_tested_urls.json # 누적 테스트 이력
│   └── progress.json               # 실시간 진행상태
├── playwright.config.ts            # Playwright 설정 (프로젝트 정의)
└── CLAUDE.md                       # 프로젝트 컨텍스트 (AI 지원용)
```

### 2.3 Playwright 프로젝트 구성

| Project | 대상 | 실행 환경 | 재시도 |
|---|---|---|---|
| **Crawling** | PC+MW 크롤링 | Desktop Chrome (동적 context) | 0 |
| **Random** | PC+MW 랜덤 샘플 | Desktop Chrome (동적 context) | 0 |
| **AutoE2E_Public_PC** | 비로그인 기능 (PC) | Desktop Chrome | 1 |
| **AutoE2E_Authed** | 로그인 필요 기능 (PC) | Desktop Chrome + storageState | 1 |
| **AutoE2E_Public_Mobile** | 비로그인 기능 (MW) | Pixel 5 | 1 |

`workers: 1`로 고정 (한샘몰 rate-limit 대응). 순차 실행.

---

## 3. 테스트 스위트 상세 설명

### 3.1 Crawling Test — `pc_mw_500_crawling.spec.ts`

**목적**: 한샘몰 전체 사이트의 HTTP 가용성 전수 점검 (회귀 감지)

**동작 방식:**
1. 홈(`store.hanssem.com` / `m.store.hanssem.com`)에서 시작
2. `<a href>` 전체 수집 (최대 1500개 풀)
3. 링크 필터링:
   - 도메인: 같은 도메인만
   - 제외 확장자: `.pdf .jpg .png .css .js .mp4` 등
   - 제외 경로: `/api/ /__/ /static/ /assets/` 등
   - 제외 키워드: `login logout cart order member` 등
4. 필터 통과한 URL을 **수집 순서대로 순회** (결정적)
5. 각 URL에서 HTTP 200 + Body 404 체크
6. 500개 URL 완료 시 종료 (현재 임시 100개)

**판정 기준:**
- ✅ PASS: HTTP 200 + Body 정상
- ❌ FAIL: Timeout / HTTP 4xx,5xx / Body "페이지를 찾을 수 없음"
- 🔄 5xx 오류 자동 재시도: 10초 간격 최대 2회

**산출물:**
- `public/pc_500.json` / `public/mw_500.json`: 전체 결과 (URL + 상태 + 소요시간)
- `public/pc_url_pool.json` / `public/mw_url_pool.json`: Random 테스트용 풀
- `public/pc_tested_urls.json` / `public/mw_tested_urls.json`: 누적 테스트 이력

**장점 & 한계:**
- 장점: 같은 URL을 매일 체크 → **회귀 감지**에 강함
- 한계: 상위 메뉴 위주 → 깊은 페이지 커버 제한적 (Random이 보완)

---

### 3.2 Random Test — `pc_mw_200_random.spec.ts`

**목적**: 크롤링이 못 다루는 URL의 잠재적 이슈 발견 (Discovery)

**동작 방식:**
1. Crawling이 생성한 `pc_url_pool.json` 읽기
2. 누적 테스트 이력(`pc_tested_urls.json`)에 있는 URL 자동 제외
3. Fisher-Yates 셔플 → **200개 랜덤 샘플링**
4. 각 URL에 HTTP 200 + Body 404 체크
5. 테스트 완료 후 누적 이력에 추가

**자동 사이클 리셋:**
- 남은 URL이 100개 미만 → 이력 초기화 → 다음 사이클 시작
- 커버리지 고갈 방지

**판정 기준:**
- Crawling과 동일 (HTTP 200 + Body 검증)
- 재시도 정책 동일 (10초 × 2회)

**산출물:**
- `public/pc_random.json` / `public/mw_random.json`

**장점:**
- 매일 다른 URL을 점검 → **장기 커버리지 확장**
- 크롤링과 URL 겹침 0 (누적 이력 기반 제외)

---

### 3.3 E2E Test — AutoE2E Suite (`tests/autoe2e/`)

**목적**: 실제 사용자 시나리오 기반 기능 회귀 검증

#### 3.3.1 테스트 파일별 커버리지

| 파일 | 테스트 수 | 우선순위 | 내용 |
|---|---|---|---|
| **auth.spec.ts** | 5 | critical | 로그인, 로그아웃, 실패 케이스, 회원가입/ID찾기 버튼 노출 |
| **cart.spec.ts** | 4 | critical | 장바구니 페이지 진입, 총 결제예정금액, 카운트 증가 검증 |
| **product.spec.ts** | 8 | critical | 상품 상세 — 상품명/가격/구매 버튼/옵션 레이어/쿠폰 |
| **mypage.spec.ts** | 14 | high | MY 한샘, 주문/배송내역, 상담내역, 1:1 문의, 배송지 관리 |
| **search.spec.ts** | 10 | high | 검색 입력, 결과 페이지, 정렬/필터, 영문 키워드 |
| **navigation.spec.ts** | 9 | high | GNB 9개 카테고리 진입, 메인 홈 로드 |
| **category.spec.ts** | 13 | medium | 9개 카테고리 로드 + 필터 칩 + BEST/라인업/신상품 섹션 |
| **furnishing.spec.ts** | 6 | medium | 홈퍼니싱 메인, 베스트셀러, 신상품, 더보기 동작 |
| **interior.spec.ts** | 12 | medium | 인테리어 메인, 공간 필터 칩, 시공사례, 고객 후기 |
| **store.spec.ts** | 2 | low | 매장찾기 페이지 진입, 지역 키워드 노출 |

**합계:**
- PC E2E (Public_PC + Authed): 약 **83건**
- MW E2E (Public_Mobile): 약 **52건** (20~30건은 `isMobile` 가드로 skip)

#### 3.3.2 POM (Page Object Model)

`tests/autoe2e/pages/`에 위치. 셀렉터 우선순위 규칙 적용:
```
data-testid > aria-label > role+name > id > text > css
```

| Page | 기능 |
|---|---|
| `BasePage` | STORE_BASE, MALL_BASE, isMobile, smartLocator |
| `NavigationPage` | GNB 링크, 검색창, 로그인/장바구니 엔트리 |
| `CategoryPage` | CATEGORIES 상수, 필터 칩, firstGoodsLink |
| `CartPage` | 장바구니 URL, getCount(), isEmpty() |

#### 3.3.3 로그인 플로우

`global-setup.ts`가 테스트 시작 전 **1회 로그인** → `.auth/user.json`에 storageState 저장 → Authed 프로젝트가 이를 재사용 (로그인 생략).

- 크리덴셜: GitHub Secrets (`HANSSEM_ID`, `HANSSEM_PW`)
- Fault-tolerant: 로그인 실패 시 빈 storageState로 전체 테스트 중단 방지

#### 3.3.4 자동화 불가/제외 영역

- 실결제 7종 (카드, 네이버페이, 카카오페이, 토스 등)
- 회원가입/탈퇴 (파괴적 작업)
- OAuth 간편가입 (외부 IdP)
- 주문 취소/반품/교환
- ID/PW 찾기 (이메일·SMS 인증)

---

## 4. 보조 시스템

### 4.1 AI 실패 자동 분석 — `tests/ai-analyzer.ts`

**동작:**
- 각 테스트 종료 시 실패 케이스를 Claude Sonnet 4.6에 전송
- JSON 응답:
  - `summary`: 한 줄 요약
  - `rootCauses`: 가능한 원인 목록
  - `suggestedFixes`: 구체 수정 제안 (코드 패치 예시 포함)
  - `priority`: critical / high / medium / low
- 결과는 각 리포트의 `aiAnalysis` 필드에 저장 → detail.html에 표시

**동작 조건:** 환경변수 `ANTHROPIC_API_KEY` 존재 시만. 없으면 silent skip.

### 4.2 커버리지 통계 — `tests/coverage.ts`

**계산 지표:**
- 누적 고유 URL 수 (PC + MW)
- 오늘 테스트한 URL 수
- 오늘 통과율
- 완주 사이클 수 (이력 리셋 횟수)

**저장:** `results.json`의 `coverage` 섹션 → 대시보드 상단 바에 실시간 표시

### 4.3 진행상태 실시간 표시 — `public/progress.json`

- 30초 간격으로 현재 phase + 완료 건수 업데이트
- 대시보드가 10초마다 폴링 → 카드에 진행률 % 표시
- Phase: `pc-landing | mw-landing | pc-random | mw-random | pc-e2e | mw-e2e`

### 4.4 통합 잔디 알림 — `scripts/send-jandi-summary.js`

**동작:**
- 모든 테스트 종료 후 **1회 전송**
- 내용:
  - 전체 통과 / 실패 / 통과율
  - 6개 리포트별 요약
  - 실패 URL 상위 10개
  - 대시보드 링크
- 색상: 실패 0건 초록, 있으면 빨강

---

## 5. 인프라

### 5.1 GitHub Actions 워크플로우

| 워크플로우 | 동작 |
|---|---|
| **daily-trigger.yml** | 매일 KST 07:00 `playwright.yml` workflow_dispatch 트리거 |
| **retry-trigger.yml** | KST 08:00에 7시 트리거 누락 감지 시 재실행 |
| **playwright.yml** | 실제 테스트 실행 + 결과 커밋 + gh-pages 배포 + 잔디 알림 |

### 5.2 GitHub Secrets

| Secret | 용도 |
|---|---|
| `GITHUB_TOKEN` | 자동 제공 (gh-pages 쓰기) |
| `PAT_TOKEN` | workflow dispatch API 호출용 |
| `HANSSEM_ID` / `HANSSEM_PW` | AutoE2E 로그인 테스트 크리덴셜 |
| `ANTHROPIC_API_KEY` | Claude AI 실패 분석 (선택) |

### 5.3 GitHub Pages 배포

- `peaceiris/actions-gh-pages@v3` 사용
- `public/` 디렉토리 → `gh-pages` 브랜치 force push
- 개별 파일은 `updateProgress` / `publishResults`가 테스트 중에도 gh-pages에 직접 쓰기

---

## 6. 대시보드 UI

### 6.1 메인 화면 (`index.html`)
- **커버리지 통계 바**: 누적 URL, 오늘 테스트 수, 통과율, 사이클 수
- **6개 카드 (3×2 그리드)**:
  - 1행: PC 500 Crawling · PC 200 Random · PC E2E Test
  - 2행: MW 500 Crawling · MW 200 Random · MW E2E Test
- 각 카드: 통과율 %, 전체/통과/실패 건수, 실패 URL 목록, 상세보기 링크
- **테스트 실행 버튼**: 수동 트리거 → GitHub API로 workflow_dispatch

### 6.2 리포트 상세 (`detail.html`)
- URL 파라미터 `?id=pc-landing` 등으로 구분
- Summary 바: 전체 / 통과 / 실패 / 통과율
- **🤖 Claude AI 자동 분석** 박스: 요약 + 근본 원인 + 수정 제안
- 케이스 테이블: 테스트명/URL · 결과 · 소요시간 · 실패 사유
- 필터: 전체 / 통과 / 실패 + 키워드 검색

### 6.3 장애 이력 (`incidents.html`)
- 월별 핫픽스/비정기배포 통계 (FE/BE/APP)
- 건별 상세 목록 (날짜, 담당자, 이슈 내용, Jira 링크)

---

## 7. 향후 개선 및 고도화 전략

### 7.1 단기 (1~2주)

#### 🔴 우선순위 높음
- [ ] **MAX_LINKS 원복** (100 → 500) — 시간 분석 후 결정
- [ ] **실패 케이스 TC 보강**
  - 검색 결과 / 필터 컨트롤 / 상품 상세 선택기 안정화
  - GET 직접 + DOM 점진적 대기(polling) 패턴 도입
- [ ] **잔디 알림 검증** — 다음 자동 실행(07:00) 후 통합 알림 포맷 점검

#### 🟡 중간 우선순위
- [ ] **CLAUDE.md 업데이트** — 새 구조(autoe2e 폴더, AI 분석, 커버리지) 반영
- [ ] **로컬 개발 가이드 문서화** — `npm test`, `--grep` 사용법, 디버깅 팁

### 7.2 중기 (1~2개월)

#### 📈 관찰성 강화
- [ ] **주간/월간 추이 그래프** — results.json 히스토리 보관 후 시계열 분석
- [ ] **Slack/Teams 알림** — 잔디 외 팀별 선호 채널 추가
- [ ] **실패 URL 이력 관리** — 동일 URL 반복 실패 시 알림 에스컬레이션

#### 🧪 테스트 확장
- [ ] **Visual Regression** — Playwright 스크린샷 비교 (`@playwright/test` 내장)
- [ ] **Core Web Vitals 측정** — LCP, FID, CLS 자동 수집 → 성능 회귀 감지
- [ ] **접근성 테스트** — `@axe-core/playwright` 통합
- [ ] **API 레벨 테스트** — 주요 엔드포인트 직접 호출 (페이지 로딩 없이 빠른 smoke)

### 7.3 장기 (3~6개월)

#### 🤖 AI 기반 자동화 고도화
- [ ] **셀렉터 자동 수리**
  - 테스트 실패 시 Claude에게 스크린샷 + HTML 전달
  - 새 셀렉터 제안 → PR 자동 생성 (사람 검토 후 머지)
- [ ] **테스트 자동 생성**
  - AutoE2E 파이프라인(`src/agents/`) 재활용
  - 새 페이지 감지 → 테스트 시나리오 자동 작성
- [ ] **장애 예측 모델**
  - 과거 실패 패턴 학습 → 위험도 높은 URL 사전 경고

#### 🏗️ 인프라 고도화
- [ ] **Self-hosted Runner** — Stage 환경 테스트 재개 (현재 차단)
- [ ] **Parallel Execution** — `workers: 1` 제약 완화
  - 사이트 측 rate-limit 대응: 요청 간 300ms 고정 지연
  - PC/MW 병렬 → 실행 시간 50% 단축 기대
- [ ] **테스트 결과 DB 저장**
  - 현재 JSON 파일 → PostgreSQL/SQLite
  - Grafana 대시보드 연동 가능

#### 📊 비즈니스 KPI 연동
- [ ] **전환율·페이지뷰 연동** — GA4/Adobe Analytics와 실패 URL 매핑
- [ ] **SLA 대시보드** — 월간 가용성 목표(99.9%) 달성률 추적
- [ ] **부서별 Owner 매핑** — 실패 URL → 담당 팀 자동 태깅

### 7.4 기술 부채 해소

| 항목 | 현 상태 | 목표 |
|---|---|---|
| TypeScript strict | `@types/node` 미설치로 경고 | tsconfig 정비 + strict 모드 |
| 테스트 실행 속도 | 풀런 35~40분 | 병렬화로 20분 목표 |
| 잔디 웹훅 | 하드코딩 | GitHub Secrets로 이관 |
| AI 분석 비용 | Claude API 호출 제한 없음 | 월 한도 설정 + 실패 건수 임계치 조건부 호출 |

---

## 부록

### A. 자주 사용하는 명령어

```bash
# 전체 테스트
npx playwright test

# 특정 프로젝트만
npx playwright test --project=AutoE2E_Public_PC

# 특정 파일
npx playwright test tests/autoe2e/search.spec.ts

# 실패 테스트만
npx playwright test --grep "구매하기|상품 리스트"

# 헤드풀 모드 (디버깅)
npx playwright test --headed --debug

# 리포트 확인
npx playwright show-report
```

### B. 테스트 리포트 ID 매핑

| ID | 파일 | 테스트 |
|---|---|---|
| `pc-landing` | `pc_500.json` | PC Crawling |
| `mw-landing` | `mw_500.json` | MW Crawling |
| `pc-random` | `pc_random.json` | PC Random |
| `mw-random` | `mw_random.json` | MW Random |
| `pc-e2e` | `pc_e2e.json` | PC AutoE2E (Public_PC + Authed) |
| `mw-e2e` | `mw_e2e.json` | MW AutoE2E (Public_Mobile) |

### C. 디버깅 가이드 (자주 만나는 이슈)

| 증상 | 원인 | 해결 |
|---|---|---|
| `net::ERR_EMPTY_RESPONSE` | 서버 일시 오류 | 10초 × 2회 재시도 자동 적용 |
| `Timeout 30000ms` on goto | `load` 이벤트 리소스 대기 | `waitUntil: 'domcontentloaded'` 사용 |
| `toBeVisible` on GNB 실패 | hover 전 hidden | `toBeAttached()` 사용 |
| body 404 (URL은 200) | SPA 라우팅 | body 텍스트 체크 자동 적용 |
| 검색 input 간헐적 미노출 | headless CSS 숨김 | `/furnishing` 페이지 검색창 or 결과 URL 직접 이동 |

---

**작성 기준일**: 2026-04-23
**문서 버전**: 1.0
**작성자**: 자비스 (JARVIS) · PM
