import { useState, type RefObject } from "react";
import type { RunStatus, RunSummary } from "../domain/run-types";
import type { SmartTC } from "../types";
import { downloadSmartTcExcel } from "../utils/smartTcToExcel";
import { LiveStudioPanel } from "./LiveStudioPanel";
import { SmartTcTable } from "./SmartTcTable";

const STATUS_STYLES: Record<RunStatus, string> = {
  idle: "bg-slate-700 text-slate-300",
  queued: "bg-amber-900/60 text-amber-100",
  running: "bg-sky-900/60 text-sky-100",
  passed: "bg-emerald-900/60 text-emerald-100",
  failed: "bg-rose-900/60 text-rose-100",
  error: "bg-rose-950 text-rose-200",
};

const STATUS_LABELS: Record<RunStatus, string> = {
  idle: "대기",
  queued: "대기열",
  running: "실행 중",
  passed: "성공",
  failed: "실패",
  error: "오류",
};

interface Props {
  status: RunStatus;
  runId: string | null;
  log: string;
  summary: RunSummary | null;
  logEndRef: RefObject<HTMLDivElement>;
  isStarting: boolean;
  canRun: boolean;
  onRun: () => void;
  recordUrl: string;
  onRecordUrlChange: (v: string) => void;
  isRecording: boolean;
  onStartRecord: () => void;
  onStopRecord: () => void;
  liveSessionId: string | null;
  lastRecording: {
    sessionKind: "codegen" | "hosted";
    artifacts: { videoUrl: string };
  } | null;
  smartTc: SmartTC[] | null;
  scenarioName: string;
}

