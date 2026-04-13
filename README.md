# TestFlow

Fastify API, React 대시보드, Playwright로 E2E 시나리오를 만들고 실행합니다. 테스트는 **호스트의 Playwright**로 실행되며(앱 동작에 Docker는 필요 없습니다). **Electron** 데스크톱 빌드로 UI와 API를 묶어 배포할 수 있습니다.

## 요구 사항

- Node.js 20+
- pnpm 9+ (`corepack enable` && `corepack prepare pnpm@9.15.0 --activate`)

Docker는 **필수가 아닙니다**. 선택 사항으로 `docker/Dockerfile.runner`는 CI나 수동 컨테이너 실행용으로 남아 있습니다.

## 빠른 시작 (브라우저 개발)

```bash
pnpm install
pnpm --filter @testflow/playwright-runner exec playwright install chromium
pnpm dev
```

- API: `http://127.0.0.1:3001` (`GET /health`)
- 웹: `http://127.0.0.1:5173` (Vite가 `/api`, `/ws`를 프록시)

`pnpm --filter @testflow/web build` 후 `pnpm --filter @testflow/api start`를 실행하면, 빌드된 UI(`apps/web/dist`)를 API와 같은 포트에서 제공합니다.

## Electron 데스크톱 앱

단일 창에서 `http://127.0.0.1:<PORT>`를 로드합니다. 시작 시 runner 패키지에서 `playwright install chromium`을 실행하므로, 처음 실행 시 브라우저 다운로드가 있을 수 있습니다.

```bash
pnpm electron:dev
```

패키지 설치 파일(`apps/desktop/release/` 아래):

```bash
pnpm electron:build
```

`electron-builder`가 `packages/playwright-runner`와 `apps/web/dist`를 `extraResources`로 패키지에 포함합니다.

## 데이터 디렉터리

- 실행 결과: `data/runs/<runId>/`
- 시나리오: `data/scenarios/<id>.json`
- 녹화: `data/recordings/<sessionId>/`

**패키징된** Electron 앱에서는 기본값으로 실행·시나리오·녹화 경로가 OS 사용자 데이터 디렉터리를 씁니다(`apps/desktop/src/main.ts` 참고).

### 경로 오버라이드 (API / Electron 메인)

| 변수 | 용도 |
|------|------|
| `TESTFLOW_REPO_ROOT` | 모노레포 루트(상대 경로 보조) |
| `TESTFLOW_DATA_DIR` | 실행 산출물 상위(`.../runs` 구조) |
| `TESTFLOW_SCENARIOS_DIR` | 시나리오 JSON 디렉터리 |
| `TESTFLOW_RECORDINGS_DIR` | 녹화 세션 디렉터리 |
| `TESTFLOW_PLAYWRIGHT_RUNNER_DIR` | `packages/playwright-runner` 경로 |
| `TESTFLOW_WEB_DIST_DIR` | 빌드된 웹 앱(`apps/web/dist`) |

## API 요약

- 시나리오: `GET/POST /api/scenarios`, `GET/PUT/DELETE /api/scenarios/:id`
- Smart TC: `GET /api/scenarios/:id/tc`, `POST /api/tc/convert`
- 녹화: `POST /api/sessions/record` (`url`, `mode`: `hosted` | `codegen`), `POST /api/sessions/:sessionId/stop`
- 실행: `POST /api/runs`, `GET /api/runs/:runId`, 산출물 라우트, `GET /ws/runs/:runId`
- Excel → Playwright (code generation only): `POST /api/excel/parse` → `{ "features": [...], "diagnostics": { "errors", "warnings" } }` (multipart `file`, optional `sheetNames` JSON string); `POST /api/excel/generate` accepts JSON `{ "testCases": [...] }` (same objects as `features`) → ZIP of `generated-tests/*.spec.ts`
- Scenarios can persist parsed Excel rows as `excelTestCases` (same shape as parse `features`). The web app edits this under each scenario (Excel TC tab). `POST /api/runs` accepts `excelTestCases`; when the array is non-empty it wins over builder steps / script and runs as one merged `scenario.spec.ts`. Sending `excelTestCases: []` skips stored Excel TC for that run.

### Excel template (`.xlsx`, 테스트케이스_ex 양식)

- 시트 상단 요약 블록은 무시하고, **`정책 ID`**와 **`테스트케이스ID`**가 같은 행에 있는 줄을 헤더로 인식합니다. 그 다음 `ver.` 보조 행이 있으면 한 줄 건너뜁니다.
- **필수 열:** `정책 ID`, `테스트케이스ID`, `기대결과`. **선택:** `우선순위`, `1 Depth`…`7 Depth`, `사전조건`, `Chrome`, `Edge`, `결함내역/비고` 등.
- **ZIP 내 파일:** 시트·정책별 `feature` = `{sheetName}_{policyId}` 하나당 `.spec.ts` 하나. 각 TC 행은 `test.fixme` + 기대결과 등이 블록 주석으로 들어갑니다.
- **선택 자동화 열** (같은 시트에 추가 가능): `test_id`, `action` (`click` / `input` / `navigate`), `value`, `assertion` (`visible:` / `text:` / `url:` DSL). 채워진 행에만 `getByTestId` 등 코드가 생성됩니다. 열 매핑은 [`apps/api/src/excelParser.ts`](apps/api/src/excelParser.ts)의 `matchColumnLabel` 참고.

### curl

```bash
curl -sS -X POST http://127.0.0.1:3001/api/excel/parse \
  -F "file=@./cases.xlsx" \
  -F 'sheetNames=["Sheet1"]'

curl -sS -X POST http://127.0.0.1:3001/api/excel/generate \
  -H 'content-type: application/json' \
  -d @body.json -o generated-tests.zip
```

`body.json` uses `{ "testCases": [ ... ] }` — use the same array as `features` from the parse response.

## 모노레포 구조

- `apps/api` — Fastify, WebSocket, 선택적 정적 UI, 로컬 Playwright 테스트 실행
- `apps/web` — Vite, React, Tailwind
- `apps/desktop` — Electron 메인 프로세스, `electron-builder` 설정
- `packages/playwright-runner` — Playwright 설정, `recordHost.ts`, codegen 작업 디렉터리
- `docker/Dockerfile.runner` — 선택적 레거시 러너 이미지

## 프로덕션 데스크톱을 위한 다음 단계

- 코드 서명 및 공증(macOS / Windows)
- 자동 업데이트(`electron-updater`)
- 선택: DB 기반 시나리오, CI용 API 키
