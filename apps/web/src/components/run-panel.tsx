import { RUNNER_EVENT, type RunnerEvent } from "@testflow/runner-contract";
import { RUN_LIMITS } from "@testflow/shared";
import type { TcDocumentSummary, TcVersion, TestCase } from "@testflow/tc-generator";
import { useEffect, useRef, useState } from "react";
import { ApiError, deleteJson, getJson, postJson } from "../lib/http";
import { runWebSocketUrl } from "../lib/run-ws";

interface TcListResponse {
  items: TcDocumentSummary[];
}

interface TcHeadResponse {
  document: TcDocumentSummary;
  head: TcVersion;
}

interface RunRecord {
  runId: string;
  documentId: string;
  caseId: string;
  startUrl: string;
  status: string;
  startedAt: string;
  finishedAt?: string;
  failStepId?: string;
  videoPath?: string;
  stepTimeoutMs: number;
}

interface RunListResponse {
  items: RunRecord[];
}

interface RunEventsResponse {
  items: RunnerEvent[];
}

interface RunPanelProps {
  documentId: string | null;
  documentListRevision?: number;
}

function eventTone(type: RunnerEvent["type"]): string {
  if (type === RUNNER_EVENT.stepFailed) return "text-rose-300";
  if (type === RUNNER_EVENT.stepPassed) return "text-emerald-300";
  if (type === RUNNER_EVENT.runFinished) return "text-sky-300";
  return "text-slate-300";
}

