import { useCallback, useEffect, useRef, useState } from "react";
import { DocTcPanel } from "./components/DocTcPanel";
import { RunHistoryPanel } from "./components/RunHistoryPanel";
import { RunPanel } from "./components/RunPanel";
import { ScenarioBuilder } from "./components/ScenarioBuilder";
import { ScenarioList } from "./components/ScenarioList";
import {
  createStep,
  type EditorMode,
  normalizeStepFromApi,
  type Scenario,
  type ScenarioSummary,
  type SmartTC,
  type Step,
} from "./types";

function scenarioNameFromUrl(url: string): string {
  try {
    const host = new URL(url).hostname;
    return host ? `테스트: ${host}` : "새 시나리오";
  } catch {
    return "새 시나리오";
  }
}

type RunStatus = "queued" | "running" | "passed" | "failed" | "error" | "idle";

interface RunSummary {
  id: string;
  status: RunStatus;
  exitCode: number | null;
  errorMessage?: string;
  artifacts?: {
    reportIndex: string;
    testResultsDir: string;
    screenshotUrls?: string[];
    videoUrls?: string[];
  };
}

interface RecordingStopBody {
  script?: string;
  steps?: Record<string, unknown>[];
  smartTc?: SmartTC[];
  parseWarnings?: string[];
  sessionKind?: "codegen" | "hosted";
  sessionArtifacts?: { videoUrl: string };
  error?: string;
}

/** 시나리오 전환 시에도 유지되는 실행·녹화 패널 UI (시나리오 ID별) */
interface ScenarioRunUiState {
  recordUrl: string;
  lastRecording: {
    sessionKind: "codegen" | "hosted";
    artifacts: { videoUrl: string };
  } | null;
  smartTc: SmartTC[] | null;
  runId: string | null;
  status: RunStatus;
  log: string;
  summary: RunSummary | null;
  isStarting: boolean;
}

function createDefaultRunUi(): ScenarioRunUiState {
  return {
    recordUrl: "https://example.com",
    lastRecording: null,
    smartTc: null,
    runId: null,
    status: "idle",
    log: "",
    summary: null,
    isStarting: false,
  };
}

