import { useCallback, useEffect, useRef, useState } from "react";
import { AppHeader } from "./components/AppHeader";
import { DocTcModal } from "./components/DocTcModal";
import { QuickStartPanel } from "./components/QuickStartPanel";
import { RunHistoryPanel } from "./components/RunHistoryPanel";
import { RunPanel } from "./components/RunPanel";
import { ScenarioBuilder } from "./components/ScenarioBuilder";
import { ScenarioList } from "./components/ScenarioList";
import { ScenarioNameSaveBar } from "./components/ScenarioNameSaveBar";
import { createDefaultRunUi } from "./domain/run-ui";
import type {
  RecordingStopBody,
  RunSummary,
  ScenarioRunUiState,
} from "./domain/run-types";
import { useRunLogSocket } from "./hooks/use-run-log-socket";
import { useRunSummaryPoll } from "./hooks/use-run-summary-poll";
import { fetchJson } from "./lib/http";
import { scenarioNameFromUrl } from "./lib/scenario-naming";
import { persistRecordingToScenario } from "./services/hosted-recording-result";
import { runStartBodyBuilderFor } from "./services/run-start-body";
import { ScenarioApi } from "./services/scenario-api";
import { SmartTcFromStepsService } from "./services/smart-tc-from-steps";
import {
  createStep,
  normalizeStepFromApi,
  type Scenario,
  type ScenarioSummary,
  type Step,
} from "./types";

const scenarioApi = new ScenarioApi();
const smartTcService = new SmartTcFromStepsService();

export default function App() {
  const [list, setList] = useState<ScenarioSummary[]>([]);
  const [draft, setDraft] = useState<Scenario | null>(null);
  const [saveBusy, setSaveBusy] = useState(false);

  const [runUiByScenario, setRunUiByScenario] = useState<
    Record<string, ScenarioRunUiState>
  >({});
  const [quickStartUrl, setQuickStartUrl] = useState("");
  const [recordingSessionId, setRecordingSessionId] = useState<string | null>(
    null,
  );
  const [recordingForScenarioId, setRecordingForScenarioId] = useState<
    string | null
  >(null);
  const [wsRunId, setWsRunId] = useState<string | null>(null);
  const runTargetScenarioRef = useRef<string | null>(null);
  const [historyRefreshTick, setHistoryRefreshTick] = useState(0);
  const [isDocTcOpen, setIsDocTcOpen] = useState(false);
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
    const rows = await scenarioApi.list();
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

  useRunLogSocket(wsRunId, {
    getTargetScenarioId: () => runTargetScenarioRef.current,
    patchRunUi,
    appendLog,
    refreshSummaryForScenario,
    onRunComplete: () => {
      setHistoryRefreshTick((n) => n + 1);
      setWsRunId(null);
      runTargetScenarioRef.current = null;
    },
  });

  useRunSummaryPoll(wsRunId, () => runTargetScenarioRef.current, refreshSummaryForScenario);

  async function handleCreate(): Promise<void> {
    const nextNum = list.length + 1;
    const created = await scenarioApi.create({
      name: `새 시나리오 ${nextNum}`,
      mode: "builder",
    });
    await refreshList();
    setDraft(created);
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
    if (draft?.id === id)
      setDraft((prev) => (prev ? { ...prev, name: trimmed } : prev));
  }

  async function handleCreateWithStartUrl(): Promise<void> {
    const url = quickStartUrl.trim();
    const steps =
      url.length > 0 ? [{ ...createStep("goto"), selectorValue: url }] : [];
    const name = url.length > 0 ? scenarioNameFromUrl(url) : "새 시나리오";
    const created = await scenarioApi.create({
      name,
      mode: "builder",
      ...(steps.length > 0 ? { steps } : {}),
    });
    await refreshList();
    setDraft(created);
    if (url.length > 0) patchRunUi(created.id, { recordUrl: url });
  }

  async function handleSelect(id: string): Promise<void> {
    const s = await scenarioApi.get(id);
    let smartTcOut = s.smartTc;
    let persistDerived = false;
    if (
      (!smartTcOut || smartTcOut.length === 0) &&
      s.mode === "builder" &&
      s.steps.length > 0
    ) {
      const derived = await smartTcService.convert(s.steps);
      if (derived && derived.length > 0) {
        smartTcOut = derived;
        persistDerived = true;
      }
    }
    setDraft({
      ...s,
      excelTestCases: s.excelTestCases ?? [],
      smartTc: smartTcOut,
    });
    patchRunUi(id, { smartTc: smartTcOut ?? null });

    if (persistDerived && smartTcOut && smartTcOut.length > 0) {
      try {
        const updated = await scenarioApi.update(id, { smartTc: smartTcOut });
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
        const derived = await smartTcService.convert(draft.steps);
        if (derived && derived.length > 0) smartTcOut = derived;
      }
      const updated = await scenarioApi.update(draft.id, {
        name: draft.name,
        mode: draft.mode,
        steps: draft.steps,
        rawScript: draft.rawScript,
        excelTestCases: draft.excelTestCases ?? [],
        smartTc: smartTcOut,
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
    await scenarioApi.remove(id);
    await refreshList();
    if (draft?.id === id) {
      setDraft(null);
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
        const nextDraft = await persistRecordingToScenario({
          api: scenarioApi,
          targetSid,
          draft,
          normalizedSteps: normalized,
          script,
          smartTcPersist,
        });
        setDraft(nextDraft);
        await refreshList();
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

  function handleSendDocTcToCurrent(newSteps: Step[]): void {
    if (!draft) return;
    setDraft({ ...draft, steps: [...draft.steps, ...newSteps] });
  }

  async function handleCreateScenarioFromDocTc(payload: {
    name: string;
    steps: Step[];
  }): Promise<void> {
    const name = payload.name.trim() || "문서 기반 TC";
    const created = await scenarioApi.create({
      name,
      mode: "builder",
      steps: payload.steps,
    });
    await refreshList();
    setDraft(created);
  }

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
      const payload = runStartBodyBuilderFor(draft.mode).build(draft, {
        baseUrl,
      });
      const res = await fetch("/api/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
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
      <AppHeader onOpenDocTc={() => setIsDocTcOpen(true)} />

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
            <QuickStartPanel
              quickStartUrl={quickStartUrl}
              onQuickStartUrlChange={setQuickStartUrl}
              onCreateWithStartUrl={() => void handleCreateWithStartUrl()}
              onCreateEmpty={() => void handleCreate()}
              onOpenDocTc={() => setIsDocTcOpen(true)}
            />
          ) : (
            <>
              <ScenarioNameSaveBar
                name={draft.name}
                onNameChange={(name) => updateDraft({ name })}
                onSave={() => void handleSave()}
                isSaveBusy={saveBusy}
              />

              <ScenarioBuilder
                steps={draft.steps}
                onChange={setSteps}
                rawScript={draft.rawScript}
                onRawScriptChange={(rawScript) =>
                  updateDraft({ rawScript })
                }
              />

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

      <DocTcModal
        open={isDocTcOpen}
        onClose={() => setIsDocTcOpen(false)}
        hasActiveScenario={draft != null}
        onSendToCurrent={handleSendDocTcToCurrent}
        onCreateNewScenario={(payload) =>
          void handleCreateScenarioFromDocTc(payload)
        }
      />
    </div>
  );
}
