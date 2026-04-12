import { useCallback, useEffect, useRef, useState } from "react";
import { RunHistoryPanel } from "./components/RunHistoryPanel";
import { RunPanel } from "./components/RunPanel";
import { ScenarioBuilder } from "./components/ScenarioBuilder";
import { ScenarioList } from "./components/ScenarioList";
import { ScriptEditor } from "./components/ScriptEditor";
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

  const [recordUrl, setRecordUrl] = useState("https://example.com");
  /** 빈 화면에서 시나리오 생성 시 사용할 테스트 시작 URL */
  const [quickStartUrl, setQuickStartUrl] = useState("");
  const [recordingSessionId, setRecordingSessionId] = useState<string | null>(
    null,
  );
  const [isRecording, setIsRecording] = useState(false);
  const [lastRecording, setLastRecording] = useState<{
    sessionKind: "codegen" | "hosted";
    artifacts: { videoUrl: string };
  } | null>(null);
  const [smartTc, setSmartTc] = useState<SmartTC[] | null>(null);

  const [runId, setRunId] = useState<string | null>(null);
  const [status, setStatus] = useState<RunStatus>("idle");
  const [log, setLog] = useState("");
  const [summary, setSummary] = useState<RunSummary | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  /** Increment to refetch run history list */
  const [historyRefreshTick, setHistoryRefreshTick] = useState(0);
  const logEndRef = useRef<HTMLDivElement>(null);

  const scrollLog = useCallback(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollLog();
  }, [log, scrollLog]);

  async function refreshList(): Promise<void> {
    const rows = await fetchJson<ScenarioSummary[]>("/api/scenarios");
    setList(rows);
  }

  useEffect(() => {
    void refreshList().catch(() => setList([]));
  }, []);

  useEffect(() => {
    if (!runId) return;
    const socket = new WebSocket(wsUrlForRun(runId));
    socket.addEventListener("message", (event) => {
      try {
        const data = JSON.parse(event.data as string) as {
          type?: string;
          chunk?: string;
          status?: RunStatus;
          log?: string;
        };
        if (data.type === "snapshot") {
          if (data.status) setStatus(data.status);
          if (typeof data.log === "string") setLog(data.log);
          return;
        }
        if (data.type === "log" && typeof data.chunk === "string")
          setLog((prev) => prev + data.chunk);
        if (data.type === "status" && data.status) setStatus(data.status);
        if (data.type === "complete") {
          if (data.status) setStatus(data.status);
          void refreshSummary(runId);
          setHistoryRefreshTick((n) => n + 1);
        }
      } catch {
        /* 무시 */
      }
    });
    return () => socket.close();
  }, [runId]);

  async function refreshSummary(id: string): Promise<void> {
    const res = await fetch(`/api/runs/${id}`);
    if (!res.ok) return;
    setSummary((await res.json()) as RunSummary);
  }

  /** 실행 중에도 test-results에 쌓인 스크린샷을 주기적으로 반영 */
  useEffect(() => {
    if (status !== "running" || !runId) return;
    const tick = (): void => {
      void refreshSummary(runId);
    };
    const t = window.setInterval(tick, 4000);
    tick();
    return () => window.clearInterval(t);
  }, [status, runId]);

  async function handleCreate(): Promise<void> {
    const created = await fetchJson<Scenario>("/api/scenarios", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "새 시나리오", mode: "builder" }),
    });
    await refreshList();
    setDraft(created);
    setEditorTab(created.mode);
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
    if (url.length > 0) setRecordUrl(url);
  }

  async function handleSelect(id: string): Promise<void> {
    const s = await fetchJson<Scenario>(`/api/scenarios/${id}`);
    setDraft(s);
    setEditorTab(s.mode);
  }

  async function handleSave(): Promise<void> {
    if (!draft) return;
    setSaveBusy(true);
    try {
      const updated = await fetchJson<Scenario>(`/api/scenarios/${draft.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: draft.name,
          mode: draft.mode,
          steps: draft.steps,
          rawScript: draft.rawScript,
        }),
      });
      setDraft(updated);
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
    if (draft) setDraft({ ...draft, mode: tab });
  }

  async function handleStartRecord(): Promise<void> {
    try {
      const res = await fetchJson<{ sessionId: string }>("/api/sessions/record", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: recordUrl, mode: "hosted" }),
      });
      setRecordingSessionId(res.sessionId);
      setIsRecording(true);
    } catch (e) {
      setLog(`녹화 시작 실패: ${(e as Error).message}`);
    }
  }

  async function handleStopRecord(): Promise<void> {
    if (!recordingSessionId) {
      setIsRecording(false);
      return;
    }
    try {
      const res = await fetch(`/api/sessions/${recordingSessionId}/stop`, {
        method: "POST",
      });
      const body = (await res.json()) as RecordingStopBody;
      if (!res.ok || body.error) {
        setLog(
          (prev) =>
            prev + `\n녹화 종료 오류: ${body.error ?? res.statusText}\n`,
        );
      } else if (draft) {
        const rawSteps = Array.isArray(body.steps) ? body.steps : [];
        const normalized = rawSteps.map((s) =>
          normalizeStepFromApi(s as Record<string, unknown>),
        );
        const script = typeof body.script === "string" ? body.script : "";
        const hasSteps = normalized.length > 0;
        const warns = body.parseWarnings ?? [];
        if (!hasSteps) {
          setLog(
            (prev) =>
              prev +
              "\n녹화된 사용자 행위를 스텝으로 변환하지 못했습니다. 다시 녹화해 주세요.\n",
          );
          return;
        }
        setDraft({
          ...draft,
          rawScript: script,
          mode: "builder",
          steps: normalized,
        });
        setEditorTab("builder");
        if (Array.isArray(body.smartTc) && body.smartTc.length > 0)
          setSmartTc(body.smartTc);
        if (warns.length > 0)
          setLog(
            (prev) =>
              prev +
              `\n녹화 참고:\n${warns.map((w) => `  - ${w}`).join("\n")}\n`,
          );
        if (body.sessionKind && body.sessionArtifacts) {
          const a = body.sessionArtifacts;
          if (a.videoUrl)
            setLastRecording({
              sessionKind: body.sessionKind,
              artifacts: a,
            });
        }
      } else {
        setLog(
          (prev) =>
            prev +
            "\n녹화 결과를 저장하려면 시나리오를 먼저 만들거나 목록에서 선택하세요.\n",
        );
      }
    } catch (e) {
      setLog((prev) => prev + `\n${(e as Error).message}\n`);
    } finally {
      setRecordingSessionId(null);
      setIsRecording(false);
    }
  }

  const canRun =
    draft != null &&
    (draft.mode === "builder"
      ? draft.steps.length > 0
      : draft.rawScript.trim() !== "");

  async function startRun(): Promise<void> {
    if (!draft) return;
    setIsStarting(true);
    setLog("");
    setSummary(null);
    setStatus("queued");
    try {
      const body =
        draft.mode === "builder"
          ? { scenarioId: draft.id, steps: draft.steps as Step[] }
          : { scenarioId: draft.id, rawScript: draft.rawScript };
      const res = await fetch("/api/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`요청 실패 (HTTP ${res.status})`);
      const json = (await res.json()) as { runId: string };
      setRunId(json.runId);
      setStatus("running");
      setHistoryRefreshTick((n) => n + 1);
    } catch (e) {
      setStatus("error");
      setLog((e as Error).message);
    } finally {
      setIsStarting(false);
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
                  onClick={() => switchTab("script")}
                  className={`rounded px-3 py-1.5 text-sm font-medium ${
                    editorTab === "script"
                      ? "bg-slate-800 text-sky-300"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  스크립트
                </button>
              </div>

              {editorTab === "builder" ? (
                <ScenarioBuilder steps={draft.steps} onChange={setSteps} />
              ) : (
                <ScriptEditor
                  value={draft.rawScript}
                  onChange={(rawScript) => updateDraft({ rawScript })}
                />
              )}

              <RunPanel
                status={status}
                runId={runId}
                log={log}
                summary={summary}
                logEndRef={logEndRef}
                isStarting={isStarting}
                canRun={canRun}
                onRun={() => void startRun()}
                recordUrl={recordUrl}
                onRecordUrlChange={setRecordUrl}
                isRecording={isRecording}
                onStartRecord={() => void handleStartRecord()}
                onStopRecord={() => void handleStopRecord()}
                lastRecording={lastRecording}
                smartTc={smartTc}
                onClearSmartTc={() => setSmartTc(null)}
              />
              <RunHistoryPanel
                scenarioId={draft.id}
                refreshTrigger={historyRefreshTick}
                activeRunId={runId}
                onDeletedActiveRun={() => {
                  setRunId(null);
                  setSummary(null);
                  setLog("");
                  setStatus("idle");
                }}
              />
            </>
          )}
        </main>
      </div>
    </div>
  );
}
