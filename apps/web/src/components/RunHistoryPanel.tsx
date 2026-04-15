import { useCallback, useEffect, useState } from "react";
import type { SmartTC } from "../types";
import { SmartTcTable } from "./SmartTcTable";

type PersistedRunStatus =
  | "queued"
  | "running"
  | "passed"
  | "failed"
  | "error";

interface RunHistoryRow {
  id: string;
  scenarioId?: string;
  status: PersistedRunStatus;
  exitCode: number | null;
  errorMessage?: string;
  startedAt: string;
  finishedAt?: string;
}

interface RunDetail extends RunHistoryRow {
  log: string;
  artifacts?: {
    reportIndex: string;
    testResultsDir: string;
    screenshotUrls?: string[];
    videoUrls?: string[];
  };
}

interface RecordingListItem {
  sessionId: string;
  kind: "hosted";
  scenarioId: string | null;
  startedAt: string;
  stoppedAt?: string;
  videoUrl: string;
  stepsJsonUrl: string;
  /** API 구버전에 없을 수 있음 */
  smartTcJsonUrl?: string;
}

const STATUS_STYLES: Record<PersistedRunStatus, string> = {
  queued: "bg-amber-900/60 text-amber-100",
  running: "bg-sky-900/60 text-sky-100",
  passed: "bg-emerald-900/60 text-emerald-100",
  failed: "bg-rose-900/60 text-rose-100",
  error: "bg-rose-950 text-rose-200",
};

const STATUS_LABELS: Record<PersistedRunStatus, string> = {
  queued: "대기",
  running: "실행 중",
  passed: "성공",
  failed: "실패",
  error: "오류",
};