export function RunPanel({ documentId, documentListRevision = 0 }: RunPanelProps) {
  const [docs, setDocs] = useState<TcDocumentSummary[]>([]);
  const [selectedDocumentId, setSelectedDocumentId] = useState(documentId ?? "");
  const [cases, setCases] = useState<TestCase[]>([]);
  const [caseId, setCaseId] = useState("");
  const [startUrl, setStartUrl] = useState("https://example.com");
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [activeRun, setActiveRun] = useState<RunRecord | null>(null);
  const [events, setEvents] = useState<RunnerEvent[]>([]);
  const [focusedStepId, setFocusedStepId] = useState<string | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const logRef = useRef<HTMLUListElement | null>(null);

  useEffect(() => {
    if (documentId) setSelectedDocumentId(documentId);
  }, [documentId]);

  useEffect(() => {
    void getJson<TcListResponse>("/api/tc")
      .then((result) => {
        setDocs(result.items);
        setSelectedDocumentId((current) => {
          if (documentId && result.items.some((item) => item.documentId === documentId))
            return documentId;
          if (current && result.items.some((item) => item.documentId === current))
            return current;
          return result.items[0]?.documentId ?? "";
        });
      })
      .catch(applyError);
    void refreshRuns();
  }, [documentId, documentListRevision]);

  useEffect(() => {
    return () => {
      socketRef.current?.close();
    };
  }, []);

  useEffect(() => {
    if (!selectedDocumentId) {
      setCases([]);
      setCaseId("");
      return;
    }
    void getJson<TcHeadResponse>(`/api/tc/${selectedDocumentId}`)
      .then((result) => {
        setCases(result.head.cases);
        setCaseId((current) => current || result.head.cases[0]?.id || "");
      })
      .catch(applyError);
  }, [selectedDocumentId]);

  useEffect(() => {
    const list = logRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [events]);

  function applyError(error: unknown) {
    if (error instanceof ApiError) {
      setErrorCode(error.code);
      setErrorMessage(error.message);
      return;
    }
    setErrorCode("request_failed");
    setErrorMessage(error instanceof Error ? error.message : "요청에 실패했습니다.");
  }

  async function refreshRuns() {
    const result = await getJson<RunListResponse>("/api/runs");
    setRuns(result.items);
  }

  function connectSocket(runId: string) {
    socketRef.current?.close();
    const socket = new WebSocket(runWebSocketUrl(runId));
    socketRef.current = socket;
    socket.onmessage = (message) => {
      const event = JSON.parse(String(message.data)) as RunnerEvent;
      setEvents((current) => [...current, event]);
      if (event.type === RUNNER_EVENT.stepFailed && event.stepId)
        setFocusedStepId(event.stepId);
      if (event.type === RUNNER_EVENT.runFinished) {
        void loadRun(runId, { keepEvents: true });
        void refreshRuns();
      }
    };
    socket.onerror = () => {
      setErrorCode("ws_failed");
      setErrorMessage("실시간 로그 소켓에 연결하지 못했습니다.");
    };
  }

  async function loadRun(runId: string, options?: { keepEvents?: boolean }) {
    const record = await getJson<RunRecord>(`/api/runs/${runId}`);
    setActiveRun(record);
    setSelectedDocumentId(record.documentId);
    setCaseId(record.caseId);
    setStartUrl(record.startUrl);
    setFocusedStepId(record.failStepId ?? null);
    if (!options?.keepEvents) {
      const log = await getJson<RunEventsResponse>(`/api/runs/${runId}/events`);
      setEvents(log.items);
    }
  }

  async function handleStart() {
    if (!selectedDocumentId) return;
    setIsWorking(true);
    setErrorMessage(null);
    setErrorCode(null);
    setEvents([]);
    setFocusedStepId(null);
    try {
      const record = await postJson<RunRecord>("/api/runs", {
        documentId: selectedDocumentId,
        caseId: caseId || undefined,
        startUrl,
      });
      setActiveRun(record);
      connectSocket(record.runId);
      await refreshRuns();
    } catch (error) {
      applyError(error);
    } finally {
      setIsWorking(false);
    }
  }

  async function handleStop() {
    if (!activeRun) return;
    setIsWorking(true);
    try {
      await postJson<{ ok: boolean }>(`/api/runs/${activeRun.runId}/stop`, {});
    } catch (error) {
      applyError(error);
    } finally {
      setIsWorking(false);
    }
  }

  async function handleDelete(runId: string) {
    setIsWorking(true);
    try {
      await deleteJson<{ ok: boolean }>(`/api/runs/${runId}`);
      if (activeRun?.runId === runId) {
        socketRef.current?.close();
        setActiveRun(null);
        setEvents([]);
        setFocusedStepId(null);
      }
      setErrorMessage(null);
      setErrorCode(null);
      await refreshRuns();
    } catch (error) {
      applyError(error);
    } finally {
      setIsWorking(false);
    }
  }

  const selectedCase = cases.find((item) => item.id === caseId) ?? cases[0];
  const isRunning = activeRun?.status === "queued" || activeRun?.status === "running";
  const hasVideo = Boolean(activeRun?.videoPath);

  return (
    <section className="space-y-4 rounded-xl border border-slate-700 bg-slate-900/70 p-5">
      <header className="space-y-1">
        <h2 className="text-lg font-medium text-white">4. 브라우저 실행 · 로그 · 녹화</h2>
        <p className="text-sm text-slate-400">
          headed Chromium에서 가상 마우스가 움직이고, 실패하면 그 스텝에서 멈춥니다.
          스텝 제한 {RUN_LIMITS.stepTimeoutMs / 1000}초, 보관 {RUN_LIMITS.maxKeptRuns}런.
        </p>
      </header>

      <div className="grid gap-2 sm:grid-cols-2">
        <select
          className="rounded-md border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-slate-100"
          value={selectedDocumentId}
          onChange={(event) => setSelectedDocumentId(event.target.value)}
        >
          <option value="">TC 문서 선택</option>
          {docs.map((doc) => (
            <option key={doc.documentId} value={doc.documentId}>
              {doc.figmaFileKey} / {doc.figmaStartNodeId} · v{doc.headVersion}
            </option>
          ))}
        </select>
        <select
          className="rounded-md border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-slate-100"
          value={caseId}
          onChange={(event) => setCaseId(event.target.value)}
        >
          <option value="">첫 번째 TC</option>
          {cases.map((item) => (
            <option key={item.id} value={item.id}>
              {item.title}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          className="flex-1 rounded-md border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-slate-100"
          value={startUrl}
          onChange={(event) => setStartUrl(event.target.value)}
          placeholder="https://example.com"
        />
        <button
          type="button"
          className="rounded-md bg-emerald-700 px-3 py-2 text-sm text-white disabled:opacity-50"
          disabled={isWorking || !selectedDocumentId || isRunning}
          onClick={() => void handleStart()}
        >
          실행
        </button>
        <button
          type="button"
          className="rounded-md bg-rose-800 px-3 py-2 text-sm text-white disabled:opacity-50"
          disabled={isWorking || !isRunning}
          onClick={() => void handleStop()}
        >
          중지
        </button>
      </div>

      {errorMessage ? (
        <p className="text-sm text-rose-300" role="alert">
          {errorCode ? <span className="font-mono">[{errorCode}] </span> : null}
          {errorMessage}
        </p>
      ) : null}

      {activeRun ? (
        <p className="text-xs text-slate-500">
          {activeRun.runId} · {activeRun.status}
          {activeRun.failStepId ? ` · fail ${activeRun.failStepId}` : ""}
        </p>
      ) : null}

      {selectedCase ? (
        <ol className="space-y-1">
          {selectedCase.steps.map((step, index) => {
            const stepId = `${selectedCase.id}:${index}`;
            const isFocused = focusedStepId === stepId;
            return (
              <li
                key={stepId}
                id={`run-step-${stepId}`}
                className={`rounded-md border px-3 py-2 text-xs ${
                  isFocused
                    ? "border-rose-400 bg-rose-950/40 text-rose-100"
                    : "border-slate-700 text-slate-300"
                }`}
              >
                {index + 1}. {step.action} → {step.targetHint}
              </li>
            );
          })}
        </ol>
      ) : null}

      <ul
        ref={logRef}
        className="max-h-56 space-y-1 overflow-auto rounded-md bg-slate-950 p-3 text-xs"
      >
        {events.length === 0 ? (
          <li className="text-slate-500">실행하면 실시간 로그가 여기에 쌓입니다.</li>
        ) : (
          events.map((event, index) => (
            <li key={`${event.at}-${index}`}>
              <button
                type="button"
                className={`block w-full text-left ${eventTone(event.type)}`}
                onClick={() => {
                  if (!event.stepId) return;
                  setFocusedStepId(event.stepId);
                  document
                    .getElementById(`run-step-${event.stepId}`)
                    ?.scrollIntoView({ behavior: "smooth", block: "center" });
                }}
              >
                [{event.type}] {event.stepId ?? "-"} {event.message ?? ""}
              </button>
            </li>
          ))
        )}
      </ul>

      {activeRun && hasVideo ? (
        <video
          key={activeRun.runId}
          className="w-full rounded-md border border-slate-700"
          controls
          src={`/api/runs/${activeRun.runId}/video`}
        />
      ) : null}

      {runs.length > 0 ? (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-slate-200">최근 런</h3>
          <ul className="space-y-1">
            {runs.map((item) => (
              <li key={item.runId} className="flex gap-2">
                <button
                  type="button"
                  className="min-w-0 flex-1 rounded-md border border-slate-700 px-3 py-2 text-left text-sm text-slate-200 hover:border-slate-500"
                  onClick={() => void loadRun(item.runId)}
                >
                  {item.status} · {item.caseId} · {new Date(item.startedAt).toLocaleString()}
                </button>
                <button
                  type="button"
                  data-run-id={item.runId}
                  className="rounded-md border border-slate-700 px-2.5 text-sm text-slate-400 hover:border-rose-400 hover:text-rose-300 disabled:opacity-50"
                  aria-label={`런 ${item.runId.slice(0, 8)} 삭제`}
                  disabled={isWorking}
                  onClick={() => void handleDelete(item.runId)}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
