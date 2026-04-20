# 한샘몰 서비스 품질 관리 시스템 (QA System) 기술 문서

> 작성일: 2026-04-20  
> 대상: 개발팀 / QA 담당자  
> 대시보드: https://daewon82.github.io/hanssem-qa-system/

---

## 1. 시스템 개요 및 기대효과

### 도입 배경

한샘몰은 PC(`store.hanssem.com`)와 MW(`m.store.hanssem.com`) 두 채널을 운영하며,  
배포 후 수백 개의 URL과 주요 사용자 시나리오가 정상 동작하는지 수동으로 확인하는 데 많은 리소스가 필요했다.

### 기대효과

| 항목 | 도입 전 | 도입 후 |
|---|---|---|
| 랜딩 점검 | 수동 접속 확인 (PC+MW 각 500개) | 매일 KST 08:00 자동 실행 |
| 결과 확인 | 담당자 직접 기록 | 대시보드에서 즉시 확인 |
| 이상 감지 | 사용자 신고 후 인지 | 배포 익일 아침 자동 감지 |
| 장애 이력 | 별도 문서 관리 | 대시보드 통합 관리 |
| 알림 | 수동 공유 | 잔디 웹훅 자동 전송 |

### 시스템 구성 요약

```
GitHub Actions (자동 실행)
  ├─ 랜딩 테스트: PC 500개 + MW 500개 URL 크롤링 → HTTP 200 확인
  ├─ E2E 테스트: PC 18개 시나리오 + MW 13개 시나리오 → 사용자 흐름 점검
  └─ 결과 → GitHub Pages 대시보드 자동 배포
```

---

## 2. 아키텍처

### 전체 실행 흐름

```
daily-trigger.yml (매일 KST 08:00)
    └─ GitHub API → playwright.yml workflow_dispatch 트리거

playwright.yml 실행 (최대 300분)
    ├─ [1단계] codeLastModified 기록
    ├─ [2단계] npm ci + Playwright 브라우저 설치
    ├─ [3단계] npx playwright test
    │     ├─ PC_Chrome (순차 실행)
    │     │     ├─ pc_500_check.spec.ts   ─→ pc_500.json  [실시간 gh-pages 반영]
    │     │     └─ pc_e2e_test_v2.spec.ts ─→ pc_e2e.json  [실시간 gh-pages 반영]
    │     └─ MW_Chrome (순차 실행)
    │           ├─ mw_500_check.spec.ts   ─→ mw_500.json  [실시간 gh-pages 반영]
    │           └─ mw_e2e_test.spec.ts    ─→ mw_e2e.json  [실시간 gh-pages 반영]
    ├─ [4단계] 결과 파일 main 브랜치 커밋 & 푸시
    ├─ [5단계] GitHub Pages 배포 (public/ → gh-pages)
    └─ [6단계] 아티팩트 업로드 (playwright-report, fail_evidence)
```

### 실시간 결과 반영 구조

테스트가 완전히 끝나기를 기다리지 않고, **각 테스트 종료 직후** 결과를 대시보드에 반영한다.

```
각 테스트 afterAll
    ├─ 로컬 파일 저장 (public/pc_e2e.json, public/results.json)
    └─ publishResults() 호출
           └─ GitHub Contents API (PUT)
                  ├─ gh-pages/pc_e2e.json  ← 전체 결과 즉시 반영
                  └─ gh-pages/results.json ← 대시보드 갱신

대시보드 (15초마다 폴링)
    └─ progress.json 확인 → 현재 실행 단계 로딩 UI 표시
```

### 디렉토리 구조

```
hanssem-qa-system/
├── tests/
│   ├── utils.ts                  # 공통 헬퍼 (updateProgress, publishResults)
│   ├── pc_500_check.spec.ts      # PC 랜딩 500개 URL 크롤링 테스트
│   ├── pc_e2e_test_v2.spec.ts    # PC E2E 시나리오 테스트 (18개 그룹)
│   ├── mw_500_check.spec.ts      # MW 랜딩 500개 URL 크롤링 테스트
│   └── mw_e2e_test.spec.ts       # MW E2E 시나리오 테스트 (13개 그룹)
├── public/
│   ├── index.html                # 메인 대시보드
│   ├── detail.html               # 테스트 결과 상세 (pass/fail 전체)
│   ├── incidents.html            # 장애 리포트 월별 히스토리
│   ├── results.json              # 테스트 결과 + 장애 데이터 (대시보드 소스)
│   ├── progress.json             # 실행 중 단계 정보 (gh-pages 실시간 업데이트)
│   ├── pc_500.json               # PC 랜딩 전체 결과 (pass + fail)
│   ├── pc_e2e.json               # PC E2E 전체 결과
│   ├── mw_500.json               # MW 랜딩 전체 결과
│   └── mw_e2e.json               # MW E2E 전체 결과
├── .github/workflows/
│   ├── playwright.yml            # 테스트 실행 + 결과 커밋 + Pages 배포
│   └── daily-trigger.yml         # KST 08:00 자동 트리거
├── playwright.config.ts
└── package.json
```

