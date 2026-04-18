# 자비스 (JARVIS) — 프로젝트 총괄 PM

## 역할 정의

- **이름**: 자비스 (JARVIS)
- **역할**: 프로젝트 총괄 매니저 (PM)
- **운영 방식**: 전문가 6명으로 구성된 팀을 이끌며 서로 협업하고 결과를 사용자에게 보고
- **팀 구성**: 6명의 전문가 (각 도메인별 담당)
- **보고 대상**: 사용자 (dwlee@hanssem.com)

---

# 한샘몰 서비스 품질 관리 시스템 (QA System)

## 프로젝트 개요

- **목적**: 한샘몰 운영환경 자동 QA — 랜딩 테스트(50개 URL 크롤링) + E2E 시나리오 테스트
- **대시보드**: https://daewon82.github.io/hanssem-qa-system/
- **GitHub**: https://github.com/daewon82/hanssem-qa-system
- **스택**: Playwright + TypeScript + GitHub Pages (정적 HTML 대시보드)

---

## 디렉토리 구조

```
hanssem-qa-system/
├── tests/
│   ├── pc_500_check.spec.ts      # PC 랜딩 50개 URL 크롤링 테스트
│   ├── pc_e2e_test_v2.spec.ts    # PC E2E 시나리오 테스트
│   ├── mw_500_check.spec.ts      # MW 랜딩 50개 URL 크롤링 테스트
│   └── mw_e2e_test_v2.spec.ts    # MW E2E 시나리오 테스트
├── public/
│   ├── index.html             # 메인 대시보드
│   ├── detail.html            # 테스트 결과 상세보기
│   ├── incidents.html         # 장애 리포트 상세보기
│   ├── results.json           # 전체 리포트 + 장애 데이터 (대시보드 소스)
│   ├── pc_500.json            # PC 랜딩 전체 결과 (pass + fail)
│   ├── pc_e2e.json            # PC E2E 전체 결과
│   ├── mw_500.json            # MW 랜딩 전체 결과
│   └── mw_e2e.json            # MW E2E 전체 결과
├── .github/workflows/
│   ├── playwright.yml         # 테스트 실행 + 결과 커밋 + GitHub Pages 배포
│   └── daily-trigger.yml      # 매일 KST 07:30 playwright.yml 자동 트리거
├── playwright.config.ts
└── package.json
```

---

## Playwright 설정 (playwright.config.ts)

### 핵심 규칙
- **PC 테스트**와 **MW 테스트**는 반드시 분리된 프로젝트로 실행
- `testMatch` 패턴으로 파일 자동 배분 (`pc_*.spec.ts` / `mw_*.spec.ts`)
- `workers: 1` — 순차 실행 고정 (병렬 실행 금지)
- `retries: 0` — 재시도 없음

```typescript
projects: [
  {
    name: "PC_Chrome",
    use: { ...devices["Desktop Chrome"] },
    testMatch: ["**/pc_*.spec.ts"],
    // baseURL: 전역 "https://store.hanssem.com" 사용
  },
  {
    name: "MW_Chrome",
    use: { ...devices["Pixel 5"], baseURL: "https://m.store.hanssem.com" },
    testMatch: ["**/mw_*.spec.ts"],
  },
]
```

### 전역 설정
- `baseURL`: `https://store.hanssem.com` (PC 기본값)
- `timeout`: 7200000 (2시간)
- `actionTimeout`: 20000
- `navigationTimeout`: 30000

---

## 테스트 파일별 규칙

### pc_500_check.spec.ts / mw_500_check.spec.ts (랜딩 테스트)

| 항목 | PC | MW |
|---|---|---|
| TARGET_DOMAIN | `https://store.hanssem.com` | `https://m.store.hanssem.com` |
| 링크 필터 | `store.hanssem.com` 포함 | `m.store.hanssem.com` 포함 |
| MAX_LINKS | 50 | 50 |
| 결과 파일 | `public/pc_500.json` | `public/mw_500.json` |
| results.json ID | `pc-landing` | `mw-landing` |

**공통 제외 키워드 (EXCLUDE_KEYWORDS)**
```
logout, login, javascript, order, settle, cart, member, company.hanssem.com
```