function formatWhen(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function RecordingSmartTcPreview({
  smartTcUrl,
  embedded,
}: {
  smartTcUrl: string;
  embedded: boolean;
}) {
  const [items, setItems] = useState<SmartTC[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setItems(null);
    setLoadError(false);
    void (async () => {
      try {
        const res = await fetch(smartTcUrl);
        if (!res.ok) throw new Error("bad_status");
        const data = (await res.json()) as unknown;
        const arr = Array.isArray(data) ? (data as SmartTC[]) : [];
        if (!cancelled) setItems(arr);
      } catch {
        if (!cancelled) setLoadError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [smartTcUrl]);

  if (loadError) {
    return (
      <p
        className={
          embedded ? "text-[10px] text-slate-600" : "text-xs text-slate-600"
        }
      >
        스마트 TC를 불러오지 못했습니다.
      </p>
    );
  }
  if (items === null) {
    return (
      <p
        className={
          embedded ? "text-[10px] text-slate-500" : "text-xs text-slate-500"
        }
      >
        스마트 TC 불러오는 중…
      </p>
    );
  }
  if (items.length === 0) {
    return (
      <p
        className={
          embedded ? "text-[10px] text-slate-600" : "text-xs text-slate-600"
        }
      >
        스마트 TC 항목이 없습니다.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-1 border-t border-slate-800/80 pt-2">
      <span
        className={
          embedded
            ? "text-[10px] font-medium text-emerald-400/90"
            : "text-xs font-medium text-emerald-300/90"
        }
      >
        스마트 TC
      </span>
      <SmartTcTable items={items} compact={embedded} />
    </div>
  );
}

interface Props {
  /** 이 시나리오에 속한 실행만 표시 */
  scenarioId: string;
  refreshTrigger: number;
  activeRunId?: string | null;
  onDeletedActiveRun?: () => void;
  /** Compact layout for the scenario sidebar */
  embedded?: boolean;
}

export function RunHistoryPanel({
  scenarioId,
  refreshTrigger,
  activeRunId,
  onDeletedActiveRun,
  embedded = false,
}: Props) {
  const [rows, setRows] = useState<RunHistoryRow[]>([]);
  const [recordings, setRecordings] = useState<RecordingListItem[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailById, setDetailById] = useState<Record<string, RunDetail | null>>(
    {},
  );
  const [detailLoadingId, setDetailLoadingId] = useState<string | null>(null);
  const [scriptModal, setScriptModal] = useState<{
    runId: string;
    text: string;
    title?: string;
  } | null>(null);

  const loadList = useCallback(async () => {
    setBusy(true);
    setLoadError(null);
    try {
      const q = new URLSearchParams({ scenarioId });
      const [runsRes, recRes] = await Promise.all([
        fetch(`/api/runs?${q}`),
        fetch(`/api/recordings?${q}`),
      ]);
      if (!runsRes.ok) throw new Error(`${runsRes.status} ${runsRes.statusText}`);
      const data = (await runsRes.json()) as RunHistoryRow[];
      setRows(Array.isArray(data) ? data : []);
      if (recRes.ok) {
        const recData = (await recRes.json()) as RecordingListItem[];
        setRecordings(Array.isArray(recData) ? recData : []);
      } else {
        setRecordings([]);
      }
    } catch (e) {
      setLoadError((e as Error).message);
      setRows([]);
      setRecordings([]);
    } finally {
      setBusy(false);
    }
  }, [scenarioId]);

  useEffect(() => {
    void loadList();
  }, [loadList, refreshTrigger]);

  async function loadDetail(runId: string): Promise<void> {
    setDetailLoadingId(runId);
    try {
      const res = await fetch(`/api/runs/${runId}`);
      if (!res.ok) {
        setDetailById((prev) => ({ ...prev, [runId]: null }));
        return;
      }
      const d = (await res.json()) as RunDetail;
      setDetailById((prev) => ({ ...prev, [runId]: d }));
    } catch {
      setDetailById((prev) => ({ ...prev, [runId]: null }));
    } finally {
      setDetailLoadingId(null);
    }
  }

  function toggleExpand(runId: string): void {
    if (expandedId === runId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(runId);
    void loadDetail(runId);
  }

  async function openScript(runId: string): Promise<void> {
    try {
      const res = await fetch(`/api/runs/${runId}/script`);
      if (!res.ok) {
        setScriptModal({
          runId,
          text: "(이 실행에 scenario.spec.ts가 없습니다.)",
          title: "scenario.spec.ts",
        });
        return;
      }
      const text = await res.text();
      setScriptModal({
        runId,
        text,
        title: "scenario.spec.ts",
      });
    } catch {
      setScriptModal({
        runId,
        text: "(스크립트 불러오기 실패)",
        title: "scenario.spec.ts",
      });
    }
  }

  async function openStepsJson(sessionId: string): Promise<void> {
    try {
      const res = await fetch(`/api/recordings/${sessionId}/steps.json`);
      const raw = await res.text();
      let text = raw;
      try {
        text = JSON.stringify(JSON.parse(raw), null, 2);
      } catch {
        /* keep raw */
      }
      setScriptModal({
        runId: sessionId,
        text,
        title: "steps.json",
      });
    } catch {
      setScriptModal({
        runId: sessionId,
        text: "(불러오기 실패)",
        title: "steps.json",
      });
    }
  }

  async function openSmartTcJson(sessionId: string): Promise<void> {
    try {
      const res = await fetch(`/api/recordings/${sessionId}/smartTc.json`);
      const raw = await res.text();
      let text = raw;
      try {
        text = JSON.stringify(JSON.parse(raw), null, 2);
      } catch {
        /* keep raw */
      }
      setScriptModal({
        runId: sessionId,
        text,
        title: "smartTc.json",
      });
    } catch {
      setScriptModal({
        runId: sessionId,
        text: "(불러오기 실패)",
        title: "smartTc.json",
      });
    }
  }

  async function removeRun(runId: string): Promise<void> {
    if (
      !confirm(
        `실행 기록 ${runId.slice(0, 8)}… 및 산출물을 디스크에서 삭제할까요?`,
      )
    )
      return;
    try {
      const res = await fetch(`/api/runs/${runId}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      if (activeRunId === runId) onDeletedActiveRun?.();
      setExpandedId((id) => (id === runId ? null : id));
      setDetailById((prev) => {
        const next = { ...prev };
        delete next[runId];
        return next;
      });
      await loadList();
    } catch (e) {
      setLoadError((e as Error).message);
    }
  }

  const sectionClass = embedded
    ? "flex flex-col gap-2 rounded-md border border-slate-800/80 bg-slate-950/30 p-2"
    : "flex flex-col gap-3 rounded-lg border border-slate-800 bg-slate-900/40 p-4";

  return (
    <section className={sectionClass}>
      {embedded ? (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => void loadList()}
            disabled={busy}
            className="rounded border border-slate-700 px-1.5 py-0.5 text-[10px] text-slate-400 hover:bg-slate-800 disabled:opacity-50"
          >
            {busy ? "불러오는 중…" : "새로고침"}
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-300">
            실행 기록
          </h3>
          <button
            type="button"
            onClick={() => void loadList()}
            disabled={busy}
            className="rounded border border-slate-600 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-50"
          >
            {busy ? "불러오는 중…" : "새로고침"}
          </button>
        </div>
      )}
      {!embedded ? (
        <p className="text-xs text-slate-500">
          이 시나리오에 연결된 호스트 녹화(영상·steps.json·smartTc.json)과 Playwright 실행 기록을 한곳에 봅니다. 행을 펼쳐 상세를 확인하세요.
        </p>
      ) : null}
      {loadError ? (
        <p
          className={
            embedded ? "text-[10px] text-rose-400" : "text-xs text-rose-400"
          }
        >
          {loadError}
        </p>
      ) : null}
      <div
        className={
          embedded
            ? "flex flex-col gap-1.5"
            : "flex flex-col gap-2"
        }
      >
        <div className="flex flex-col gap-1">
          <h4
            className={
              embedded
                ? "text-[10px] font-semibold uppercase tracking-wide text-slate-500"
                : "text-xs font-semibold text-slate-400"
            }
          >
            녹화
          </h4>
          {recordings.length === 0 && !busy ? (
            <p
              className={
                embedded ? "text-[10px] text-slate-600" : "text-xs text-slate-600"
              }
            >
              연결된 녹화가 없습니다. 녹화 시 시나리오가 선택되어 있어야 목록에 나타납니다.
            </p>
          ) : null}
          <ul
            className={
              embedded
                ? "flex max-h-36 flex-col gap-0.5 overflow-y-auto pr-0.5"
                : "flex max-h-48 flex-col gap-1 overflow-y-auto pr-1"
            }
          >
            {recordings.map((rec) => (
              <li
                key={rec.sessionId}
                className={
                  embedded
                    ? "rounded border border-amber-900/40 bg-slate-950/50"
                    : "rounded border border-amber-900/30 bg-slate-950/40"
                }
              >
                <div
                  className={
                    embedded
                      ? "flex flex-wrap items-center gap-1 px-1.5 py-1"
                      : "flex flex-wrap items-center gap-2 px-2 py-2"
                  }
                >
                  <span
                    className={
                      embedded
                        ? "rounded bg-amber-950/80 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-amber-100"
                        : "rounded bg-amber-950/80 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-100"
                    }
                  >
                    {"hosted"}
                  </span>
                  <span className="font-mono text-xs text-slate-400">
                    {rec.sessionId.slice(0, 8)}…
                  </span>
                  <span className="text-xs text-slate-500">
                    {formatWhen(rec.startedAt)}
                  </span>
                  <button
                    type="button"
                    className="text-xs text-violet-300 underline"
                    onClick={() => void openStepsJson(rec.sessionId)}
                  >
                    steps.json
                  </button>
                  <button
                    type="button"
                    className="text-xs text-emerald-300 underline"
                    onClick={() => void openSmartTcJson(rec.sessionId)}
                  >
                    smartTc.json
                  </button>
                  {rec.videoUrl ? (
                    <a
                      href={rec.videoUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-sky-400 underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      영상 새 창
                    </a>
                  ) : (
                    <span className="text-xs text-slate-600">
                      (영상 없음)
                    </span>
                  )}
                </div>
                {rec.videoUrl ? (
                  <div className="border-t border-slate-800/80 px-2 pb-2 pt-1">
                    <video
                      controls
                      className={
                        embedded
                          ? "max-h-28 w-full max-w-full rounded border border-slate-700 bg-black"
                          : "max-h-40 w-full max-w-lg rounded border border-slate-700 bg-black"
                      }
                      src={rec.videoUrl}
                    >
                      <track kind="captions" />
                    </video>
                  </div>
                ) : null}
                <div className="px-2 pb-2">
                  <RecordingSmartTcPreview
                    smartTcUrl={
                      rec.smartTcJsonUrl ??
                      `/api/recordings/${rec.sessionId}/smartTc.json`
                    }
                    embedded={embedded}
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-col gap-1">
          <h4
            className={
              embedded
                ? "text-[10px] font-semibold uppercase tracking-wide text-slate-500"
                : "text-xs font-semibold text-slate-400"
            }
          >
            테스트 실행
          </h4>
          {rows.length === 0 && !busy ? (
            <p
              className={
                embedded ? "text-[10px] text-slate-600" : "text-xs text-slate-600"
              }
            >
              저장된 실행이 없습니다.
            </p>
          ) : null}
          <ul
            className={
              embedded
                ? "flex max-h-44 flex-col gap-0.5 overflow-y-auto pr-0.5"
                : "flex max-h-80 flex-col gap-1 overflow-y-auto pr-1"
            }
          >
        {rows.map((r) => {
          const expanded = expandedId === r.id;
          const detail = detailById[r.id];
          const base = `/api/runs/${r.id}/artifacts`;
          return (
            <li
              key={r.id}
              className={
                embedded
                  ? "rounded border border-slate-800/60 bg-slate-950/50"
                  : "rounded border border-slate-800/80 bg-slate-950/40"
              }
            >
              <div
                className={
                  embedded
                    ? "flex flex-wrap items-center gap-1 px-1.5 py-1"
                    : "flex flex-wrap items-center gap-2 px-2 py-2"
                }
              >
                <button
                  type="button"
                  onClick={() => toggleExpand(r.id)}
                  className="min-w-0 flex-1 text-left"
                >
                  <span
                    className={`mr-2 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${STATUS_STYLES[r.status]}`}
                  >
                    {STATUS_LABELS[r.status]}
                  </span>
                  <span className="font-mono text-xs text-slate-400">
                    {r.id.slice(0, 8)}…
                  </span>
                  <span className="ml-2 text-xs text-slate-500">
                    {formatWhen(r.startedAt)}
                  </span>
                </button>
                <a
                  href={`${base}/playwright-report/index.html`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-sky-400 underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  리포트
                </a>
                <button
                  type="button"
                  className="text-xs text-violet-300 underline"
                  onClick={() => void openScript(r.id)}
                >
                  스크립트
                </button>
                <button
                  type="button"
                  className="text-xs text-rose-400 hover:underline"
                  onClick={() => void removeRun(r.id)}
                >
                  삭제
                </button>
              </div>
              {expanded ? (
                <div className="border-t border-slate-800/80 px-2 py-2 text-xs">
                  {detailLoadingId === r.id ? (
                    <p className="text-slate-500">
                      상세 불러오는 중…
                    </p>
                  ) : detail ? (
                    <div className="flex flex-col gap-3">
                      <div className="flex flex-wrap gap-3 text-slate-400">
                        <span>
                          종료:{" "}
                          {detail.finishedAt
                            ? formatWhen(detail.finishedAt)
                            : "—"}
                        </span>
                        {detail.exitCode != null ? (
                          <span>exit {detail.exitCode}</span>
                        ) : null}
                        <a
                          href={detail.artifacts?.testResultsDir ?? "#"}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sky-400 underline"
                        >
                          테스트 결과
                        </a>
                      </div>
                      {detail.errorMessage ? (
                        <p className="text-rose-300">{detail.errorMessage}</p>
                      ) : null}
                      {detail.artifacts?.videoUrls &&
                      detail.artifacts.videoUrls.length > 0 ? (
                        <div className="flex flex-col gap-2">
                          <span className="font-medium text-slate-500">
                            {`영상 (${detail.artifacts.videoUrls.length})`}
                          </span>
                          {detail.artifacts.videoUrls.map((src) => (
                            <video
                              key={src}
                              controls
                              className={
                                embedded
                                  ? "max-h-32 w-full max-w-full rounded border border-slate-700 bg-black"
                                  : "max-h-48 w-full max-w-lg rounded border border-slate-700 bg-black"
                              }
                              src={src}
                            >
                              <track kind="captions" />
                            </video>
                          ))}
                        </div>
                      ) : null}
                      {detail.artifacts?.screenshotUrls &&
                      detail.artifacts.screenshotUrls.length > 0 ? (
                        <div className="flex flex-col gap-2">
                          <span className="font-medium text-slate-500">
                            {`스크린샷 (${detail.artifacts.screenshotUrls.length})`}
                          </span>
                          <div className="flex gap-2 overflow-x-auto pb-1">
                            {detail.artifacts.screenshotUrls.map((src) => (
                              <a
                                key={src}
                                href={src}
                                target="_blank"
                                rel="noreferrer"
                                className="flex-shrink-0"
                              >
                                <img
                                  src={src}
                                  alt=""
                                  className="h-24 w-auto rounded border border-slate-700 object-contain"
                                />
                              </a>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <p className="text-slate-500">
                      상세를 불러오지 못했습니다.
                    </p>
                  )}
                </div>
              ) : null}
            </li>
          );
        })}
          </ul>
        </div>
      </div>

      {scriptModal ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={scriptModal.title ?? "scenario.spec.ts"}
        >
          <div className="flex max-h-[85vh] w-full max-w-3xl flex-col gap-2 rounded-lg border border-slate-700 bg-slate-950 p-4 shadow-xl">
            <div className="flex items-center justify-between gap-2">
              <h4 className="font-mono text-sm text-slate-200">
                {scriptModal.title ?? "scenario.spec.ts"} —{" "}
                {scriptModal.runId.slice(0, 8)}…
              </h4>
              <button
                type="button"
                className="rounded px-2 py-1 text-xs text-slate-400 hover:bg-slate-800"
                onClick={() => setScriptModal(null)}
              >
                닫기
              </button>
            </div>
            <pre className="max-h-[70vh] overflow-auto rounded border border-slate-800 bg-slate-900/80 p-3 font-mono text-[11px] leading-relaxed text-slate-300">
              {scriptModal.text}
            </pre>
          </div>
        </div>
      ) : null}
    </section>
  );
}