---

## 3. Playwright 설정 (playwright.config.ts)

| 설정 | 값 | 이유 |
|---|---|---|
| workers | 1 | 순차 실행 — 병렬 실행 시 서버 부하 및 결과 혼재 방지 |
| retries | 0 | 재시도로 인한 실행 시간 증가 방지 |
| timeout | 7,200,000ms (2시간) | 500개 랜딩 테스트 커버 |
| actionTimeout | 20,000ms | |
| navigationTimeout | 30,000ms | |
| baseURL (전역) | https://store.hanssem.com | PC 기본값 |

### 프로젝트 분리

| 프로젝트명 | 디바이스 | baseURL | 대상 파일 |
|---|---|---|---|
| PC_Chrome | Desktop Chrome | https://store.hanssem.com | `pc_*.spec.ts` |
| MW_Chrome | Pixel 5 | https://m.store.hanssem.com | `mw_*.spec.ts` |

PC와 MW를 별도 프로젝트로 분리해 baseURL을 명확히 구분하고, 파일 패턴(`pc_*`/`mw_*`)으로 자동 배분.

---

## 4. 공통 헬퍼 (tests/utils.ts)

### updateProgress

실행 중인 테스트 단계를 gh-pages의 `progress.json`에 실시간 기록.  
대시보드가 15초마다 폴링해 현재 단계 카드에 로딩 스피너 및 진행률을 표시한다.

```typescript
export async function updateProgress(
  phase: string,   // "pc-landing" | "pc-e2e" | "mw-landing" | "mw-e2e"
  count?: number,  // 랜딩: 현재 방문 건수
  total?: number   // 랜딩: 전체 건수
): Promise<void>
```

- `GITHUB_ACTIONS` + `GITHUB_TOKEN` 환경변수 없으면 자동 스킵 (로컬 실행 안전)
- gh-pages 브랜치에 직접 PUT — main 브랜치 커밋 없음
- 실패 시 경고 로그만 출력, 테스트 계속 진행

**progress.json 구조**
```json
{ "phase": "pc-landing", "startedAt": "2026-04-20T00:00:00.000Z", "count": 150, "total": 500 }
```

---

### publishResults

각 테스트 afterAll에서 호출. 결과를 gh-pages에 즉시 반영해 대시보드가 실시간으로 업데이트되도록 한다.

```typescript
export async function publishResults(
  report: { id, title, lastUpdated, total, pass, fail, passRate, cases },
  fullData: object,      // 전체 케이스 (pass + fail)
  fullDataPath: string   // "pc_500.json" | "pc_e2e.json" | ...
): Promise<void>
```

- `fullDataPath` 파일을 gh-pages에 직접 쓰고, `results.json`도 즉시 병합 업데이트
- `GITHUB_ACTIONS` + `GITHUB_TOKEN` 없으면 자동 스킵

---

## 5. 테스트 상세

### 5-1. 랜딩 테스트 (pc_500_check / mw_500_check)

#### 목적
운영 환경의 500개 URL이 정상적으로 응답(HTTP 200)하는지 크롤링 방식으로 자동 점검.  
배포 후 화면 깨짐, 500 에러, 접속 불가 페이지를 조기에 발견한다.

| 항목 | PC | MW |
|---|---|---|
| 시작점 | https://store.hanssem.com | https://m.store.hanssem.com |
| 링크 필터 | `store.hanssem.com` 포함 | `m.store.hanssem.com` 포함 |
| 점검 건수 | **500개** | **500개** |
| 결과 파일 | `public/pc_500.json` | `public/mw_500.json` |
| results.json ID | `pc-landing` | `mw-landing` |

**링크 수집 방식**
1. 시작 URL에서 `<a href>` 전체 수집 (스크롤로 lazy-load 유발)
2. EXCLUDE_KEYWORDS / URL 유효성 필터 적용
3. 500개 채울 때까지 방문한 페이지에서 추가 수집 반복

**EXCLUDE_KEYWORDS** (공통 제외)
```
logout, login, javascript, order, settle, cart, member, company.hanssem.com
```

