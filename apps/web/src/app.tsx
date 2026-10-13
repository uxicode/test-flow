import { useEffect, useRef, useState } from "react";
import { ActionButton } from "./components/action-button";
import { LogPanel } from "./components/log-panel";
import { PlaywrightSpecPanel } from "./components/playwright-spec-panel";
import { TcDocument } from "./components/tc-document";
import type { TcInput } from "@testflow/tc";
import { generatePlaywrightSpec, playwrightSpecFileName } from "@testflow/tc/playwright-spec";
import {
  getJson,
  isHashedCssModuleClient,
  locatorCodeSnippet,
  openLogSocket,
  postJson,
  type AnalysisView,
  type ElementEntry,
  type ElementMapListView,
  type ElementMapMeta,
  type ExploreView,
  type LocatorCandidate,
  type LocatorStrategy,
  type LogEvent,
  type MatchJobView,
  type MatchListView,
  type MatchSet,
  type MatchSetMeta,
  type RunView,
  type ScreenElementMap,
  type ServerConfig,
  type TcFile,
  type TcFileListView,
  type TcFileMeta,
  type TestCase,
} from "./lib/api";

function statusLabel(runStatus: string): string {
  if (runStatus === "passed") return "통과";
  if (runStatus === "failed") return "실패";
  if (runStatus === "cancelled") return "중지";
  return "진행 중";
}

function statusClass(label: string): string {
  if (label === "통과") return "text-emerald-300";
  if (label === "실패") return "text-rose-300";
  if (label === "진행 중") return "text-sky-300";
  return "text-slate-400";
}

const STORED_FIGMA_URL = "testflow.figma-url";
const STORED_START_URL = "testflow.start-url";
const ACCOUNT_EMAIL = /이메일|아이디|email/iu;
const ACCOUNT_PASSWORD = /비밀번호|패스워드|password/iu;

function isAccountField(target: string): boolean {
  return ACCOUNT_EMAIL.test(target) || ACCOUNT_PASSWORD.test(target);
}

function readStored(key: string): string {
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function writeStored(key: string, value: string): void {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    return;
  }
}