function wsUrlForRun(runId: string): string {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/ws/runs/${runId}`;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok)
    throw new Error(`요청 실패: ${res.status} ${res.statusText}`);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export default function App() {
  const [list, setList] = useState<ScenarioSummary[]>([]);
  const [draft, setDraft] = useState<Scenario | null>(null);
  const [editorTab, setEditorTab] = useState<EditorMode>("builder");
  const [saveBusy, setSaveBusy] = useState(false);

  const [runUiByScenario, setRunUiByScenario] = useState<
    Record<string, ScenarioRunUiState>
  >({});
  /** 빈 화면에서 시나리오 생성 시 사용할 테스트 시작 URL */
  const [quickStartUrl, setQuickStartUrl] = useState("");
  /** 동시에 하나의 녹화 세션만 — 어느 시나리오에서 시작했는지 추적 */
  const [recordingSessionId, setRecordingSessionId] = useState<string | null>(
    null,
  );
  const [recordingForScenarioId, setRecordingForScenarioId] = useState<
    string | null
  >(null);
  /** WebSocket이 붙을 실행 ID (백그라운드 실행도 이 ID로 로그를 해당 시나리오에 반영) */
  const [wsRunId, setWsRunId] = useState<string | null>(null);
  const runTargetScenarioRef = useRef<string | null>(null);
  /** Increment to refetch run history list */
  const [historyRefreshTick, setHistoryRefreshTick] = useState(0);
  const logEndRef = useRef<HTMLDivElement>(null);
  const lastLogRef = useRef("");

  function patchRunUi(
    scenarioId: string,
    patch: Partial<ScenarioRunUiState>,
  ): void {
    setRunUiByScenario((prev) => {
      const base = prev[scenarioId] ?? createDefaultRunUi();
      return { ...prev, [scenarioId]: { ...base, ...patch } };
    });
  }

  function appendLog(scenarioId: string, chunk: string): void {
    setRunUiByScenario((prev) => {
      const base = prev[scenarioId] ?? createDefaultRunUi();
      return {
        ...prev,
        [scenarioId]: { ...base, log: base.log + chunk },
      };
    });
  }

  const scrollLog = useCallback(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const activeRunUi =
    draft != null
      ? (runUiByScenario[draft.id] ?? createDefaultRunUi())
      : createDefaultRunUi();

  useEffect(() => {
    if (!draft) return;
    const nextLog = activeRunUi.log;
    const prevLog = lastLogRef.current;
    if (nextLog.length > prevLog.length) {
      scrollLog();
    }
    lastLogRef.current = nextLog;
  }, [draft?.id, activeRunUi.log, scrollLog]);

  async function refreshList(): Promise<void> {
    const rows = await fetchJson<ScenarioSummary[]>("/api/scenarios");
    setList(rows);
  }

  useEffect(() => {
    void refreshList().catch(() => setList([]));
  }, []);

  async function refreshSummaryForScenario(
    runId: string,
    scenarioId: string,
  ): Promise<void> {
    const res = await fetch(`/api/runs/${runId}`);
    if (!res.ok) return;
    const sum = (await res.json()) as RunSummary;
    patchRunUi(scenarioId, { summary: sum });
  }

  useEffect(() => {
    if (!wsRunId) return;
    const socket = new WebSocket(wsUrlForRun(wsRunId));
    socket.addEventListener("message", (event) => {
      try {
        const data = JSON.parse(event.data as string) as {
          type?: string;
          chunk?: string;
          status?: RunStatus;
          log?: string;
        };
        const sid = runTargetScenarioRef.current;
        if (!sid) return;
        if (data.type === "snapshot") {
          const patch: Partial<ScenarioRunUiState> = {};
          if (data.status) patch.status = data.status;
          if (typeof data.log === "string") patch.log = data.log;
          if (Object.keys(patch).length > 0) patchRunUi(sid, patch);
          return;
        }
        if (data.type === "log" && typeof data.chunk === "string")
          appendLog(sid, data.chunk);
        if (data.type === "status" && data.status)
          patchRunUi(sid, { status: data.status });
        if (data.type === "complete") {
          if (data.status) patchRunUi(sid, { status: data.status });
          void refreshSummaryForScenario(wsRunId, sid);
          setHistoryRefreshTick((n) => n + 1);
          setWsRunId(null);
          runTargetScenarioRef.current = null;
        }
      } catch {
        /* 무시 */
      }
    });
    return () => socket.close();
  }, [wsRunId]);

  /** 실행 중에도 test-results에 쌓인 스크린샷을 주기적으로 반영 */
  useEffect(() => {
    if (!wsRunId) return;
    const sid = runTargetScenarioRef.current;
    if (!sid) return;
    const tick = (): void => {
      void refreshSummaryForScenario(wsRunId, sid);
    };
    const t = window.setInterval(tick, 4000);
    tick();
    return () => window.clearInterval(t);
  }, [wsRunId]);

  async function handleCreate(): Promise<void> {
    const nextNum = list.length + 1;
    const created = await fetchJson<Scenario>("/api/scenarios", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: `새 시나리오 ${nextNum}`, mode: "builder" }),
    });
    await refreshList();
    setDraft(created);
    setEditorTab(created.mode === "docTc" ? "docTc" : "builder");
  }

  async function handleRename(id: string, name: string): Promise<void> {
    const trimmed = name.trim();
    if (!trimmed) return;
    await fetch(`/api/scenarios/${id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: trimmed }),
    });
    await refreshList();
    if (draft?.id === id) setDraft((prev) => (prev ? { ...prev, name: trimmed } : prev));
  }

  /** URL이 있으면 첫 스텝으로 페이지 이동을 넣은 시나리오 생성 */
  async function handleCreateWithStartUrl(): Promise<void> {
    const url = quickStartUrl.trim();
    const steps =
      url.length > 0 ? [{ ...createStep("goto"), selectorValue: url }] : [];
    const name = url.length > 0 ? scenarioNameFromUrl(url) : "새 시나리오";
    const created = await fetchJson<Scenario>("/api/scenarios", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name,
        mode: "builder",
        ...(steps.length > 0 ? { steps } : {}),
      }),
    });
    await refreshList();
    setDraft(created);
    setEditorTab("builder");
    if (url.length > 0) patchRunUi(created.id, { recordUrl: url });
  }

  async function handleSelect(id: string): Promise<void> {
    const s = await fetchJson<Scenario>(`/api/scenarios/${id}`);
    let smartTcOut = s.smartTc;
    let persistDerived = false;
    if (
      (!smartTcOut || smartTcOut.length === 0) &&
      s.mode === "builder" &&
      s.steps.length > 0
    ) {
      const res = await fetch("/api/tc/convert", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ steps: s.steps }),
      });
      if (res.ok) {
        const data = (await res.json()) as { tc?: SmartTC[] };
        if (data.tc && data.tc.length > 0) {
          smartTcOut = data.tc;
          persistDerived = true;
        }
      }
    }
    setDraft({
      ...s,
      excelTestCases: s.excelTestCases ?? [],
      smartTc: smartTcOut,
    });
    setEditorTab(s.mode === "docTc" ? "docTc" : "builder");
    patchRunUi(id, { smartTc: smartTcOut ?? null });

    if (persistDerived && smartTcOut && smartTcOut.length > 0) {
      try {
        const updated = await fetchJson<Scenario>(`/api/scenarios/${id}`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ smartTc: smartTcOut }),
        });
        setDraft((d) =>
          d?.id === id
            ? { ...updated, excelTestCases: updated.excelTestCases ?? [] }
            : d,
        );
        patchRunUi(id, { smartTc: updated.smartTc ?? smartTcOut });
      } catch {
        /* 유지: 로컬 draft에만 복원된 smartTc */
      }
    }
  }

  async function handleSave(): Promise<void> {
    if (!draft) return;
    setSaveBusy(true);
    try {
      let smartTcOut = draft.smartTc ?? [];
      if (
        draft.mode === "builder" &&
        draft.steps.length > 0 &&
        smartTcOut.length === 0
      ) {
        const res = await fetch("/api/tc/convert", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ steps: draft.steps }),
        });
        if (res.ok) {
          const data = (await res.json()) as { tc?: SmartTC[] };
          if (data.tc && data.tc.length > 0) smartTcOut = data.tc;
        }
      }
      const updated = await fetchJson<Scenario>(`/api/scenarios/${draft.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: draft.name,
          mode: draft.mode,
          steps: draft.steps,
          rawScript: draft.rawScript,
          excelTestCases: draft.excelTestCases ?? [],
          smartTc: smartTcOut,
          sourceDocument: draft.sourceDocument,
          documentText: draft.documentText,
          requirementsExtract: draft.requirementsExtract ?? [],
          generatedDocTestCases: draft.generatedDocTestCases ?? [],
          docTcGeneration: draft.docTcGeneration,
        }),
      });
      setDraft({
        ...updated,
        excelTestCases: updated.excelTestCases ?? [],
        smartTc: updated.smartTc ?? smartTcOut,
      });
      if (draft.id)
        patchRunUi(draft.id, {
          smartTc: smartTcOut.length > 0 ? smartTcOut : null,
        });
      await refreshList();
    } finally {
      setSaveBusy(false);
    }
  }

  async function handleDelete(id: string): Promise<void> {
    if (!confirm("이 시나리오를 삭제할까요?")) return;
    await fetch(`/api/scenarios/${id}`, { method: "DELETE" });
    await refreshList();
    if (draft?.id === id) {
      setDraft(null);
      setEditorTab("builder");
    }
    setRunUiByScenario((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  function updateDraft(patch: Partial<Scenario>): void {
    if (!draft) return;
    setDraft({ ...draft, ...patch });
  }

  function setSteps(steps: Step[]): void {
    if (!draft) return;
    setDraft({ ...draft, steps });
  }

  function switchTab(tab: EditorMode): void {
    setEditorTab(tab);
    if (!draft) return;
    if (tab === "docTc") {
      setDraft({ ...draft, mode: "docTc" });
    } else if (draft.mode === "docTc") {
      const nextMode =
        draft.steps.length > 0
          ? "builder"
          : draft.rawScript.trim() !== ""
            ? "script"
            : "builder";
      setDraft({ ...draft, mode: nextMode });
    }
  }

  async function handleStartRecord(): Promise<void> {
    if (!draft) return;
    const ru = runUiByScenario[draft.id] ?? createDefaultRunUi();
    try {
      const res = await fetchJson<{ sessionId: string }>("/api/sessions/record", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          url: ru.recordUrl,
          mode: "hosted",
          scenarioId: draft.id,
        }),
      });
      setRecordingSessionId(res.sessionId);
      setRecordingForScenarioId(draft.id);
    } catch (e) {
      patchRunUi(draft.id, {
        log: `${ru.log}\n녹화 시작 실패: ${(e as Error).message}\n`,
      });
    }
  }

  async function handleStopRecord(): Promise<void> {
    if (!recordingSessionId) {
      setRecordingForScenarioId(null);
      return;
    }
    const targetSid = recordingForScenarioId;
    const baseUi =
      targetSid != null
        ? (runUiByScenario[targetSid] ?? createDefaultRunUi())
        : createDefaultRunUi();
    try {
      const res = await fetch(`/api/sessions/${recordingSessionId}/stop`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scenarioId: targetSid }),
      });
      const body = (await res.json()) as RecordingStopBody;
      if (!res.ok || body.error) {
        if (targetSid)
          patchRunUi(targetSid, {
            log: `${baseUi.log}\n녹화 종료 오류: ${body.error ?? res.statusText}\n`,
          });
      } else if (targetSid && draft?.id === targetSid) {
        const rawSteps = Array.isArray(body.steps) ? body.steps : [];
        const normalized = rawSteps.map((s) =>
          normalizeStepFromApi(s as Record<string, unknown>),
        );
        const script = typeof body.script === "string" ? body.script : "";
        const hasSteps = normalized.length > 0;
        const warns = body.parseWarnings ?? [];
        if (!hasSteps) {
          patchRunUi(targetSid, {
            log:
              baseUi.log +
              "\n녹화된 사용자 행위를 스텝으로 변환하지 못했습니다. 다시 녹화해 주세요.\n",
          });
          return;
        }
        const smartTcPersist = Array.isArray(body.smartTc) ? body.smartTc : [];
        let newLog = baseUi.log;
        if (warns.length > 0)
          newLog += `\n녹화 참고:\n${warns.map((w) => `  - ${w}`).join("\n")}\n`;
        try {
          const updated = await fetchJson<Scenario>(`/api/scenarios/${targetSid}`, {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              name: draft.name,
              mode: "builder",
              steps: normalized,
              rawScript: script,
              excelTestCases: draft.excelTestCases ?? [],
              smartTc: smartTcPersist,
            }),
          });
          setDraft({
            ...updated,
            excelTestCases: updated.excelTestCases ?? [],
            smartTc: updated.smartTc ?? smartTcPersist,
          });
          await refreshList();
        } catch {
          setDraft({
            ...draft,
            rawScript: script,
            mode: "builder",
            steps: normalized,
            excelTestCases: draft.excelTestCases ?? [],
            smartTc: smartTcPersist,
          });
        }
        setEditorTab("builder");
        const patch: Partial<ScenarioRunUiState> = { log: newLog };
        patch.smartTc =
          smartTcPersist.length > 0 ? smartTcPersist : null;
        if (body.sessionKind && body.sessionArtifacts?.videoUrl) {
          patch.lastRecording = {
            sessionKind: body.sessionKind,
            artifacts: body.sessionArtifacts,
          };
        }
        patchRunUi(targetSid, patch);
      } else if (targetSid) {
        patchRunUi(targetSid, {
          log:
            baseUi.log +
            "\n녹화 결과를 반영하려면 해당 시나리오를 목록에서 선택한 뒤 종료하세요.\n",
        });
      }
    } catch (e) {
      if (targetSid)
        patchRunUi(targetSid, {
          log: `${baseUi.log}\n${(e as Error).message}\n`,
        });
    } finally {
      setRecordingSessionId(null);
      setRecordingForScenarioId(null);
      setHistoryRefreshTick((n) => n + 1);
    }
  }

  const canRun =
    draft != null &&
    ((draft.excelTestCases?.length ?? 0) > 0 ||
      (draft.mode === "builder"
        ? draft.steps.length > 0
        : draft.rawScript.trim() !== ""));

  async function startRun(): Promise<void> {
    if (!draft) return;
    const sid = draft.id;
    const ru = runUiByScenario[sid] ?? createDefaultRunUi();
    patchRunUi(sid, { isStarting: true, log: "", summary: null, status: "queued" });
    runTargetScenarioRef.current = sid;
    try {
      const hasExcel = (draft.excelTestCases?.length ?? 0) > 0;
      const baseUrl =
        hasExcel && ru.recordUrl.trim() !== "" ? ru.recordUrl.trim() : undefined;
      const body =
        draft.mode === "builder"
          ? {
              scenarioId: draft.id,
              steps: draft.steps as Step[],
              excelTestCases: draft.excelTestCases ?? [],
              ...(baseUrl ? { baseUrl } : {}),
            }
          : {
              scenarioId: draft.id,
              rawScript: draft.rawScript,
              excelTestCases: draft.excelTestCases ?? [],
              ...(baseUrl ? { baseUrl } : {}),
            };
      const res = await fetch("/api/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`요청 실패 (HTTP ${res.status})`);
      const json = (await res.json()) as { runId: string };
      patchRunUi(sid, {
        runId: json.runId,
        status: "running",
      });
      setWsRunId(json.runId);
      setHistoryRefreshTick((n) => n + 1);
    } catch (e) {
      patchRunUi(sid, { status: "error", log: (e as Error).message });
      runTargetScenarioRef.current = null;
      setWsRunId(null);
    } finally {
      patchRunUi(sid, { isStarting: false });
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col gap-4 p-6">
      <header className="border-b border-slate-800 pb-4">
        <h1 className="text-xl font-semibold tracking-tight">TestFlow</h1>
        <p className="mt-1 text-sm text-slate-400">
          아래에 테스트할 URL을 입력해 시나리오를 만들거나, 왼쪽 &quot;+ 새로&quot;로
          빈 시나리오를 만든 뒤 빌더에서 스텝을 추가하세요.
        </p>
      </header>

      <div className="flex flex-1 gap-6">
        <ScenarioList
          items={list}
          selectedId={draft?.id ?? null}
          onSelect={(id) => void handleSelect(id)}
          onCreate={() => void handleCreate()}
          onDelete={(id) => void handleDelete(id)}
          onRename={(id, name) => void handleRename(id, name)}
        />

        <main className="flex min-w-0 flex-1 flex-col gap-4">
          {!draft ? (
            <div className="flex flex-col gap-4 rounded-xl border border-slate-800 bg-slate-900/50 p-6">
              <h2 className="text-base font-semibold text-slate-200">
                시나리오 만들기
              </h2>
              <p className="text-sm text-slate-500">
                테스트할 웹 페이지 주소(https://…)를 입력한 뒤 버튼을 누르면,
                빌더에 <strong className="text-slate-400">페이지 이동</strong> 스텝이
                자동으로 들어갑니다. 녹화에 쓰는 URL도 같이 맞춰 둡니다.
              </p>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <label
                    htmlFor="quick-start-url"
                    className="text-xs font-medium text-slate-500"
                  >
                    테스트 시작 URL
                  </label>
                  <input
                    id="quick-start-url"
                    type="url"
                    value={quickStartUrl}
                    onChange={(e) => setQuickStartUrl(e.target.value)}
                    placeholder="https://example.com"
                    className="rounded-lg border border-slate-600 bg-slate-950 px-3 py-2.5 text-sm text-slate-200 placeholder-slate-600 focus:border-sky-500 focus:outline-none"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void handleCreateWithStartUrl()}
                    className="rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-sky-500"
                  >
                    URL로 시나리오 만들기
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleCreate()}
                    className="rounded-lg border border-slate-600 px-4 py-2.5 text-sm font-medium text-slate-300 hover:border-slate-500"
                  >
                    빈 시나리오
                  </button>
                </div>
              </div>
              <p className="text-xs text-slate-600">
                이미 목록에 시나리오가 있으면 왼쪽에서 선택하세요.
              </p>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <input
                  type="text"
                  value={draft.name}
                  onChange={(e) => updateDraft({ name: e.target.value })}
                  className="min-w-[200px] flex-1 rounded border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-200 focus:border-sky-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={saveBusy}
                  className="rounded-lg border border-slate-600 px-4 py-2 text-sm font-medium text-slate-200 hover:border-sky-500 hover:text-sky-300 disabled:opacity-50"
                >
                  {saveBusy ? "저장 중…" : "저장"}
                </button>
              </div>

              <div className="flex gap-2 border-b border-slate-800 pb-2">
                <button
                  type="button"
                  onClick={() => switchTab("builder")}
                  className={`rounded px-3 py-1.5 text-sm font-medium ${
                    editorTab === "builder"
                      ? "bg-slate-800 text-sky-300"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  빌더
                </button>
                <button
                  type="button"
                  onClick={() => switchTab("docTc")}
                  className={`rounded px-3 py-1.5 text-sm font-medium ${
                    editorTab === "docTc"
                      ? "bg-slate-800 text-sky-300"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  문서 TC
                </button>
                
              </div>

              {editorTab === "builder" ? (
                <ScenarioBuilder
                  steps={draft.steps}
                  onChange={setSteps}
                  rawScript={draft.rawScript}
                  onRawScriptChange={(rawScript) =>
                    updateDraft({ rawScript })
                  }
                />
              ) : (
                <DocTcPanel
                  scenario={draft}
                  onScenarioUpdated={(scenario) => setDraft(scenario)}
                />
              )}

              <RunPanel
                status={activeRunUi.status}
                runId={activeRunUi.runId}
                log={activeRunUi.log}
                summary={activeRunUi.summary}
                logEndRef={logEndRef}
                isStarting={activeRunUi.isStarting}
                canRun={canRun}
                onRun={() => void startRun()}
                recordUrl={activeRunUi.recordUrl}
                onRecordUrlChange={(v) => patchRunUi(draft.id, { recordUrl: v })}
                isRecording={
                  recordingSessionId !== null &&
                  recordingForScenarioId === draft.id
                }
                onStartRecord={() => void handleStartRecord()}
                onStopRecord={() => void handleStopRecord()}
                liveSessionId={
                  recordingForScenarioId === draft.id ? recordingSessionId : null
                }
                lastRecording={activeRunUi.lastRecording}
                smartTc={
                  draft.smartTc && draft.smartTc.length > 0
                    ? draft.smartTc
                    : activeRunUi.smartTc
                }
                onClearSmartTc={() => {
                  patchRunUi(draft.id, { smartTc: null });
                  updateDraft({ smartTc: [] });
                }}
                scenarioName={draft.name}
              />
              <RunHistoryPanel
                scenarioId={draft.id}
                refreshTrigger={historyRefreshTick}
                activeRunId={activeRunUi.runId}
                onDeletedActiveRun={() => {
                  patchRunUi(draft.id, {
                    runId: null,
                    summary: null,
                    log: "",
                    status: "idle",
                  });
                  setWsRunId(null);
                  runTargetScenarioRef.current = null;
                }}
              />
            </>
          )}
        </main>
      </div>
    </div>
  );
}