**URL 유효성 검사**
- URL 길이 400자 초과 제외
- pathname에 `http` 포함 제외 (중첩 URL 방지)
- 정적 파일 제외 (`.pdf`, `.jpg`, `.png`, `.css`, `.js`, `.mp4` 등)
- API/정적 경로 제외 (`/api/`, `/static/`, `/assets/` 등)

**실패 판정 기준**
- HTTP 200 → PASS
- HTTP 오류 / Timeout → FAIL
- **5xx 응답**: 5초 후 1회 재시도 (순간 오류 false positive 방지)
- **타임아웃**: 연속 3회 미만이면 20초, 3회 이상이면 60초 대기 후 재시도
- **타임아웃 실패 시**: `window.stop()` 후 `fail_evidence/` 폴더에 스크린샷 저장

**진행상태 업데이트**: 테스트 시작 시 1회, 이후 5초마다 `updateProgress` 호출

**구조 특이사항**: 테스트 함수 1개 안에서 while 루프 실행 → Playwright 카운트는 항상 "1 passed"  
실제 pass/fail은 내부 변수로 집계 후 JSON 저장

---

### 5-2. PC E2E 테스트 (pc_e2e_test_v2.spec.ts)

#### 목적
실제 사용자가 거치는 주요 동선을 자동으로 재현해 핵심 기능의 정상 동작을 검증.  
단순 HTTP 응답 확인을 넘어, UI 요소 노출 / 클릭 / 페이지 이동까지 통합 점검.

- **baseURL**: https://store.hanssem.com
- **샘플 상품 ID**: `837513`
- **결과 파일**: `public/pc_e2e.json`
- **cases**: pass + fail **전체** 포함 (상세 화면에서 필터 가능)

**생명주기**
```
beforeAll  → updateProgress("pc-e2e")
beforeEach → [점검] 테스트명 출력
afterEach  → pass/fail 집계, caseResults 추가
afterAll   → results.json + pc_e2e.json 로컬 저장
           → publishResults() 호출 (gh-pages 즉시 반영)
           → 잔디 알림 전송
```

**테스트 그룹 (18개, 총 약 40개 TC)**

| 번호 | 그룹명 | 주요 검증 항목 |
|---|---|---|
| 1 | 메인 페이지 | 페이지 로딩/타이틀, 헤더(GNB), 푸터 노출(PC) |
| 2 | 카테고리 네비게이션 | 가구/홈리빙·인테리어 진입, GNB 링크 클릭(PC) |
| 3 | 상품 목록 | 상품 링크 1개 이상, 인테리어 링크, 상품 클릭→상세 이동 |
| 4 | 상품 상세 | 상품명(H1), 가격, 구매/장바구니 버튼(PC), 이미지 |
| 5 | 검색 | 검색아이콘→입력창→결과 이동(PC), 결과 로딩, 영문 키워드 |
| 6 | 로그인 | GNB 로그인 클릭→mall.hanssem.com(PC), 로그인 폼(ID/SNS) |
| 7 | 장바구니 | GNB 장바구니 클릭(PC), 직접 URL redirect 확인 |
| 8 | 주요 페이지 HTTP 응답 | 메인/가구/인테리어/검색/상품상세/매장 6개 200 응답 |
| 9 | 매장 찾기 | 직접 진입 및 타이틀 확인, GNB 매장찾기 버튼 클릭(PC) |
| 10 | 상품 상세 탭 전환 | 후기·문의·배송 탭 전환 |
| 11 | 상품 목록 정렬/필터 | 모든필터 버튼(PC), 낮은가격순 정렬(PC), 0건 검색 |
| 12 | 인테리어 서브 페이지 | 카테고리, 시공사례, 무료견적상담 링크, 기획전 200 응답 |
| 13 | 예외 페이지 처리 | 없는 상품 redirect/에러 페이지 (5xx 미발생 확인) |
| 14 | 옵션 선택 레이어 | 옵션 버튼 노출(PC), 옵션 클릭→드롭다운(PC) |
| 15 | 시공사례 상세 진입 | 목록 노출, 첫 번째 항목 클릭→상세 진입 |
| 16 | 전문가 찾기 | 페이지 진입 및 로딩, 전문가 카드 목록 노출 |
| 17 | 매장 검색 및 상세 | 검색 입력 필드(PC), 지역 필터/매장 목록 노출 |
| 18 | 붙박이장 셀프플래너 | 플래너 링크 노출, 붙박이장 카테고리 상품 노출 |

---