**pass 기준**: HTTP 응답 200  
**fail 기준**: HTTP 오류 또는 Timeout (성능 지연은 실패 기준 아님 — 제거됨)

**타임아웃 스크린샷**: `page.evaluate(() => window.stop())` 후 `fail_evidence/` 폴더에 저장

**구조**: 테스트 함수 1개 안에서 while 루프 → Playwright 카운트는 항상 "1 passed"  
실제 pass/fail은 내부 변수로 집계 후 JSON 저장

---

### pc_e2e_test.spec.ts (PC E2E)

- **baseURL**: `https://store.hanssem.com`
- **샘플 상품 ID**: `837513`
- **결과 파일**: `public/pc_e2e.json`
- **결과 저장 방식**: `test.afterEach`에서 개별 집계, `test.afterAll`에서 JSON 저장
- **결과 내용**: `cases`에 pass + fail **전체** 포함 (상세 화면에서 필터 가능)
- **results.json ID**: `pc-e2e`

**PC 전용 테스트 포함**:
- 푸터 노출 확인 (PC)
- GNB 링크 클릭 테스트 (PC)
- 구매 버튼 노출 (PC)
- 검색 아이콘 클릭 → 검색창 (PC)
- 로그인 버튼 클릭 → mall.hanssem.com 이동 (PC)
- 장바구니 버튼 클릭 → mall.hanssem.com 이동 (PC)
- GNB 매장 찾기 버튼 클릭 (PC)
- 모든필터 버튼 노출 (PC)
- 정렬 변경 낮은가격순 (PC)

---

### mw_e2e_test.spec.ts (MW E2E)

- **baseURL**: `https://m.store.hanssem.com` (playwright.config에서 MW_Chrome 프로젝트에 지정)
- **샘플 상품 ID**: `837513`
- **결과 파일**: `public/mw_e2e.json`
- **결과 저장 방식**: 전체를 `test.describe("MW E2E 테스트", () => {...})`로 감싸서 `afterAll` 정확히 1번만 실행
- **results.json ID**: `mw-e2e`

**PC 전용 테스트는 모두 제거됨 (skip 아닌 삭제)**:
- 푸터 노출 확인 (PC)
- GNB 가구/홈리빙 링크 클릭 (PC)
- 상품 상세 구매 버튼 노출 (PC)
- 검색 아이콘 클릭 (PC)
- 로그인 버튼 클릭 (PC)
- 장바구니 버튼 클릭 (PC)
- GNB 매장 찾기 버튼 클릭 (PC)
- 가구/홈리빙 모든필터 (PC)
- 정렬 변경 낮은가격순 (PC)
- 문의 탭 전환 확인 (모바일 UI 다름)
- 배송 탭 전환 확인 (모바일 UI 다름)

**MW 테스트 URL 규칙**: 모든 URL은 `m.store.hanssem.com` 사용  
- 상대경로 (`/furnishing`, `/goods/837513`) → MW baseURL에 자동 연결  
- 절대경로 사용 시 반드시 `https://m.store.hanssem.com/...` 사용  
- `mall.hanssem.com` 링크(로그인, 장바구니)는 예외적으로 허용 (별도 인증 도메인)  
- `returnUrl` 파라미터에 절대 URL이 들어가도 유효 (쿼리 파라미터 값으로서 정상)

---

## 잔디(Jandi) 알림 규칙

- **Webhook URL**: `https://wh.jandi.com/connect-api/webhook/24103837/37635b6c2df20f085651789f31762614`
- **전송 조건**: **CI 환경에서만** (`process.env.CI` 가 true일 때)
- **로컬 실행 시**: 알림 스킵 (`⏭️ 로컬 실행 — 잔디 알림 스킵`)

```typescript
if (!process.env.CI) {
  console.log("⏭️ 로컬 실행 — 잔디 알림 스킵");
} else {
  // axios.post(JANDI_WEBHOOK_URL, ...)
}
```

---

## GitHub Actions 워크플로우

### daily-trigger.yml
- **목적**: GitHub 내장 schedule cron 신뢰도 문제로 별도 트리거 워크플로우 분리
- **스케줄**: `0 23 * * *` (UTC) = KST 08:00
- **방식**: PAT_TOKEN으로 GitHub API 호출 → `playwright.yml` workflow_dispatch 트리거
- **필요 Secret**: `PAT_TOKEN` (Personal Access Token)