export function RunPanel({
  status,
  runId,
  log,
  summary,
  logEndRef,
  isStarting,
  canRun,
  onRun,
  recordUrl,
  onRecordUrlChange,
  isRecording,
  onStartRecord,
  onStopRecord,
  liveSessionId,
  lastRecording,
  smartTc,
  scenarioName,
}: Props) {
  const isRunning = status === "running" || isStarting;
  const shots = summary?.artifacts?.screenshotUrls ?? [];
  const runVideos = summary?.artifacts?.videoUrls ?? [];
  /** 녹화 산출물이 있으면 같은 WebM이 실행 요약에도 잡혀 하단 ‘실행 영상’과 중복된다 */
  const hasRecordingOutputs =
    Boolean(lastRecording?.artifacts.videoUrl) ||
    Boolean(smartTc && smartTc.length > 0);
  const [isNoteVisible, setIsNoteVisible] = useState(false);
  const [isSmartTcOpen, setIsSmartTcOpen] = useState(true);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-lg border border-slate-800 bg-slate-900/40 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex min-w-[200px] flex-1 flex-col gap-1">
            <label className="flex items-center gap-1 text-xs text-slate-500">
              녹화 시작 URL
              <span
                className="relative"
                onMouseEnter={() => setIsNoteVisible(true)}
                onMouseLeave={() => setIsNoteVisible(false)}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="h-3.5 w-3.5 cursor-help text-amber-400/70 hover:text-amber-300"
                >
                  <path
                    fillRule="evenodd"
                    d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-7-4a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM9 9a.75.75 0 0 0 0 1.5h.253a.25.25 0 0 1 .244.304l-.459 2.066A1.75 1.75 0 0 0 10.747 15H11a.75.75 0 0 0 0-1.5h-.253a.25.25 0 0 1-.244-.304l.459-2.066A1.75 1.75 0 0 0 9.253 9H9Z"
                    clipRule="evenodd"
                  />
                </svg>
                {isNoteVisible && (
                  <div
                    role="note"
                    className="absolute bottom-full left-0 z-50 mb-2 w-80 rounded-lg border border-amber-900/50 bg-amber-950/95 px-4 py-3 text-sm leading-relaxed text-amber-100/90 shadow-xl backdrop-blur-sm"
                  >
                    <p className="font-medium text-amber-50">테스트 실행과 녹화</p>
                    <p className="mt-1 text-xs text-amber-100/80">
                      테스트 실행은 이 PC에 설치된 <strong>Playwright + Chromium</strong>으로
                      동작합니다 (Docker 불필요). <strong>녹화</strong>는 Chromium 브라우저 창을
                      띄웁니다. 종료하면 빌더에 스텝이 반영되고, 세션 폴더에{" "}
                      <strong>영상(WebM)</strong>·<strong>steps.json</strong>·
                      <strong>smartTc.json</strong>이 함께 저장됩니다. 실행 중에는{" "}
                      <strong>로그</strong>, <strong>스크린샷</strong>, <strong>영상</strong>을 보고
                      완료 후 <strong>HTML 리포트</strong>를 확인할 수 있습니다.
                    </p>
                  </div>
                )}
              </span>
            </label>
            <input
              type="url"
              value={recordUrl}
              onChange={(e) => onRecordUrlChange(e.target.value)}
              disabled={isRecording}
              className="rounded border border-slate-600 bg-slate-900 px-2 py-1.5 text-xs text-slate-200 focus:border-sky-500 focus:outline-none disabled:opacity-50"
              placeholder="https://..."
            />
          </div>
          {!isRecording ? (
            <button
              type="button"
              onClick={onStartRecord}
              className="rounded-lg border border-violet-600 px-4 py-2 text-sm font-medium text-violet-200 hover:bg-violet-900/40"
            >
              녹화 시작
            </button>
          ) : (
            <button
              type="button"
              onClick={onStopRecord}
              className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500"
            >
              녹화 종료
            </button>
          )}
        </div>
        <p className="text-xs text-slate-600">
          녹화 종료 후 파싱된 스텝은 <strong>빌더</strong>에 반영되고, 생성된 코드는{" "}
          <strong>스크립트</strong> 탭에도 저장됩니다. 데스크톱 앱(Electron)에서는 API,
          UI, 녹화용 브라우저가 함께 동작합니다.
        </p>

        <div className="flex flex-wrap items-center gap-3 border-t border-slate-800 pt-3">
          <button
            type="button"
            onClick={onRun}
            disabled={isRunning || !canRun}
            className="rounded-lg bg-sky-600 px-5 py-2 text-sm font-medium text-white shadow transition-colors hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isStarting ? "시작 중…" : "테스트 실행"}
          </button>
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${STATUS_STYLES[status]} ${status === "running" ? "animate-pulse" : ""}`}
          >
            {STATUS_LABELS[status]}
          </span>
          {runId ? (
            <span className="font-mono text-xs text-slate-500">실행 {runId}</span>
          ) : null}
        </div>
      </div>

      {isRecording && liveSessionId ? (
        <LiveStudioPanel
          sessionId={liveSessionId}
          recordUrl={recordUrl}
          onStop={onStopRecord}
        />
      ) : null}

      {lastRecording?.artifacts.videoUrl ||
      (smartTc && smartTc.length > 0) ? (
        <section className="flex flex-col gap-3 rounded-xl border border-violet-900/40 bg-gradient-to-b from-violet-950/25 to-emerald-950/15 p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-violet-200">
                녹화 산출물
              </h3>
              <p className="mt-0.5 text-xs text-slate-500">
                호스트 녹화로 저장된 영상(WebM)과 Smart TC를 함께 확인합니다.
                시나리오를 저장하면 실행 기록에도 동일 산출물이 남습니다.
              </p>
            </div>
          </div>

          {lastRecording?.artifacts.videoUrl ? (
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap gap-3 text-sm">
                <a
                  href={lastRecording.artifacts.videoUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-violet-300 underline underline-offset-2 hover:text-violet-200"
                >
                  세션 영상 (WebM) 새 탭
                </a>
              </div>
              <video
                controls
                className="max-h-64 w-full max-w-lg rounded border border-slate-700 bg-black"
                src={lastRecording.artifacts.videoUrl}
              >
                <track kind="captions" />
              </video>
            </div>
          ) : null}

          {smartTc && smartTc.length > 0 ? (
            <div className="flex flex-col gap-2 border-t border-slate-800/80 pt-3">
              <button
                type="button"
                onClick={() => setIsSmartTcOpen((open) => !open)}
                aria-expanded={isSmartTcOpen}
                className="flex w-full items-center justify-between gap-3 rounded-lg border border-slate-700/80 bg-slate-900/50 px-3 py-2 text-left transition-colors hover:border-slate-600 hover:bg-slate-800/40"
              >
                <span className="text-xs font-medium text-emerald-300/90">
                  스마트 TC ({smartTc.length}개)
                  <span className="ml-2 font-normal text-slate-500">
                    {isSmartTcOpen ? "접기" : "펼치기"}
                  </span>
                </span>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${isSmartTcOpen ? "rotate-180" : ""}`}
                  aria-hidden
                >
                  <path
                    fillRule="evenodd"
                    d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.938a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
              {isSmartTcOpen ? (
                <div className="flex flex-col gap-2 rounded-lg border border-slate-800/90 bg-slate-950/30 p-3">
                  <div className="flex flex-wrap justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        const base = scenarioName.trim() || "smart-tc";
                        downloadSmartTcExcel(smartTc, {
                          policyId: "SMART-TC",
                          sheetName: "Sheet1",
                          fileName: `${base}-smartTc`,
                        });
                      }}
                      className="rounded-lg border border-emerald-700/60 bg-emerald-950/40 px-3 py-1.5 text-xs font-medium text-emerald-200 hover:bg-emerald-900/50"
                    >
                      엑셀(.xlsx) 다운로드
                    </button>
                  </div>
                  <SmartTcTable items={smartTc} />
                  <details className="text-xs text-slate-500">
                    <summary className="cursor-pointer select-none hover:text-slate-400">
                      smartTc.json 원문 보기
                    </summary>
                    <pre className="mt-2 max-h-64 overflow-auto rounded-lg border border-slate-800 bg-slate-900/60 p-3 font-mono text-[11px] leading-relaxed text-slate-300">
                      {JSON.stringify(smartTc, null, 2)}
                    </pre>
                  </details>
                </div>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}

      {summary?.artifacts ? (
        <section className="flex flex-col gap-2 rounded-lg border border-slate-800 bg-slate-900/40 p-4">
          <h3 className="text-sm font-semibold text-slate-300">결과 파일</h3>
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <a
              href={summary.artifacts.reportIndex}
              target="_blank"
              rel="noreferrer"
              className="text-sky-400 underline underline-offset-2 hover:text-sky-300"
            >
              HTML 리포트
            </a>
            <span className="text-xs text-slate-500">
              트레이스 등:{" "}
              <code className="text-slate-400">
                {summary.artifacts.testResultsDir}
              </code>
            </span>
          </div>
          {summary.errorMessage ? (
            <p className="text-sm text-rose-300">{summary.errorMessage}</p>
          ) : null}
        </section>
      ) : null}

      {runVideos.length > 0 && !hasRecordingOutputs ? (
        <section className="flex flex-col gap-2 rounded-lg border border-slate-800 bg-slate-900/40 p-4">
          <h3 className="text-sm font-semibold text-slate-300">
            실행 영상 ({runVideos.length})
          </h3>
          <p className="text-xs text-slate-500">
            환경 변수 <code className="text-slate-400">TESTFLOW_RUN_VIDEO=always</code>
            로 매 실행마다 WebM을 <code className="text-slate-400">test-results</code> 폴더에
            남깁니다.
          </p>
          <div className="flex flex-col gap-4">
            {runVideos.map((src) => (
              <div key={src} className="flex flex-col gap-1">
                <a
                  href={src}
                  target="_blank"
                  rel="noreferrer"
                  className="w-fit text-xs text-sky-400 underline"
                >
                  새 탭에서 열기
                </a>
                <video
                  controls
                  className="max-h-72 w-full max-w-2xl rounded border border-slate-700 bg-black"
                  src={src}
                >
                  <track kind="captions" />
                </video>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {shots.length > 0 ? (
        <section className="flex flex-col gap-2 rounded-lg border border-slate-800 bg-slate-900/40 p-4">
          <h3 className="text-sm font-semibold text-slate-300">
            스크린샷 미리보기 ({shots.length})
          </h3>
          <p className="text-xs text-slate-500">
            실패/스크린샷 스텝/설정에 따라 PNG가 생성됩니다. 실행 중에는 몇 초마다
            자동 갱신됩니다.
          </p>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {shots.map((src) => (
              <a
                key={src}
                href={src}
                target="_blank"
                rel="noreferrer"
                className="flex-shrink-0 rounded border border-slate-700 bg-slate-950 p-1 hover:border-sky-500"
              >
                <img
                  src={src}
                  alt="스크린샷"
                  className="h-40 w-auto max-w-[280px] object-contain object-top"
                />
              </a>
            ))}
          </div>
        </section>
      ) : null}

      <section className="flex flex-col gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-300">
          실시간 로그
          {status === "running" ? (
            <span className="animate-pulse text-xs font-normal text-sky-400">
              수집 중
            </span>
          ) : null}
        </h3>
        <pre className="max-h-[360px] overflow-auto rounded-lg border border-slate-800 bg-slate-900/60 p-4 font-mono text-xs leading-relaxed text-slate-200">
          {log || "테스트를 실행하면 Playwright 로그가 여기에 표시됩니다."}
          <div ref={logEndRef} />
        </pre>
      </section>
    </div>
  );
}