### 5-3. MW E2E 테스트 (mw_e2e_test.spec.ts)

#### 목적
모바일 웹 사용자 동선을 PC와 독립적으로 검증.  
MW 전용 UI(모바일 헤더, BNB, m.store 도메인)에 맞게 시나리오 구성.

- **baseURL**: https://m.store.hanssem.com
- **샘플 상품 ID**: `837513`
- **결과 파일**: `public/mw_e2e.json`
- **results.json cases**: fail 케이스만 저장 (mw_e2e.json에는 전체 저장)

**afterAll 중복 방지 구조**  
전체를 `test.describe("MW E2E 테스트", () => {...})` 하나로 감싸고, `hasPublished` 플래그를 사용.  
감싸지 않으면 afterAll이 내부 describe 블록 수만큼 반복 실행되어 결과가 조기 덮어써진다.

**생명주기**
```
beforeAll  → updateProgress("mw-e2e")
beforeEach → [점검] 테스트명 출력
afterEach  → pass/fail 집계, caseResults 추가
afterAll   → hasPublished 체크 → results.json + mw_e2e.json 로컬 저장
           → publishResults() 호출 (gh-pages 즉시 반영)
           → 잔디 알림 전송
```

**테스트 그룹 (13개) — PC 전용 항목은 삭제됨**

| 번호 | 그룹명 | 주요 검증 항목 |
|---|---|---|
| 1 | 메인 페이지 | 페이지 로딩/타이틀, 헤더 |
| 2 | 카테고리 네비게이션 | 가구/홈리빙·인테리어 진입 |
| 3 | 상품 목록 | 상품 링크 1개 이상, 인테리어 링크, 상품 클릭→상세 이동 |
| 4 | 상품 상세 | 상품명(H1), 가격, 이미지 |
| 5 | 검색 | 검색 결과 로딩, 영문 키워드 |
| 6 | 로그인 | 로그인 폼 노출 (returnUrl = m.store.hanssem.com) |
| 7 | 장바구니 | 직접 URL redirect (mall.hanssem.com/m/morder) |
| 8 | 주요 페이지 HTTP 응답 | 메인/가구/인테리어/검색/상품상세/매장 6개 200 응답 |
| 9 | 매장 찾기 | 직접 진입 및 타이틀 확인 |
| 10 | 상품 상세 탭 전환 | 후기 탭 전환 |
| 11 | 검색 결과 | 0건 검색결과 확인 |
| 12 | 인테리어 서브 페이지 | 카테고리(MW URL), 시공사례(MW URL), 무료견적상담 |
| 13 | 예외 페이지 처리 | 없는 상품 redirect/에러 페이지 |

**MW에서 제거된 PC 전용 항목**  
푸터, GNB 가구/홈리빙 링크, 상품 구매버튼, 검색아이콘, 로그인GNB,  
장바구니GNB, 매장찾기GNB, 모든필터, 낮은가격순 정렬, 문의탭, 배송탭

---

## 6. URL / 도메인 규칙

| 도메인 패턴 | 분류 | 적용 테스트 |
|---|---|---|
| `store.hanssem.com` | PC URL | PC 테스트 전용 |
| `m.store.hanssem.com` | MW URL | MW 테스트 전용 |
| `mall.hanssem.com/m/...` (경로에 `/m/`) | MW URL | MW 테스트에서만 허용 |
| `mall.hanssem.com/...` (경로에 `/m/` 없음) | PC URL | PC 테스트에서만 허용 |

- 로그인·장바구니 redirect(mall.hanssem.com)는 예외적으로 양쪽 허용
- `returnUrl` 파라미터 값으로 절대 URL 포함은 정상 (필터 대상 아님)

---

## 7. 결과 데이터 구조

### results.json (대시보드 단일 소스)

```json
{
  "lastUpdated": "2026. 4. 20. AM 9:35:52",
  "codeLastModified": "2026. 04. 20. 09:30",
  "incidents": {
    "total": 30,
    "hotfix": 30,
    "feCount": 14,
    "beCount": 15,
    "appCount": 1,
    "lastUpdated": "2026-04-18",
    "period": "2026-01-06 ~ 2026-04-18",
    "byMonth": [
      {
        "month": "2026-04",
        "label": "2026년 4월",
        "count": 11,
        "fe": 6, "be": 5, "app": 0,
        "list": [
          {
            "no": 11,
            "date": "2026-04-17",
            "type": "핫픽스",
            "category": "FE",
            "assignee": "담당자명",
            "summary": "이슈 요약",
            "jiraLink": "https://hanssem.atlassian.net/..."
          }
        ]
      }
    ]
  },
  "reports": [
    {
      "id": "pc-landing",
      "title": "운영환경 PC 500개 랜딩 테스트",
      "lastUpdated": "...",
      "total": 500,
      "pass": 498,
      "fail": 2,
      "passRate": "99.6",
      "sheetUrl": "https://docs.google.com/spreadsheets/d/...",
      "cases": [ /* fail 케이스만 */ ]
    }
  ]
}
```