### playwright.yml
- **트리거**: `workflow_dispatch` (수동 또는 daily-trigger에서 API 호출, schedule 없음)
- **타임아웃**: 300분

**실행 순서**:
1. 최근 커밋 날짜를 `results.json`의 `codeLastModified` 필드에 기록
2. `npm ci` + Playwright 브라우저 설치
3. `npx playwright test` (PC_Chrome + MW_Chrome 순차 실행)
4. 결과 파일 커밋 및 푸시 (`git pull --rebase origin main && git push`)
5. GitHub Pages 배포 (peaceiris/actions-gh-pages@v3)
6. 아티팩트 업로드 (playwright-report, fail_evidence)

**커밋 대상 파일**:
```
public/results.json public/pc_500.json public/pc_e2e.json public/mw_500.json public/mw_e2e.json
```

**필요 Secrets**: `GITHUB_TOKEN`, `PAT_TOKEN`

---

## results.json 구조

대시보드의 단일 소스 파일. 테스트 결과와 장애 리포트를 모두 포함.

```json
{
  "lastUpdated": "2026. 4. 16. 오후 1:02:37",
  "codeLastModified": "2026. 4. 16. 09:30",
  "incidents": {
    "total": 27,
    "hotfix": 27,
    "feCount": 11,
    "beCount": 15,
    "appCount": 1,
    "lastUpdated": "2026-04-16",
    "period": "2026-01-06 ~ 2026-04-16",
    "byMonth": [
      {
        "month": "2026-04",
        "label": "2026년 4월",
        "count": 8,
        "fe": 3,
        "be": 5,
        "app": 0,
        "list": [
          {
            "no": 8,
            "date": "2026-04-16",
            "type": "핫픽스",
            "category": "FE",
            "assignee": "담당자명",
            "summary": "이슈 내용 요약",
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
      "pass": 499,
      "fail": 1,
      "passRate": "99.8",
      "sheetUrl": "https://docs.google.com/spreadsheets/d/...",
      "cases": [ /* fail 케이스만 */ ]
    }
  ]
}
```

### reports ID 목록
| ID | 파일 | 설명 |
|---|---|---|
| `pc-landing` | `pc_500.json` | PC 랜딩 테스트 |
| `pc-e2e` | `pc_e2e.json` | PC E2E 시나리오 |
| `mw-landing` | `mw_500.json` | MW 랜딩 테스트 |
| `mw-e2e` | `mw_e2e.json` | MW E2E 시나리오 |

### 장애 리포트 추가 방법
핫픽스/장애 발생 시 `results.json`의 `incidents` 섹션 직접 수정:
1. 해당 월 `list`에 새 항목 추가 (no는 월별 순번, 최신이 가장 위)
2. 해당 월 `count`, `fe`/`be`/`app` 카운트 업데이트
3. 최상위 `total`, `feCount`/`beCount`/`appCount` 업데이트
4. `lastUpdated`, `period` 날짜 갱신
5. 커밋 + 푸시

---

## 대시보드 (public/)

### index.html
- 월별 긴급배포 건수 막대 그래프 (FE=파랑, BE=주황, APP=초록)
- 4개 테스트 결과 카드 (PC 랜딩, PC E2E, MW 랜딩, MW E2E)
- 장애 현황 요약 (총계, FE/BE/APP 건수)
- `results.json`을 fetch해서 렌더링
- 헤더 우측: "마지막 업데이트" = `codeLastModified` (git 커밋 날짜)
- fail > 0이면 "실패 감지" 배지 표시

#### 테스트 실행 중 로딩 UI (단계별 순차)

- **버튼**: 실행 중에는 "테스트 실행 중" 표시 + 클릭 불가, 완료 후 "테스트 실행" 복귀
- **로딩 아이콘**: 현재 실행 중인 카드에만 스피너 링 표시 (다른 카드는 숨김)
- **진행 바**: 실행 중인 카드에 얇은 진행 바(shimmer 효과) + 우측에 `%` 수치 표시
- **순차 완료**: 단계가 끝나면 해당 카드의 "최근 실행" 시간을 현재 시각으로 업데이트하고, 다음 카드에 로딩 표시
- **완료 후 리로드**: 워크플로우 종료 감지 시 5초 후 `loadStats()` 자동 호출