function readSession(key: string): string {
  try {
    return sessionStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function writeSession(key: string, value: string): void {
  try {
    if (value) sessionStorage.setItem(key, value);
    else sessionStorage.removeItem(key);
  } catch {
    return;
  }
}

export function App() {
  const [figmaUrl, setFigmaUrl] = useState(() => readStored(STORED_FIGMA_URL));
  const [specText, setSpecText] = useState("");
  const [jobId, setJobId] = useState("");
  const [status, setStatus] = useState("");
  const [cases, setCases] = useState<TestCase[]>([]);
  const [screenCount, setScreenCount] = useState(0);
  const [logs, setLogs] = useState<LogEvent[]>([]);
  const [startUrl, setStartUrl] = useState(() => readSession(STORED_START_URL) || "https://");
  const [values, setValues] = useState<Record<string, Record<string, string>>>({});
  const [runIds, setRunIds] = useState<Record<string, string>>({});
  const [caseState, setCaseState] = useState<Record<string, string>>({});
  const [errorMessage, setErrorMessage] = useState("");
  const [isWorking, setIsWorking] = useState(false);
  const [busyAction, setBusyAction] = useState<"analyze" | "text" | "cancel" | "refresh" | "stop-run" | null>(null);
  const [runningCaseId, setRunningCaseId] = useState("");
  /** `${caseId}:${inputTarget}` 또는 `${caseId}:__option_container__` */
  const [inspectingFieldKey, setInspectingFieldKey] = useState("");
  const [editingInputKey, setEditingInputKey] = useState("");
  const [serverConfig, setServerConfig] = useState<ServerConfig | null>(null);
  const [tcFiles, setTcFiles] = useState<TcFileMeta[]>([]);
  const [showTcFiles, setShowTcFiles] = useState(false);
  // Phase 2: 화면 탐색
  const [exploreUrl, setExploreUrl] = useState(() => readSession(STORED_START_URL) || "https://");
  const [exploreId, setExploreId] = useState("");
  const [exploreStatus, setExploreStatus] = useState<ExploreView["status"] | "">("");
  const [exploreLogs, setExploreLogs] = useState<LogEvent[]>([]);
  const [elementMaps, setElementMaps] = useState<ElementMapMeta[]>([]);
  const [showElementMaps, setShowElementMaps] = useState(false);
  const [selectedMap, setSelectedMap] = useState<ScreenElementMap | null>(null);
  const [isBusyExplore, setIsBusyExplore] = useState(false);
  const exploreSocketRef = useRef<WebSocket | null>(null);
  // Phase 3: 매칭 + 검토
  const [matchJobId, setMatchJobId] = useState("");
  const [matchJobStatus, setMatchJobStatus] = useState<MatchJobView["status"] | "">("");
  const [currentMatchId, setCurrentMatchId] = useState("");
  const [matchSet, setMatchSet] = useState<MatchSet | null>(null);
  const [matchList, setMatchList] = useState<MatchSetMeta[]>([]);
  const [showMatchList, setShowMatchList] = useState(false);
  const [isBusyMatch, setIsBusyMatch] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    return () => {
      socketRef.current?.close();
      exploreSocketRef.current?.close();
    };
  }, []);

  // 매칭 작업 폴링
  useEffect(() => {
    if (!matchJobId || matchJobStatus === "completed" || matchJobStatus === "failed" || matchJobStatus === "cancelled") return;
    const timer = window.setInterval(() => {
      void getJson<MatchJobView>(`/api/matches/jobs/${matchJobId}`)
        .then((view) => {
          setMatchJobStatus(view.status);
          if (view.status !== "running") {
            window.clearInterval(timer);
            if (view.status === "completed" && view.matchId) {
              setCurrentMatchId(view.matchId);
              void loadMatchSetDetail(view.matchId);
            }
          }
        })
        .catch(() => undefined);
    }, 1200);
    return () => window.clearInterval(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchJobId, matchJobStatus]);

  useEffect(() => {
    writeStored(STORED_FIGMA_URL, figmaUrl);
  }, [figmaUrl]);

  useEffect(() => {
    writeSession(STORED_START_URL, startUrl);
  }, [startUrl]);

  useEffect(() => {
    void getJson<ServerConfig>("/api/config")
      .then((cfg) => setServerConfig(cfg))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!jobId) return;
    let stopped = false;
    const timer = window.setInterval(() => {
      void getJson<AnalysisView>(`/api/analysis/${jobId}`)
        .then((view) => {
          if (stopped) return;
          setStatus(view.status);
          setCases(view.cases);
          setScreenCount(view.screens.length);
          if (view.status === "completed" || view.status === "failed" || view.status === "cancelled")
            window.clearInterval(timer);
        })
        .catch(() => undefined);
    }, 1200);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [jobId]);

  useEffect(() => {
    const pending = Object.entries(runIds).filter(([caseId]) => caseState[caseId] === "진행 중");
    if (pending.length === 0) return;
    const timer = window.setInterval(() => {
      for (const [caseId, id] of pending) {
        void getJson<RunView>(`/api/runs/${id}`)
          .then((run) => {
            const label = statusLabel(run.status);
            setCaseState((current) => (current[caseId] === label ? current : { ...current, [caseId]: label }));
          })
          .catch(() => undefined);
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [runIds, caseState]);

  function appendLog(event: LogEvent) {
    setLogs((current) => [...current, event]);
    const caseId = event.caseId;
    const runStatus = event.runStatus;
    if (!caseId || !runStatus) return;
    setCaseState((current) => ({ ...current, [caseId]: statusLabel(runStatus) }));
  }

  function watch(channelId: string) {
    socketRef.current?.close();
    socketRef.current = openLogSocket(channelId, appendLog);
  }

  async function refreshJob(id: string) {
    const view = await getJson<AnalysisView>(`/api/analysis/${id}`);
    setStatus(view.status);
    setCases(view.cases);
    setScreenCount(view.screens.length);
  }

  async function loadTcFileList() {
    const res = await getJson<TcFileListView>("/api/tc-files");
    setTcFiles(res.files);
  }

  async function handleLoadTcFile(fileId: string) {
    try {
      const tcFile = await getJson<TcFile>(`/api/tc-files/${fileId}`);
      setCases(tcFile.cases);
      setJobId(tcFile.jobId);
      setStatus("completed");
      setLogs([]);
      setScreenCount(0);
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "TC 파일 로드에 실패했습니다.");
    }
  }

  async function startAnalysis(body: Record<string, string>, action: "analyze" | "text") {
    const startedAt = Date.now();
    setBusyAction(action);
    setIsWorking(true);
    setErrorMessage("");
    setLogs([]);
    setCases([]);
    setScreenCount(0);
    try {
      const created = await postJson<{ jobId: string }>("/api/analysis", body);
      setJobId(created.jobId);
      watch(created.jobId);
      window.setTimeout(() => {
        void refreshJob(created.jobId).catch((error: unknown) => {
          setErrorMessage(error instanceof Error ? error.message : "조회에 실패했습니다.");
        });
      }, 400);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "분석 시작에 실패했습니다.");
    } finally {
      await holdBusy(startedAt);
      setIsWorking(false);
      setBusyAction(null);
    }
  }

  async function handleAnalyze() {
    await startAnalysis({ url: figmaUrl }, "analyze");
  }

  async function handleAnalyzeText() {
    await startAnalysis({ specText }, "text");
  }

  async function holdBusy(startedAt: number): Promise<void> {
    const remain = 280 - (Date.now() - startedAt);
    if (remain > 0) await new Promise((resolve) => window.setTimeout(resolve, remain));
  }

  async function handleCancelAnalysis() {
    if (!jobId) return;
    const startedAt = Date.now();
    setBusyAction("cancel");
    try {
      await postJson(`/api/analysis/${jobId}/cancel`, {});
      await refreshJob(jobId);
    } finally {
      await holdBusy(startedAt);
      setBusyAction(null);
    }
  }

  async function handleRefreshJob() {
    if (!jobId) return;
    const startedAt = Date.now();
    setBusyAction("refresh");
    try {
      await refreshJob(jobId);
    } finally {
      await holdBusy(startedAt);
      setBusyAction(null);
    }
  }

  function mergedValues(testCase: TestCase): Record<string, string> {
    return { ...(values[testCase.id] ?? {}) };
  }

  function updateTestCase(caseId: string, patch: Partial<TestCase>) {
    setCases((current) =>
      current.map((tc) => (tc.id === caseId ? { ...tc, ...patch } : tc)),
    );
  }

  function updateInputField(caseId: string, inputTarget: string, patch: Partial<TcInput>) {
    setCases((current) =>
      current.map((tc) => {
        if (tc.id !== caseId) return tc;
        return {
          ...tc,
          inputs: tc.inputs.map((input) =>
            input.target === inputTarget ? { ...input, ...patch } : input,
          ),
        };
      }),
    );
  }

  function inspectFieldKey(caseId: string, inputTarget: string): string {
    return `${caseId}:${inputTarget}`;
  }

  async function handlePickSelector(caseId: string, inputTarget: string) {
    if (!startUrl || !/^https?:\/\//iu.test(startUrl)) {
      setErrorMessage("셀렉터를 추출하려면 먼저 하단에 http(s) 시작 URL을 입력해야 합니다.");
      return;
    }
    const fieldKey = inspectFieldKey(caseId, inputTarget);
    const startedAt = Date.now();
    setInspectingFieldKey(fieldKey);
    setErrorMessage("");
    try {
      const res = await postJson<{ selector: string }>("/api/inspect-selector", {
        startUrl,
        label: inputTarget,
      });
      if (!res.selector) {
        setErrorMessage("셀렉터가 적용되지 않았습니다. 브라우저에서 요소를 클릭한 뒤 [적용하기]를 눌러야 합니다.");
      } else if (inputTarget === "__option_container__") {
        updateTestCase(caseId, { optionContainerSelector: res.selector });
      } else {
        updateInputField(caseId, inputTarget, { selector: res.selector });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "셀렉터 추출에 실패했습니다.";
      setErrorMessage(message);
    } finally {
      await holdBusy(startedAt);
      setInspectingFieldKey("");
    }
  }

  async function handleRun(testCase: TestCase) {
    if (!jobId) return;
    const startedAt = Date.now();
    setRunningCaseId(testCase.id);
    setErrorMessage("");
    setCaseState((current) => ({ ...current, [testCase.id]: "진행 중" }));
    try {
      const created = await postJson<{ runId: string }>("/api/runs", {
        jobId,
        caseId: testCase.id,
        startUrl,
        values: mergedValues(testCase),
        apiPath: testCase.apiPath,
        assert: testCase.assert,
        optionContainerSelector: testCase.optionContainerSelector,
        inputs: testCase.inputs,
      });
      setRunIds((current) => ({ ...current, [testCase.id]: created.runId }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "실행에 실패했습니다.";
      setCaseState((current) => ({ ...current, [testCase.id]: "실패" }));
      setErrorMessage(message);
    } finally {
      await holdBusy(startedAt);
      setRunningCaseId("");
    }
  }

  // ── Phase 2: 화면 탐색 핸들러 ──────────────────────────────────────────────

  useEffect(() => {
    if (!exploreId || exploreStatus === "completed" || exploreStatus === "failed" || exploreStatus === "cancelled") return;
    const timer = window.setInterval(() => {
      void getJson<ExploreView>(`/api/explore/${exploreId}`)
        .then((view) => {
          setExploreStatus(view.status);
          if (view.status !== "running") {
            window.clearInterval(timer);
            if (view.status === "completed" && view.mapId) {
              void loadElementMapDetail(view.mapId);
            }
          }
        })
        .catch(() => undefined);
    }, 1200);
    return () => window.clearInterval(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exploreId, exploreStatus]);

  async function loadElementMapList() {
    const res = await getJson<ElementMapListView>("/api/element-maps");
    setElementMaps(res.maps);
  }

  async function loadElementMapDetail(mapId: string) {
    const map = await getJson<ScreenElementMap>(`/api/element-maps/${mapId}`);
    setSelectedMap(map);
  }

  async function handleStartExplore() {
    if (!exploreUrl || !/^https?:\/\//iu.test(exploreUrl)) {
      return;
    }
    setIsBusyExplore(true);
    setExploreLogs([]);
    setExploreStatus("running");
    setSelectedMap(null);
    try {
      const created = await postJson<{ exploreId: string }>("/api/explore", { startUrl: exploreUrl });
      setExploreId(created.exploreId);
      exploreSocketRef.current?.close();
      exploreSocketRef.current = openLogSocket(created.exploreId, (event) => {
        setExploreLogs((prev) => [...prev, event]);
      });
    } catch (error) {
      setExploreStatus("failed");
      setExploreLogs([{ message: error instanceof Error ? error.message : "탐색 실패", at: new Date().toISOString(), channelId: "" }]);
    } finally {
      setIsBusyExplore(false);
    }
  }

  // ── Phase 3: 매칭 핸들러 ──────────────────────────────────────────────────

  async function loadMatchSetDetail(id: string) {
    const set = await getJson<MatchSet>(`/api/matches/${id}`);
    setMatchSet(set);
    setCurrentMatchId(id);
  }

  async function loadMatchList() {
    const res = await getJson<MatchListView>("/api/matches");
    setMatchList(res.matches);
  }

  async function handleStartMatch(mapId: string) {
    if (!jobId) { setErrorMessage("먼저 분석을 실행해 TC 케이스를 생성하세요."); return; }
    setIsBusyMatch(true);
    setMatchJobStatus("running");
    try {
      const res = await postJson<{ matchJobId: string }>("/api/matches", { jobId, mapId });
      setMatchJobId(res.matchJobId);
    } catch (error) {
      setMatchJobStatus("failed");
      setErrorMessage(error instanceof Error ? error.message : "매칭 시작 실패");
    } finally {
      setIsBusyMatch(false);
    }
  }

  async function handleReviewAction(stepIndex: number, action: "approve" | "choose" | "reject", chosenIndex?: number) {
    if (!currentMatchId) return;
    try {
      await postJson(`/api/matches/${currentMatchId}/steps/${stepIndex}`, { action, chosenIndex });
      await loadMatchSetDetail(currentMatchId);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "검토 저장 실패");
    }
  }

  async function handleCancelRun() {
    const startedAt = Date.now();
    setBusyAction("stop-run");
    try {
      await Promise.all(
        Object.values(runIds).map((id) => postJson(`/api/runs/${id}/cancel`, {}).catch(() => undefined)),
      );
    } finally {
      await holdBusy(startedAt);
      setBusyAction(null);
    }
  }

  const successCount = cases.filter((item) => item.kind === "success").length;
  const failureCount = cases.filter((item) => item.kind === "failure").length;
  const documentValues = Object.fromEntries(cases.map((testCase) => [testCase.id, mergedValues(testCase)]));

  function controlLabel(input: TcInput): string {
    if (!input.control || input.control === "text") return "";
    return ` (${input.control})`;
  }

  function locatorSource(input: TcInput): { strategy: LocatorStrategy; value: string; source: string } | null {
    if (!input.selector) return null;
    const strategy: LocatorStrategy = (input.selectorStrategy as LocatorStrategy | undefined) ?? "css";
    const source = input.selectorStrategy && input.selectorStrategy !== "css"
      ? "매칭 결과"
      : "셀렉터 피커";
    return { strategy, value: input.selector, source };
  }

  function inputLine(testCase: TestCase, input: TcInput): string {
    if (testCase.kind === "failure") {
      const warning = testCase.expectedText;
      const isEmptyWarning =
        !/형식|올바른|규칙|자리|최소|최대|이상|이하|패턴|숫자|영문/iu.test(warning) &&
        /입력해\s*(주세요|요)|입력하세|필수|비어|공백|누락/iu.test(warning);
      if (isEmptyWarning) return "없음(비움)";
      return input.value || "없음";
    }
    const typed = documentValues[testCase.id]?.[input.target]?.trim() ?? "";
    if (ACCOUNT_PASSWORD.test(input.target)) return typed ? "입력됨" : "서버 환경변수 사용";
    if (typed) return typed;
    if (isAccountField(input.target)) return "서버 환경변수 사용";
    return "실행 시 입력";
  }

  return (
    <main className="mx-auto w-full max-w-[1600px] space-y-4 bg-slate-950 px-4 py-8 text-slate-100">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">TestFlow</h1>
        <p className="text-sm text-slate-400">
          텍스트 기획서는 gemma2:9b, 피그마는 화면 스크린샷을 qwen2.5vl:7b가 보고 설명과 맞춥니다.
        </p>
      </header>
      <div className="flex items-start gap-4">
        <div className="sticky top-4 w-110 shrink-0">
          <LogPanel events={logs} />
        </div>
        <div className="min-w-0 flex-1 space-y-4">

      <section className="space-y-3 rounded-xl border border-slate-700 bg-slate-900/70 p-4">
        <h2 className="text-sm font-medium">기획서 분석</h2>

        {serverConfig && (
          <div className="flex gap-3 text-xs">
            <span
              className={serverConfig.hasFigmaToken ? "text-emerald-400" : "text-amber-400"}
            >
              {serverConfig.hasFigmaToken ? "✓ Figma 토큰 설정됨" : "⚠ FIGMA_TOKEN 환경변수 미설정"}
            </span>
            <span
              className={serverConfig.hasTestAccount ? "text-emerald-400" : "text-amber-400"}
            >
              {serverConfig.hasTestAccount ? "✓ 테스트 계정 설정됨" : "⚠ TEST_ACCOUNT_* 환경변수 미설정"}
            </span>
          </div>
        )}

        <div className="flex items-end gap-3">
          <label className="min-w-0 flex-1 space-y-1 text-xs text-slate-400">
            Figma URL
            <input
              className="block w-full rounded-md border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-slate-100"
              value={figmaUrl}
              autoComplete="off"
              placeholder="https://www.figma.com/design/..."
              onChange={(event) => setFigmaUrl(event.target.value)}
            />
          </label>
        </div>
        <div className="flex gap-2">
          <ActionButton
            label="피그마 분석"
            variant="primary"
            busy={busyAction === "analyze"}
            busyLabel="피그마 분석 중…"
            disabled={isWorking || !figmaUrl || !serverConfig?.hasFigmaToken}
            onClick={() => void handleAnalyze()}
          />
          <ActionButton
            label="중지"
            variant="danger"
            busy={busyAction === "cancel"}
            busyLabel="중지 중…"
            disabled={!jobId}
            onClick={() => void handleCancelAnalysis()}
          />
          <ActionButton
            label="결과 새로고침"
            variant="ghost"
            busy={busyAction === "refresh"}
            busyLabel="새로고침 중…"
            disabled={!jobId}
            onClick={() => void handleRefreshJob()}
          />
        </div>
        <label className="block space-y-1 text-xs text-slate-400">
          텍스트 기획서
          <textarea
            className="block h-28 w-full rounded-md border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-slate-100"
            value={specText}
            placeholder="화면 ID가 있으면 화면별로 나눕니다. 없으면 전체를 한 화면으로 봅니다."
            onChange={(event) => setSpecText(event.target.value)}
          />
        </label>
        <ActionButton
          label="텍스트 분석"
          variant="sky"
          busy={busyAction === "text"}
          busyLabel="텍스트 분석 중…"
          disabled={isWorking || !specText.trim()}
          onClick={() => void handleAnalyzeText()}
        />
        {status ? (
          <p className="text-xs text-slate-400">
            상태 {status} · 화면 {screenCount} · 성공 경로 {successCount} · 실패 대응 {failureCount}
          </p>
        ) : null}
      </section>

      <section className="space-y-3 rounded-xl border border-slate-700 bg-slate-900/70 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">저장된 TC 파일</h2>
          <button
            type="button"
            className="text-xs text-sky-400 hover:text-sky-300"
            onClick={() => {
              setShowTcFiles((prev) => !prev);
              if (!showTcFiles) void loadTcFileList();
            }}
          >
            {showTcFiles ? "접기" : "목록 보기"}
          </button>
        </div>
        {showTcFiles && (
          tcFiles.length === 0 ? (
            <p className="text-xs text-slate-500">저장된 TC 파일이 없습니다.</p>
          ) : (
            <ul className="space-y-1">
              {tcFiles.map((file) => (
                <li key={file.fileId} className="flex items-center justify-between gap-3 rounded border border-slate-700 px-3 py-2 text-xs">
                  <span className="text-slate-300">
                    {file.label ?? file.fileId}
                    <span className="ml-2 text-slate-500">TC {file.caseCount}개 · {new Date(file.savedAt).toLocaleString("ko-KR")}</span>
                  </span>
                  <button
                    type="button"
                    className="shrink-0 rounded bg-sky-700/40 px-2 py-0.5 text-sky-300 hover:bg-sky-700/60"
                    onClick={() => void handleLoadTcFile(file.fileId)}
                  >
                    불러오기
                  </button>
                </li>
              ))}
            </ul>
          )
        )}
      </section>

      {errorMessage ? <p className="text-sm text-rose-300">{errorMessage}</p> : null}

      {/* Phase 2: 화면 탐색 */}
      <section className="space-y-3 rounded-xl border border-slate-700 bg-slate-900/70 p-4">
        <h2 className="text-sm font-medium">화면 탐색 <span className="ml-1 rounded bg-sky-900/60 px-1.5 py-0.5 text-[10px] text-sky-300">Phase 2</span></h2>
        <p className="text-xs text-slate-400">
          시작 URL을 열고 LLM 없이 접근성 트리와 대화형 요소를 수집해 요소 맵을 만듭니다. 서버의 테스트 계정으로 자동 로그인합니다.
        </p>
        <div className="flex items-end gap-3">
          <label className="min-w-0 flex-1 space-y-1 text-xs text-slate-400">
            탐색할 URL
            <input
              className="block w-full rounded-md border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-slate-100"
              value={exploreUrl}
              autoComplete="off"
              placeholder="https://앱-주소"
              onChange={(e) => setExploreUrl(e.target.value)}
            />
          </label>
          <ActionButton
            label="탐색 시작"
            variant="sky"
            busy={isBusyExplore}
            busyLabel="탐색 시작 중…"
            disabled={isBusyExplore || exploreStatus === "running" || !exploreUrl || !/^https?:\/\//iu.test(exploreUrl)}
            onClick={() => void handleStartExplore()}
          />
        </div>
        {exploreStatus ? (
          <p className="text-xs text-slate-400">
            상태:{" "}
            <span className={exploreStatus === "completed" ? "text-emerald-400" : exploreStatus === "failed" ? "text-rose-400" : "text-sky-400"}>
              {exploreStatus}
            </span>
          </p>
        ) : null}
        {exploreLogs.length > 0 && (
          <ul className="max-h-32 overflow-y-auto space-y-0.5 rounded border border-slate-800 bg-slate-950 px-2 py-1.5">
            {exploreLogs.map((log, i) => (
              <li key={i} className="text-[11px] text-slate-400">{log.message}</li>
            ))}
          </ul>
        )}
        {selectedMap && (
          <details open className="rounded border border-slate-700 bg-slate-950/60 p-2 text-xs">
            <summary className="cursor-pointer font-medium text-slate-300">
              요소 맵: {selectedMap.screenTitle || selectedMap.url} ({selectedMap.elements.length}개)
            </summary>
            <ul className="mt-2 space-y-1">
              {selectedMap.elements.map((el: ElementEntry, i: number) => (
                <li key={i} className="rounded border border-slate-800 px-2 py-1">
                  <span className="font-medium text-slate-200">{el.label || "(레이블 없음)"}</span>
                  <span className="ml-2 rounded bg-slate-800 px-1 py-0.5 text-slate-400">{el.controlKind}</span>
                  {el.dropdownOptionContainer && (
                    <span className="ml-2 text-slate-500">옵션: {el.dropdownOptionContainer}</span>
                  )}
                  {el.pinnedSelector && (
                    <span className="ml-2 rounded bg-purple-900/40 px-1 py-0.5 text-purple-300">📌 {el.pinnedSelector}</span>
                  )}
                  <ol className="mt-1 list-decimal pl-4 text-slate-500">
                    {el.locators.slice(0, 3).map((loc: LocatorCandidate, j: number) => (
                      <li key={j}><span className="text-slate-600">[{loc.strategy}]</span> {loc.value}</li>
                    ))}
                  </ol>
                </li>
              ))}
            </ul>
            {selectedMap.queryApiUrls.length > 0 && (
              <div className="mt-2 border-t border-slate-800 pt-2">
                <p className="font-medium text-slate-400 mb-1">관찰된 조회 API:</p>
                <ul className="space-y-0.5">
                  {selectedMap.queryApiUrls.map((apiUrl: string, i: number) => (
                    <li key={i} className="text-slate-500 truncate">{apiUrl}</li>
                  ))}
                </ul>
              </div>
            )}
          </details>
        )}
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-500">저장된 요소 맵</span>
          <button
            type="button"
            className="text-xs text-sky-400 hover:text-sky-300"
            onClick={() => {
              setShowElementMaps((prev) => !prev);
              if (!showElementMaps) void loadElementMapList();
            }}
          >
            {showElementMaps ? "접기" : "목록 보기"}
          </button>
        </div>
        {showElementMaps && (
          elementMaps.length === 0 ? (
            <p className="text-xs text-slate-500">저장된 요소 맵이 없습니다.</p>
          ) : (
            <ul className="space-y-1">
              {elementMaps.map((m) => (
                <li key={m.mapId} className="flex items-center justify-between gap-3 rounded border border-slate-700 px-3 py-2 text-xs">
                  <span className="truncate text-slate-300">
                    {m.screenTitle || m.url}
                    <span className="ml-2 text-slate-500">{m.elementCount}개 · {new Date(m.exploredAt).toLocaleString("ko-KR")}</span>
                  </span>
                  <button
                    type="button"
                    className="shrink-0 rounded bg-sky-700/40 px-2 py-0.5 text-sky-300 hover:bg-sky-700/60"
                    onClick={() => void loadElementMapDetail(m.mapId)}
                  >
                    보기
                  </button>
                </li>
              ))}
            </ul>
          )
        )}
      </section>

      {/* Phase 3: 매칭 + 검토 */}
      <section className="space-y-3 rounded-xl border border-slate-700 bg-slate-900/70 p-4">
        <h2 className="text-sm font-medium">TC-요소 매칭 <span className="ml-1 rounded bg-purple-900/60 px-1.5 py-0.5 text-[10px] text-purple-300">Phase 3</span></h2>
        <p className="text-xs text-slate-400">
          TC 입력 레이블과 요소 맵을 매칭합니다. 규칙 매칭 → 모델 보조(gemma2:9b) → 사람 검토 순서로 진행합니다.
        </p>

        {elementMaps.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs text-slate-400">요소 맵을 선택해 매칭 시작:</p>
            <div className="flex flex-wrap gap-2">
              {elementMaps.slice(0, 5).map((m: ElementMapMeta) => (
                <button
                  key={m.mapId}
                  type="button"
                  disabled={isBusyMatch || matchJobStatus === "running" || !jobId}
                  className="rounded border border-slate-600 bg-slate-800 px-2 py-1 text-xs text-slate-300 hover:bg-slate-700 disabled:opacity-50"
                  onClick={() => void handleStartMatch(m.mapId)}
                >
                  {m.screenTitle || m.url} ({m.elementCount}개)
                </button>
              ))}
            </div>
          </div>
        )}

        {matchJobStatus ? (
          <p className="text-xs text-slate-400">
            매칭 상태:{" "}
            <span className={matchJobStatus === "completed" ? "text-emerald-400" : matchJobStatus === "failed" ? "text-rose-400" : "text-amber-400"}>
              {matchJobStatus}
            </span>
            {currentMatchId && <span className="ml-2 text-slate-500">(matchId: {currentMatchId.slice(0, 12)}…)</span>}
          </p>
        ) : null}

        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-500">저장된 매칭 결과</span>
          <button
            type="button"
            className="text-xs text-sky-400 hover:text-sky-300"
            onClick={() => {
              setShowMatchList((p) => !p);
              if (!showMatchList) void loadMatchList();
            }}
          >
            {showMatchList ? "접기" : "목록 보기"}
          </button>
        </div>
        {showMatchList && (
          matchList.length === 0 ? (
            <p className="text-xs text-slate-500">저장된 매칭 결과가 없습니다.</p>
          ) : (
            <ul className="space-y-1">
              {matchList.map((m: MatchSetMeta) => (
                <li key={m.matchId} className="flex items-center justify-between gap-3 rounded border border-slate-700 px-3 py-2 text-xs">
                  <span className="text-slate-300">
                    매칭 {new Date(m.createdAt).toLocaleString("ko-KR")}
                    <span className="ml-2 text-slate-500">전체 {m.totalSteps}개 · 검토 {m.reviewCount}개 · 완료 {m.matchedCount}개</span>
                  </span>
                  <button
                    type="button"
                    className="shrink-0 rounded bg-purple-700/40 px-2 py-0.5 text-purple-300 hover:bg-purple-700/60"
                    onClick={() => void loadMatchSetDetail(m.matchId)}
                  >
                    검토
                  </button>
                </li>
              ))}
            </ul>
          )
        )}

        {matchSet && (
          <div className="space-y-3 rounded border border-slate-700 bg-slate-950/60 p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-slate-300">매칭 검토</p>
              <span className="text-[10px] text-slate-500">
                검토 필요: {matchSet.steps.filter((s) => s.status === "review").length} / 전체 {matchSet.steps.length}
              </span>
            </div>
            <ul className="space-y-2 max-h-96 overflow-y-auto">
              {matchSet.steps.map((step, stepIdx: number) => (
                <li
                  key={`${step.tcId}-${step.stepLabel}-${stepIdx}`}
                  className={`rounded border p-2.5 text-xs ${
                    step.status === "matched" || step.status === "approved"
                      ? "border-emerald-800/60 bg-emerald-950/30"
                      : step.status === "rejected"
                        ? "border-rose-800/60 bg-rose-950/30"
                        : "border-amber-800/60 bg-amber-950/30"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="font-medium text-slate-200">"{step.stepLabel}"</span>
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                      step.status === "matched" || step.status === "approved"
                        ? "bg-emerald-900/50 text-emerald-300"
                        : step.status === "rejected"
                          ? "bg-rose-900/50 text-rose-300"
                          : "bg-amber-900/50 text-amber-300"
                    }`}>{step.status}</span>
                  </div>
                  {step.candidates.length === 0 ? (
                    <p className="text-slate-500">후보 없음</p>
                  ) : (
                    <div className="space-y-1">
                      {step.candidates.slice(0, 5).map((c, ci: number) => (
                        <label key={ci} className="flex items-start gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name={`match-step-${stepIdx}`}
                            checked={step.chosenIndex === ci}
                            onChange={() => void handleReviewAction(stepIdx, "choose", ci)}
                            className="mt-0.5 accent-purple-400"
                          />
                          <span className="text-slate-300">
                            <span className="font-medium">{c.elementLabel}</span>
                            <span className="ml-1 text-slate-500">({c.controlKind})</span>
                            <span className="ml-2 text-slate-600">[{c.method} {Math.round(c.confidence * 100)}%]</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                  {(step.status === "review" || step.status === "matched") && (
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        disabled={step.chosenIndex < 0}
                        className="rounded bg-emerald-700/40 px-2 py-0.5 text-emerald-300 hover:bg-emerald-700/60 disabled:opacity-40"
                        onClick={() => void handleReviewAction(stepIdx, "approve")}
                      >
                        승인
                      </button>
                      <button
                        type="button"
                        className="rounded bg-rose-700/40 px-2 py-0.5 text-rose-300 hover:bg-rose-700/60"
                        onClick={() => void handleReviewAction(stepIdx, "reject")}
                      >
                        거부
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="space-y-3 rounded-xl border border-slate-700 bg-slate-900/70 p-4">
        <h2 className="text-sm font-medium">실행</h2>
        <p className="text-xs text-slate-400">
          로그인이 필요한 테스트는 서버의 <code className="text-slate-300">TEST_ACCOUNT_EMAIL</code> /
          <code className="text-slate-300"> TEST_ACCOUNT_PASSWORD</code> 환경변수로 설정한 계정을 사용합니다.
          시작 주소는 로그인 페이지가 아니라 검사할 화면 주소로 넣으세요.
        </p>
        {cases.length > 0 ? <TcDocument cases={cases} values={documentValues} /> : null}
        <input
          className="w-full rounded-md border border-slate-600 bg-slate-950 px-3 py-2 text-sm"
          value={startUrl}
          onChange={(event) => setStartUrl(event.target.value)}
          placeholder="https://검사할-화면-주소"
        />
        <ActionButton
          label="실행 중지"
          variant="danger"
          busy={busyAction === "stop-run"}
          busyLabel="실행 중지 중…"
          disabled={Object.keys(runIds).length === 0}
          onClick={() => void handleCancelRun()}
        />
        <ul className="space-y-3">
          {cases.map((testCase) => (
            <li key={testCase.id} className="space-y-2 rounded-md border border-slate-700 p-3">
              <p className="text-sm">
                <span className="mr-2 text-xs text-slate-400">
                  {testCase.kind === "success" ? "성공 경로" : "실패 대응"}
                </span>
                {testCase.title}
                <span className={`ml-2 text-xs ${statusClass(caseState[testCase.id] ?? "대기")}`}>
                  {caseState[testCase.id] ?? "대기"}
                </span>
              </p>
              <dl className="space-y-1 text-xs text-slate-300">
                <div>
                  <dt className="inline text-slate-500">화면 </dt>
                  <dd className="inline">{testCase.screenName}</dd>
                </div>
                {testCase.buttonName ? (
                  <div>
                    <dt className="inline text-slate-500">버튼 </dt>
                    <dd className="inline">{testCase.buttonName}</dd>
                  </div>
                ) : null}
                <div>
                  <dt className="text-slate-500">입력</dt>
                  <dd>
                    {testCase.inputs.length === 0 ? (
                      <span className="text-slate-500">없음</span>
                    ) : (
                      <ul>
                        {testCase.inputs.map((input) => (
                          <li key={input.target}>
                            {input.target}
                            {controlLabel(input)}: {inputLine(testCase, input)}
                          </li>
                        ))}
                      </ul>
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">기대 결과</dt>
                  <dd className="whitespace-pre-wrap">{testCase.expectedText}</dd>
                </div>
              </dl>
              {testCase.kind === "success"
                ? testCase.inputs.filter((input) => !isAccountField(input.target)).map((input) => (
                    <label key={input.target} className="block space-y-1 text-xs text-slate-400">
                      <span className="flex flex-wrap items-center justify-between gap-2">
                        <span>
                          {input.target}
                          {controlLabel(input)}
                          {input.options?.length ? ` · ${input.options.join(" / ")}` : ""}
                        </span>
                        <button
                          type="button"
                          disabled={Boolean(inspectingFieldKey)}
                          onClick={() => void handlePickSelector(testCase.id, input.target)}
                          className="inline-flex shrink-0 items-center gap-1 rounded bg-purple-600/30 px-2 py-0.5 text-[11px] font-medium text-purple-300 border border-purple-500/50 hover:bg-purple-600/50 disabled:opacity-50 transition-colors cursor-pointer"
                        >
                          {inspectingFieldKey === inspectFieldKey(testCase.id, input.target)
                            ? "브라우저에서 선택 후 적용하기…"
                            : "셀렉터 이름 가져오기"}
                        </button>
                      </span>
                      <input
                        type="text"
                        placeholder="CSS 셀렉터 (비우면 라벨로 자동 탐색)"
                        className="block w-full rounded border border-slate-700/80 bg-slate-950/80 px-2 py-1 text-[11px] text-slate-300 placeholder-slate-600 focus:border-purple-500/60 focus:outline-none"
                        value={input.selector ?? ""}
                        onChange={(event) =>
                          updateInputField(testCase.id, input.target, {
                            selector: event.target.value,
                            selectorStrategy: undefined,
                          })
                        }
                      />
                      {/* 실행 계획 투명성 */}
                      {(() => {
                        const loc = locatorSource(input);
                        if (!loc) return (
                          <p className="text-[10px] text-slate-600 mt-0.5">
                            실행 시: 레이블 "{input.target}" 로 자동 탐색
                          </p>
                        );
                        const isHashed = isHashedCssModuleClient(loc.value);
                        return (
                          <div className="mt-1 space-y-0.5">
                            {isHashed && (
                              <p className="text-[10px] text-amber-400">
                                ⚠ CSS 모듈 해시 클래스 감지 — 빌드마다 셀렉터가 바뀔 수 있습니다. 셀렉터를 다시 고르거나 탐색을 다시 실행하세요.
                              </p>
                            )}
                            <p className="text-[10px] text-slate-500">
                              로케이터: <span className="text-slate-400">[{loc.strategy}]</span> {loc.value.slice(0, 60)}{loc.value.length > 60 ? "…" : ""}
                              <span className="ml-2 text-slate-600">({loc.source})</span>
                            </p>
                            <details className="mt-0.5">
                              <summary className="cursor-pointer text-[10px] text-slate-600 hover:text-slate-400">코드 스니펫 보기</summary>
                              <pre className="mt-1 overflow-x-auto rounded bg-slate-900 px-2 py-1 text-[10px] text-slate-300 select-all whitespace-pre-wrap">
                                {locatorCodeSnippet(loc.strategy, loc.value, input.control)}
                              </pre>
                            </details>
                          </div>
                        );
                      })()}
                      {input.options && input.options.length > 0 ? (
                        <select
                          className="block w-full rounded-md border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                          value={
                            values[testCase.id]?.[input.target] ??
                            input.value ??
                            input.options[0] ??
                            ""
                          }
                          onChange={(event) => {
                            const next = event.target.value;
                            setValues((current) => ({
                              ...current,
                              [testCase.id]: {
                                ...current[testCase.id],
                                [input.target]: next,
                              },
                            }));
                          }}
                        >
                          {input.options.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      ) : input.control === "date_range" ? (
                        <input
                          type="text"
                          placeholder="2026-10-01,2026-11-24 또는 2026.10.01 ~ 2026.11.24"
                          name={`tc-value-${testCase.id}-${input.target}`}
                          autoComplete="off"
                          autoCapitalize="off"
                          spellCheck={false}
                          data-1p-ignore="true"
                          data-lpignore="true"
                          readOnly={editingInputKey !== `${testCase.id}:${input.target}`}
                          onFocus={() => setEditingInputKey(`${testCase.id}:${input.target}`)}
                          className="block w-full rounded-md border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                          value={values[testCase.id]?.[input.target] ?? input.value ?? ""}
                          onChange={(event) => {
                            const next = event.target.value;
                            setValues((current) => ({
                              ...current,
                              [testCase.id]: {
                                ...current[testCase.id],
                                [input.target]: next,
                              },
                            }));
                          }}
                        />
                      ) : (
                        <input
                          type={
                            input.control === "date"
                              ? "date"
                              : input.control === "password" || /비밀번호/.test(input.target)
                                ? "password"
                                : "text"
                          }
                          name={`tc-value-${testCase.id}-${input.target}`}
                          autoComplete="off"
                          autoCapitalize="off"
                          spellCheck={false}
                          data-1p-ignore="true"
                          data-lpignore="true"
                          readOnly={editingInputKey !== `${testCase.id}:${input.target}`}
                          onFocus={() => setEditingInputKey(`${testCase.id}:${input.target}`)}
                          className="block w-full rounded-md border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                          value={values[testCase.id]?.[input.target] ?? input.value ?? ""}
                          onChange={(event) => {
                            const next = event.target.value;
                            setValues((current) => ({
                              ...current,
                              [testCase.id]: {
                                ...current[testCase.id],
                                [input.target]: next,
                              },
                            }));
                          }}
                        />
                      )}
                    </label>
                  ))
                : null}
              <details className="mt-2 rounded-md border border-slate-700/80 bg-slate-900/60 p-2.5 text-xs text-slate-300">
                <summary className="cursor-pointer font-medium text-slate-400 hover:text-slate-200 select-none">
                  ⚙️ 실행 및 검증 상세 설정 (API 대기 / 표 열 검증 / 드롭다운 컨테이너)
                </summary>
                <div className="mt-3 space-y-3 pt-2 border-t border-slate-800">
                  <label className="block space-y-1">
                    <span className="text-slate-400">조회 완료 대기 API 경로 (선택)</span>
                    <input
                      type="text"
                      placeholder="예: /api/users 또는 users/search (비워두면 네트워크 idle 대기)"
                      className="block w-full rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-100 placeholder-slate-600 focus:border-sky-500 focus:outline-none"
                      value={testCase.apiPath ?? ""}
                      onChange={(e) => updateTestCase(testCase.id, { apiPath: e.target.value })}
                    />
                  </label>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">옵션 탐색 컨테이너 속성 / 셀렉터 (선택)</span>
                      <button
                        type="button"
                        disabled={Boolean(inspectingFieldKey)}
                        onClick={() => void handlePickSelector(testCase.id, "__option_container__")}
                        className="inline-flex items-center gap-1 rounded bg-purple-600/30 px-2 py-0.5 text-[11px] font-medium text-purple-300 border border-purple-500/50 hover:bg-purple-600/50 disabled:opacity-50 transition-colors cursor-pointer"
                      >
                        {inspectingFieldKey === inspectFieldKey(testCase.id, "__option_container__")
                          ? "브라우저에서 선택 후 적용하기…"
                          : "셀렉터 이름 가져오기"}
                      </button>
                    </div>
                    <input
                      type="text"
                      placeholder="예: [role='listbox'], .custom-dropdown, [data-floating-ui-portal]"
                      className="block w-full rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-100 placeholder-slate-600 focus:border-sky-500 focus:outline-none"
                      value={testCase.optionContainerSelector ?? ""}
                      onChange={(e) => updateTestCase(testCase.id, { optionContainerSelector: e.target.value })}
                    />
                  </div>

                  <div className="space-y-2 rounded border border-slate-800 bg-slate-950/60 p-2">
                    <label className="flex items-center gap-2 cursor-pointer text-slate-300 font-medium">
                      <input
                        type="checkbox"
                        className="rounded border-slate-600 bg-slate-900 text-sky-500 focus:ring-0"
                        checked={Boolean(testCase.assert)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            updateTestCase(testCase.id, {
                              assert: {
                                type: "table",
                                column: "",
                                every: "equals",
                                value: "",
                                minRows: 1,
                              },
                            });
                          } else {
                            updateTestCase(testCase.id, { assert: undefined });
                          }
                        }}
                      />
                      <span>조회 결과 표(Table) 열 일치 검증 활성화</span>
                    </label>

                    {testCase.assert ? (
                      <div className="grid grid-cols-2 gap-2 pt-1 pl-5">
                        <label className="space-y-1">
                          <span className="text-slate-400">검증할 열(Column) 이름</span>
                          <input
                            type="text"
                            placeholder="예: 상태, 성별"
                            className="block w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100 placeholder-slate-600 focus:border-sky-500 focus:outline-none"
                            value={testCase.assert.column}
                            onChange={(e) =>
                              updateTestCase(testCase.id, {
                                assert: { ...testCase.assert!, column: e.target.value },
                              })
                            }
                          />
                        </label>
                        <label className="space-y-1">
                          <span className="text-slate-400">일치 조건</span>
                          <select
                            className="block w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100 focus:border-sky-500 focus:outline-none"
                            value={testCase.assert.every}
                            onChange={(e) =>
                              updateTestCase(testCase.id, {
                                assert: {
                                  ...testCase.assert!,
                                  every: e.target.value === "contains" ? "contains" : "equals",
                                },
                              })
                            }
                          >
                            <option value="equals">모든 행 완전 일치 (equals)</option>
                            <option value="contains">모든 행 부분 일치 (contains)</option>
                          </select>
                        </label>
                        <label className="space-y-1">
                          <span className="text-slate-400">기대하는 셀 값</span>
                          <input
                            type="text"
                            placeholder="예: 완료, 남성, 30"
                            className="block w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100 placeholder-slate-600 focus:border-sky-500 focus:outline-none"
                            value={testCase.assert.value}
                            onChange={(e) =>
                              updateTestCase(testCase.id, {
                                assert: { ...testCase.assert!, value: e.target.value },
                              })
                            }
                          />
                        </label>
                        <label className="space-y-1">
                          <span className="text-slate-400">최소 행 개수 (minRows)</span>
                          <input
                            type="number"
                            min={1}
                            className="block w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100 focus:border-sky-500 focus:outline-none"
                            value={testCase.assert.minRows ?? 1}
                            onChange={(e) =>
                              updateTestCase(testCase.id, {
                                assert: {
                                  ...testCase.assert!,
                                  minRows: Math.max(1, parseInt(e.target.value, 10) || 1),
                                },
                              })
                            }
                          />
                        </label>
                      </div>
                    ) : null}
                  </div>
                </div>
              </details>
              <PlaywrightSpecPanel
                spec={generatePlaywrightSpec(testCase, {
                  startUrl,
                  values: documentValues[testCase.id],
                })}
                fileName={playwrightSpecFileName(testCase.title)}
              />
              <ActionButton
                label="이 TC 실행"
                variant="sky"
                busy={runningCaseId === testCase.id}
                busyLabel="실행 시작 중…"
                disabled={Boolean(runningCaseId)}
                onClick={() => void handleRun(testCase)}
              />
            </li>
          ))}
        </ul>
      </section>
        </div>
      </div>
    </main>
  );
}