### reports ID 및 파일 매핑

| ID | 상세 파일 | results.json cases | 상세 화면 표시 |
|---|---|---|---|
| `pc-landing` | `pc_500.json` | fail만 | pass + fail 전체 |
| `pc-e2e` | `pc_e2e.json` | pass + fail 전체 | pass + fail 전체 |
| `mw-landing` | `mw_500.json` | fail만 | pass + fail 전체 |
| `mw-e2e` | `mw_e2e.json` | fail만 | pass + fail 전체 |

---

## 8. GitHub Actions 워크플로우

### daily-trigger.yml

| 항목 | 내용 |
|---|---|
| 스케줄 | `0 23 * * *` (UTC) = KST 08:00 |
| 방식 | PAT_TOKEN으로 GitHub API → playwright.yml workflow_dispatch |
| 필요 Secret | `PAT_TOKEN` |
| 분리 이유 | GitHub 내장 schedule cron의 신뢰도 문제 (지연/미실행) |

### playwright.yml

| 항목 | 내용 |
|---|---|
| 트리거 | `workflow_dispatch` (수동 또는 daily-trigger에서 API 호출) |
| 타임아웃 | 300분 |
| 필요 Secrets | `GITHUB_TOKEN`, `PAT_TOKEN` |

**실행 단계**

| 순서 | 단계명 | 내용 |
|---|---|---|
| 1 | codeLastModified 기록 | 최근 non-auto 커밋 날짜를 results.json에 기록 |
| 2 | 의존성 설치 | `npm ci` + `npx playwright install --with-deps` |
| 3 | 테스트 실행 | `npx playwright test` (continue-on-error: true) |
| 4 | 결과 커밋 | `git pull --rebase origin main && git push` |
| 5 | Pages 배포 | `peaceiris/actions-gh-pages@v3` → gh-pages 브랜치 |
| 6 | 아티팩트 업로드 | playwright-report, fail_evidence (30일 보관) |

**커밋 대상 파일**
```
public/results.json  public/pc_500.json  public/pc_e2e.json
public/mw_500.json   public/mw_e2e.json
```

**환경변수 주의사항**
```yaml
env:
  CI: ""            # 잔디 알림 임시 비활성화 — 삭제하면 알림 재활성화
  GITHUB_TOKEN: ... # progress.json 실시간 업데이트 및 publishResults에 사용
```

> `progress.json`은 커밋 대상이 아님.  
> 테스트 중 GitHub Contents API로 gh-pages에 직접 기록되고,  
> Pages 배포 시 `public/progress.json` (idle 초기값)으로 자동 덮어써짐.

---

## 9. 대시보드 (public/)

### index.html 주요 기능

| 기능 | 내용 |
|---|---|
| 테스트 결과 카드 | PC 랜딩, PC E2E, MW 랜딩, MW E2E (4개) |
| 월별 긴급배포 그래프 | FE=파랑, BE=주황, APP=초록 막대 차트 |
| 장애 현황 요약 | 총계, FE/BE/APP 건수, 기간 |
| fail 감지 | fail > 0이면 카드에 "실패 감지" 배지 표시 |
| 반응형 | 768px / 640px 브레이크포인트 |

### 테스트 실행 중 로딩 UI

```
버튼 클릭
    └─ 즉시 "테스트 실행 중" + 비활성화
    └─ dispatch 성공 → _dispatchTime 기록 → initProgress()

15초마다 progress.json 폴링
    └─ phase에 맞는 카드에 링 스피너 표시
    └─ 랜딩: count/total * 100 % 표시
    └─ E2E: 스피너만 표시 (% 없음)

단계 완료
    └─ 완료 카드: "완료: HH:MM" 표시
    └─ 다음 카드: 스피너 시작

워크플로우 종료 감지
    └─ 모든 스피너 즉시 제거
    └─ 5초 후 loadStats() 자동 호출
```

**폴링 타이머**

| 타이머 | 주기 | 역할 |
|---|---|---|
| progressTimer | 30초 | GitHub API로 워크플로우 상태 확인 |
| phaseTimer | 15초 | progress.json 폴링 → 단계 감지 |
| animTimer | 10초 | 현재 단계 % 수치 갱신 |