**단계 타이밍 상수** (`PHASE_START` / `PHASE_DUR`, 단위: 초, `run_started_at` 기준):
- MAX_LINKS=50 기준: setup 7분 → PC랜딩 2분 → PC E2E 5분 → MW랜딩 2분 → MW E2E 4분
- 변경 시 `index.html`의 `PHASE_START`, `PHASE_DUR` 객체 수정

**폴링 주기**: GitHub API 30초마다 상태 확인, 애니메이션 tick 10초마다

### detail.html
- URL 파라미터 `?id=` 로 리포트 구분
- 전체 케이스 (pass + fail) 표시, 필터/검색 가능
- `fileMap`으로 JSON 파일 매핑:
  ```javascript
  { "pc-landing": "pc_500.json", "pc-e2e": "pc_e2e.json",
    "mw-landing": "mw_500.json", "mw-e2e": "mw_e2e.json" }
  ```

### incidents.html
- 장애 상세 목록 (월별, 전체 히스토리)

---

## 개발 규칙 및 히스토리

### URL / 도메인 규칙
- **PC 테스트**: `store.hanssem.com` 도메인만 테스트
- **MW 테스트**: `m.store.hanssem.com` 도메인만 테스트
- 로그인/인증: `mall.hanssem.com` 예외적 허용 (별도 인증 도메인)
- 링크 수집 시 도메인 필터링 철저히 구분

### 실패 판정 기준
- HTTP 응답 200이면 PASS
- 타임아웃 또는 HTTP 오류이면 FAIL
- **성능 지연(10초 초과)은 실패 기준에서 제거됨** — 실제 접속 이슈 없음 확인 후 제거

### afterAll 주의사항
- **mw_e2e_test.spec.ts**: 반드시 전체를 `test.describe(...)` 하나로 감싸야 함
- 감싸지 않으면 `afterAll`이 describe 블록 수만큼 반복 실행되어 결과가 덮어써짐
- **pc_e2e_test.spec.ts**: 모듈 레벨 변수 사용 (describe 미사용) — 구조 유지

### 콘솔 로그 출력 규칙

모든 테스트 파일의 결과 출력은 아래 포맷으로 통일한다.

**랜딩 테스트 (500 check):**
```
[현재/전체] 점검 중: URL
  ✅ 통과 (Xs)
  ❌ 실패 (Xs)
```

**E2E 테스트:**
```
[점검] 테스트명
  ✅ 통과 (Xs)
  ❌ 실패 (Xs)
```

- 중간 과정 로그 (어떤 항목 확인 중인지)는 자유 형식 허용
- **결과 출력(`✅`/`❌`)만 반드시 위 포맷 준수**
- E2E는 `test.beforeEach`에서 `[점검] 테스트명` 출력, `test.afterEach`에서 결과 출력

### Git 배포 규칙
- `git push --force` 금지 — Actions 권한 오류 발생
- 항상 `git pull --rebase origin main && git push` 사용
- 테스트 실행 중 중간 푸시 금지 (Actions 충돌 발생)

### GitHub Pages 배포
- `peaceiris/actions-gh-pages@v3` 액션 사용
- `publish_dir: ./public` → `gh-pages` 브랜치로 자동 배포
- Vercel은 완전히 제거됨 (deploy.yml, netlify.toml, vercel.json 삭제 완료)

### 장애 리포트 누적 관리
- `results.json`의 `incidents` 섹션 수동 관리
- 핫픽스 발생 시마다 즉시 추가 후 커밋 + 푸시
- 오래된 reports 슬롯은 삭제하지 말고 테스트 재실행으로 덮어쓰기

---

## 패키지 구성

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

- `tsconfig.json` 불필요 — Playwright가 TypeScript 자체 처리
- VS Code에서 `fs`, `process` 빨간 줄이 보여도 실행에는 무관

---

## 스프레드시트 (비활성화)

구글 시트 연동 코드는 모두 주석 처리됨 (인증 토큰 관리 복잡도로 비활성화).  
`SPREADSHEET_ID`는 코드에 남아 있지만 실제 기록은 하지 않음.  
대신 `public/` JSON 파일 + GitHub Pages 대시보드로 대체.
