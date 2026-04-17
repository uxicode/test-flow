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
- 문서 기반 TC(MVP): `POST /api/docs/parse` (multipart `file`), `POST /api/docs/generate-testcases`, `POST /api/scenarios/from-doc`, `POST /api/scenarios/:id/doc/generate`, `POST /api/scenarios/:id/doc/export-excel`
- 녹화: `POST /api/sessions/record` (`url`, `mode`: `hosted` | `codegen`), `POST /api/sessions/:sessionId/stop`
- 실행: `POST /api/runs`, `GET /api/runs/:runId`, 산출물 라우트, `GET /ws/runs/:runId`

### 문서 기반 TC MVP

- 현재 문서 추출은 **`.txt`, `.md`, `.pdf`, `.docx`, `.hwpx`**를 지원합니다.
- 문서 업로드 한도는 현재 서버 기준 **64MB**입니다.
- `pdf`는 텍스트 기반 PDF 중심의 MVP 추출기입니다. 스캔 PDF나 복잡한 레이아웃은 OCR/전용 파서 없이 정확도가 낮을 수 있습니다.
- `POST /api/docs/parse`는 문서에서 requirement 후보를 추출해 메모리 캐시에 보관하고 `document.id`를 반환합니다.
- `POST /api/docs/generate-testcases`는 `documentId` 또는 `requirements` 배열을 받아 문서 기반 TC 초안을 생성합니다.
- `POST /api/scenarios/from-doc`는 업로드부터 requirement/TC 생성, `Scenario.mode = "docTc"` 저장까지 한 번에 수행합니다.
- 생성된 `generatedDocTestCases`는 `POST /api/scenarios/:id/doc/export-excel`로 엑셀 형식으로 내보낼 수 있습니다.
- 웹 UI에서는 시나리오 편집 화면의 **문서 TC** 탭에서 문서 업로드, requirement 확인, TC 생성을 수행할 수 있습니다.
- 웹 UI의 **문서 TC** 탭에서 생성된 TC를 `xlsx`, `md`, `json`으로 바로 다운로드할 수 있습니다.
- 서버에 `OPENAI_API_KEY`가 설정되면 OpenAI Responses API의 Structured Outputs로 requirement/TC 생성을 시도합니다. 실패하거나 키가 없으면 규칙 기반 fallback을 사용합니다.
- 선택 환경 변수: `TESTFLOW_DOC_TC_MODEL` (`gpt-4.1-mini` 기본값)

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