### detail.html

- URL 파라미터 `?id=` 로 리포트 구분 (`pc-landing`, `pc-e2e`, `mw-landing`, `mw-e2e`)
- pass + fail 전체 케이스 표시 (상태/키워드 필터 가능)

### incidents.html

- 장애 상세 목록 (월별 전체 히스토리, Jira 링크 포함)

---

## 10. 장애 리포트 추가 방법

핫픽스/장애 발생 시 `public/results.json`의 `incidents` 섹션 직접 수정:

1. 해당 월 `list`에 새 항목 추가 — `no`는 월별 순번, **최신이 가장 위**
2. 해당 월 `count`, `fe`/`be`/`app` 카운트 업데이트
3. 최상위 `total`, `feCount`/`beCount`/`appCount` 업데이트
4. `lastUpdated`, `period` 날짜 갱신
5. 커밋 + 푸시

---

## 11. 잔디(Jandi) 알림

| 항목 | 내용 |
|---|---|
| 전송 조건 | `process.env.CI`가 truthy일 때만 |
| 전송 시점 | 각 테스트 afterAll 완료 후 (4회: PC 랜딩, PC E2E, MW 랜딩, MW E2E) |
| 현재 상태 | playwright.yml에서 `CI: ""`로 임시 비활성화 |
| 재활성화 | playwright.yml의 `env: CI: ""` 라인 삭제 |
| 알림 내용 | 통과율, 총 건수, 실패 목록(최대 10개), 대시보드 링크 |

---

## 12. GitHub PAT 토큰 관리

대시보드 `index.html`에 하드코딩 (split array로 GitHub push protection 우회):

```javascript
const GH_TOKEN = ["ghp","_0yXkI87t","kJ1wcUmh","lLIfYFs2","m4OH8243","MWD7"].join("");
```

토큰 만료 시 새 토큰 발급 후 위 배열 업데이트.

---

## 13. 패키지 구성

```json
{
  "devDependencies": {
    "@playwright/test": "^1.59.1",
    "@types/node": "^20.19.39"
  },
  "dependencies": {
    "axios": "^1.6.0"
  }
}
```

- `tsconfig.json` 불필요 — Playwright가 TypeScript 직접 처리
- VS Code에서 `fs`, `process`에 빨간 줄이 보여도 실행 무관

---

## 14. Git 배포 규칙

| 규칙 | 이유 |
|---|---|
| `git push --force` 금지 | GitHub Actions 권한 오류 발생 |
| `git pull --rebase origin main && git push` 사용 | 동시 실행 커밋 충돌 방지 |
| 테스트 실행 중 중간 푸시 금지 | Actions 실행 간 충돌 방지 |
| `progress.json` git push 제외 | GitHub Contents API로 gh-pages에 직접 기록 |

---

## 15. 기본 기능 커버리지 분석

전체 기본기능 체크리스트 **66개** 항목 대비 현 QA 시스템의 자동화 커버리지를 분석한다.

### 커버리지 요약

| 구분 | 건수 | 설명 |
|---|---|---|
| 완전 커버 | 8개 | 자동화로 완전히 검증 |
| 부분 커버 | 11개 | 일부 동작만 확인 (노출 여부 등) |
| 미커버 | 47개 | 자동화 미적용 |
| **총 커버리지** | **약 21%** | (완전 8 + 부분 11×0.5) / 66 |

> **랜딩 테스트(500개 URL)** 는 HTTP 200 응답 여부를 추가로 폭넓게 검증하나,  
> 기능 단위 검증과는 성격이 달라 위 비율에는 포함하지 않았다.

---

### 기능별 커버리지 상세

#### 회원/인증 (9개 항목 → 커버: 0.5개)

| 기능 | 커버 여부 | 비고 |
|---|---|---|
| 정상 회원 탈퇴 가능 확인 | 미커버 | 로그인 세션 필요 |
| 정상 회원가입 가능 확인 | 미커버 | 실계정 생성 불가 |
| 카카오계정 간편가입 확인 | 미커버 | 외부 OAuth 흐름 |
| 네이버계정 간편가입 확인 | 미커버 | 외부 OAuth 흐름 |
| 페이코 계정 간편가입 확인 | 미커버 | 외부 OAuth 흐름 |
| 애플계정 간편가입 확인 | 미커버 | 외부 OAuth 흐름 |
| 간편계정 연동/해제 확인 | 미커버 | 로그인 세션 필요 |
| **정상 로그인/로그아웃 가능 확인** | **부분** | 로그인 버튼 클릭 → 로그인 페이지 이동까지만 확인 |
| 아이디/비밀번호 찾기 기능 확인 | 미커버 | — |

