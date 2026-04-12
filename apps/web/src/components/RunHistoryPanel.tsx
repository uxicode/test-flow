import { useCallback, useEffect, useState } from "react";

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

const STATUS_STYLES: Record<PersistedRunStatus, string> = {
  queued: "bg-amber-900/60 text-amber-100",
  running: "bg-sky-900/60 text-sky-100",
  passed: "bg-emerald-900/60 text-emerald-100",
  failed: "bg-rose-900/60 text-rose-100",
  error: "bg-rose-950 text-rose-200",
};

const STATUS_LABELS: Record<PersistedRunStatus, string> = {
  queued: "\uB300\uAE30",
  running: "\uC2E4\uD589 \uC911",
  passed: "\uC131\uACF5",
  failed: "\uC2E4\uD328",
  error: "\uC624\uB958",
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
  } | null>(null);

  const loadList = useCallback(async () => {
    setBusy(true);
    setLoadError(null);
    try {
      const q = new URLSearchParams({ scenarioId });
      const res = await fetch(`/api/runs?${q}`);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const data = (await res.json()) as RunHistoryRow[];
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setLoadError((e as Error).message);
      setRows([]);
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
          text: "(\uC774 \uC2E4\uD589\uC5D0 scenario.spec.ts\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.)",
        });
        return;
      }
      const text = await res.text();
      setScriptModal({ runId, text });
    } catch {
      setScriptModal({ runId, text: "(\uC2A4\uD06C\uB9BD\uD2B8 \uBD88\uB7EC\uC624\uAE30 \uC2E4\uD328)" });
    }
  }

  async function removeRun(runId: string): Promise<void> {
    if (
      !confirm(
        `\uC2E4\uD589 \uAE30\uB85D ${runId.slice(0, 8)}\u2026 \uBC0F \uC0B0\uCD9C\uBB3C\uC744 \uB514\uC2A4\uD06C\uC5D0\uC11C \uC0AD\uC81C\uD560\uAE4C\uC694?`,
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
            {busy ? "\uBD88\uB7EC\uC624\uB294 \uC911\u2026" : "\uC0C8\uB85C\uACE0\uCE68"}
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-300">
            {"\uC2E4\uD589 \uAE30\uB85D"}
          </h3>
          <button
            type="button"
            onClick={() => void loadList()}
            disabled={busy}
            className="rounded border border-slate-600 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-50"
          >
            {busy ? "\uBD88\uB7EC\uC624\uB294 \uC911\u2026" : "\uC0C8\uB85C\uACE0\uCE68"}
          </button>
        </div>
      )}
      {!embedded ? (
        <p className="text-xs text-slate-500">
          {
            "\uC800\uC7A5\uB41C Playwright \uB9AC\uD3EC\uD2B8, \uC601\uC0C1, \uD14C\uC2A4\uD2B8 \uACB0\uACFC, \uC2A4\uD06C\uB9BD\uD2B8\uB97C \uC5F4\uAC70\uB098 \uB514\uC2A4\uD06C\uC5D0\uC11C \uC0AD\uC81C\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4. \uD589\uC744 \uD3BC\uCCD0 \uC601\uC0C1\u00B7\uC2A4\uD06C\uB9B0\uC0F7\uC744 \uD655\uC778\uD558\uC138\uC694."
          }
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
      {rows.length === 0 && !busy ? (
        <p
          className={
            embedded ? "text-[10px] text-slate-600" : "text-xs text-slate-600"
          }
        >
          {"\uC800\uC7A5\uB41C \uC2E4\uD589\uC774 \uC5C6\uC2B5\uB2C8\uB2E4."}
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
                  {"\uB9AC\uD3EC\uD2B8"}
                </a>
                <button
                  type="button"
                  className="text-xs text-violet-300 underline"
                  onClick={() => void openScript(r.id)}
                >
                  {"\uC2A4\uD06C\uB9BD\uD2B8"}
                </button>
                <button
                  type="button"
                  className="text-xs text-rose-400 hover:underline"
                  onClick={() => void removeRun(r.id)}
                >
                  {"\uC0AD\uC81C"}
                </button>
              </div>
              {expanded ? (
                <div className="border-t border-slate-800/80 px-2 py-2 text-xs">
                  {detailLoadingId === r.id ? (
                    <p className="text-slate-500">
                      {"\uC0C1\uC138 \uBD88\uB7EC\uC624\uB294 \uC911\u2026"}
                    </p>
                  ) : detail ? (
                    <div className="flex flex-col gap-3">
                      <div className="flex flex-wrap gap-3 text-slate-400">
                        <span>
                          {"\uC885\uB8CC:"}{" "}
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
                          {"\uD14C\uC2A4\uD2B8 \uACB0\uACFC"}
                        </a>
                      </div>
                      {detail.errorMessage ? (
                        <p className="text-rose-300">{detail.errorMessage}</p>
                      ) : null}
                      {detail.artifacts?.videoUrls &&
                      detail.artifacts.videoUrls.length > 0 ? (
                        <div className="flex flex-col gap-2">
                          <span className="font-medium text-slate-500">
                            {`\uC601\uC0C1 (${detail.artifacts.videoUrls.length})`}
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
                            {`\uC2A4\uD06C\uB9B0\uC0F7 (${detail.artifacts.screenshotUrls.length})`}
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
                      {
                        "\uC0C1\uC138\uB97C \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4."
                      }
                    </p>
                  )}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      {scriptModal ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={"\uC2E4\uD589 \uC2A4\uD06C\uB9BD\uD2B8"}
        >
          <div className="flex max-h-[85vh] w-full max-w-3xl flex-col gap-2 rounded-lg border border-slate-700 bg-slate-950 p-4 shadow-xl">
            <div className="flex items-center justify-between gap-2">
              <h4 className="font-mono text-sm text-slate-200">
                scenario.spec.ts — {scriptModal.runId.slice(0, 8)}…
              </h4>
              <button
                type="button"
                className="rounded px-2 py-1 text-xs text-slate-400 hover:bg-slate-800"
                onClick={() => setScriptModal(null)}
              >
                {"\uB2EB\uAE30"}
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