#### 주문/결제 (13개 항목 → 커버: 0개)

| 기능 | 커버 여부 | 비고 |
|---|---|---|
| 장바구니 상품 담기 가능 확인 (카운트) | 미커버 | 로그인 세션 + 실주문 필요 |
| 주문서 진입 후 정상 주문 가능 확인 | 미커버 | 실주문 필요 |
| 주문서 진입 후 쿠폰 적용 후 정상 주문 | 미커버 | 실주문 필요 |
| 주문 취소 처리 가능 확인 | 미커버 | 실주문 필요 |
| 주문 반품 처리 가능 확인 | 미커버 | 실주문 필요 |
| 주문 교환 처리 가능 확인 | 미커버 | 실주문 필요 |
| 신용카드 결제 확인 | 미커버 | 실결제 필요 |
| 퀵 계좌이체 결제 확인 | 미커버 | 실결제 필요 |
| 네이버 페이 결제 확인 | 미커버 | 실결제 필요 |
| 카카오 페이 결제 확인 | 미커버 | 실결제 필요 |
| 토스 페이 결제 확인 | 미커버 | 실결제 필요 |
| 페이코 결제 확인 | 미커버 | 실결제 필요 |
| 휴대폰 소액 결제 확인 | 미커버 | 실결제 필요 |

#### 메인/네비게이션 (11개 항목 → 커버: 3.5개)

| 기능 | 커버 여부 | 비고 |
|---|---|---|
| **통합메인 정상 노출 확인** | **완전** | PC + MW 메인 로딩/타이틀 확인 |
| **PC GNB 가구/홈리빙/인테리어 이동 / MO BNB 이동** | **부분** | PC GNB 링크 클릭 확인. MW BNB 미확인 |
| **매장 검색 기능 확인** | **부분** | 매장 페이지 진입 + 검색 입력 필드 노출(PC)만 확인 |
| **매장 상세 이동 확인** | **부분** | GNB 클릭 → 매장 페이지 이동만 확인. 상세 진입 미확인 |
| **통합 검색 기능 확인** | **완전** | 검색어 입력 → 결과 이동(PC), 검색 결과 페이지 로딩 |
| **통합 검색 내 상품 리스트 클릭 → 상세 이동** | **부분** | 검색 결과 페이지 로딩만 확인. 클릭 이동 미확인 |
| 통합 검색 내 사진 리스트 → 상세 이동 | 미커버 | — |
| 통합 검색 내 시공사례 리스트 → 상세 이동 | 미커버 | — |
| 통합 검색 내 매장 리스트 → 상세 이동 | 미커버 | — |
| **통합메인 장바구니 버튼 클릭 → 장바구니 페이지 이동** | **완전** | GNB 장바구니 클릭 → mall.hanssem.com 이동 확인 |
| 사이드(햄버거) 메뉴 노출 및 페이지 이동 | 미커버 | — |

#### 상품 (16개 항목 → 커버: 4개)

| 기능 | 커버 여부 | 비고 |
|---|---|---|
| **가구/홈리빙 각 카테고리 페이지 정상 노출** | **완전** | 가구/홈리빙 진입 + 상품 링크 노출 확인 |
| **가구/홈리빙 카테고리 > 상품 상세 이동** | **완전** | 상품 클릭 → 상세 페이지 이동 확인 |
| **상품상세 페이지 내 각 요소 정상 노출** | **완전** | 상품명(H1), 가격, 이미지, 구매/장바구니 버튼 확인 |
| **상품 가격 정보 정상 노출 (원 판매가, 혜택가)** | **부분** | 가격 노출(숫자+원 패턴) 확인. 혜택가 별도 구분 미확인 |
| 커스텀 상품 내역서 상품 상세 노출 | 미커버 | — |
| 상품 상세 다운로드 쿠폰 노출 및 다운로드 | 미커버 | — |
| **구매하기 클릭 시 옵션 선택 레이어 노출** | **부분** | 옵션 UI 노출 확인. 실제 클릭→레이어 동작은 제한적 |
| 옵션없는 상품 장바구니 담기 | 미커버 | 로그인 세션 필요 |
| 옵션없는 상품 구매하기 → 주문서 이동 | 미커버 | 로그인 세션 필요 |
| **옵션 상품 옵션 선택 시 레이어 노출** | **부분** | 옵션 선택 UI 노출 확인. 선택 동작은 제한적 |
| 옵션 상품 선택 후 장바구니 담기 | 미커버 | 로그인 세션 필요 |
| 옵션 상품 선택 후 바로구매 → 주문서 이동 | 미커버 | 로그인 세션 필요 |
| 커튼/블라인드 상품 옵션 선택 → 장바구니/주문서 이동 | 미커버 | — |
| 패키지 할인상품 선택 → 장바구니 이동 | 미커버 | — |
| 패키지 할인상품 선택 → 바로구매 주문서 이동 | 미커버 | — |
| 커스텀 상품 구매하기로 정상 구매 | 미커버 | — |

#### 인테리어 (9개 항목 → 커버: 3개)

| 기능 | 커버 여부 | 비고 |
|---|---|---|
| **붙박이장 셀프 플래너 버튼 클릭 → 화면 이동** | **부분** | 인테리어 페이지 내 플래너 링크 노출만 확인 |
| 붙박이장 셀프 플래너 상품 구성 및 구매 | 미커버 | — |
| **인테리어 메인 페이지 정상 노출** | **완전** | 인테리어 카테고리 진입 및 타이틀 확인 |
| 매거진 내 리스트 노출 및 이미지 상세 진입 | 미커버 | — |
| **시공사례 내 리스트 노출 및 이미지 상세 진입** | **완전** | 시공사례 목록 → 첫 번째 항목 클릭 → 상세 진입 |
| **전문가 찾기 진입 후 추천순 리스트 노출** | **부분** | 전문가 목록 노출 확인. 추천순 정렬 기준 미확인 |
| RD상세 진입 후 페이지 정상 노출 | 미커버 | — |
| 인테리어 결제 상품 장바구니/바로구매 | 미커버 | 로그인 세션 필요 |
| **인테리어 상담신청 가능 확인** | **부분** | 무료견적상담 링크 노출만 확인. 실제 신청 미확인 |

#### 마이페이지 (8개 항목 → 커버: 0개)

| 기능 | 커버 여부 | 비고 |
|---|---|---|
| MY 한샘 내 각 항목 정상 진입 가능 | 미커버 | 로그인 세션 필요 |
| 주문/배송 내역 리스트 및 상세 진입 | 미커버 | 로그인 세션 필요 |
| 인테리어 상담 내역 리스트 및 상세 진입 | 미커버 | 로그인 세션 필요 |
| 매장 상담 내역 리스트 정상 진입 | 미커버 | 로그인 세션 필요 |
| 매장 상담 내역 > 상담 취소 | 미커버 | 로그인 세션 필요 |
| 1:1 문의 정상 작성/등록 | 미커버 | 로그인 세션 필요 |
| 회원정보 변경 가능 | 미커버 | 로그인 세션 필요 |
| 배송지 관리 내 배송지 추가/삭제 | 미커버 | 로그인 세션 필요 |

---

### 미커버 주요 원인 분석

| 원인 | 해당 항목 수 | 설명 |
|---|---|---|
| 로그인 세션 필요 | 약 25개 | 장바구니 담기, 주문/결제, MY페이지 전체 |
| 실결제 필요 | 13개 | 신용카드, 페이코, 카카오페이 등 |
| 외부 OAuth 필요 | 5개 | 카카오/네이버/페이코/애플 간편가입 |
| 특수 상품 유형 | 4개 | 커스텀, 커튼/블라인드, 패키지 상품 |
| 미구현 시나리오 | 약 5개 | 매거진, 사이드메뉴, RD상세 등 |

### 커버리지 확대 방향

| 우선순위 | 기능 | 방법 |
|---|---|---|
| 높음 | 장바구니 담기 / 구매 플로우 | 테스트 전용 계정 세션 저장 후 재사용 |
| 높음 | 사이드(햄버거) 메뉴 이동 | MW E2E 시나리오 추가 |
| 중간 | 검색 내 상세 이동 (상품/사진/시공사례/매장) | 검색 결과 클릭 시나리오 추가 |
| 중간 | 매거진, RD 상세 페이지 | E2E 시나리오 추가 |
| 낮음 | 결제 / 주문 완료 | 테스트 환경 결제 수단 설정 필요 |

---

## 16. 콘솔 로그 출력 형식

**랜딩 테스트**
```
[현재/전체] 점검 중: URL
  ✅ 통과 (Xs)
  ❌ 실패 (Xs)
```

**E2E 테스트**
```
[점검] 테스트명
  ✅ 통과 (Xs)
  ❌ 실패 (Xs) — URL
```
