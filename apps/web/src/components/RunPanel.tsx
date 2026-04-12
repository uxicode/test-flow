import type { RefObject } from "react";
import type { SmartTC } from "../types";

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

const ACTION_BADGE: Record<SmartTC["action"], string> = {
  navigate: "bg-sky-900/60 text-sky-200",
  click: "bg-violet-900/60 text-violet-200",
  fill: "bg-emerald-900/60 text-emerald-200",
  check: "bg-teal-900/60 text-teal-200",
  assert: "bg-amber-900/60 text-amber-200",
  wait: "bg-slate-700 text-slate-300",
  screenshot: "bg-rose-900/60 text-rose-200",
};

const ACTION_LABEL: Record<SmartTC["action"], string> = {
  navigate: "이동",
  click: "클릭",
  fill: "입력",
  check: "체크",
  assert: "검증",
  wait: "대기",
  screenshot: "캡처",
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
  lastRecording: {
    sessionKind: "codegen" | "hosted";
    artifacts: { videoUrl: string; traceUrl: string };
  } | null;
  smartTc: SmartTC[] | null;
  onClearSmartTc: () => void;
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
  lastRecording,
  smartTc,
  onClearSmartTc,
}: Props) {
  const isRunning = status === "running" || isStarting;
  const shots = summary?.artifacts?.screenshotUrls ?? [];
  const runVideos = summary?.artifacts?.videoUrls ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div
        role="note"
        className="rounded-lg border border-amber-900/50 bg-amber-950/30 px-4 py-3 text-sm leading-relaxed text-amber-100/90"
      >
        <p className="font-medium text-amber-50">테스트 실행과 녹화</p>
        <p className="mt-1 text-xs text-amber-100/80">
          테스트 실행은 이 PC에 설치된 <strong>Playwright + Chromium</strong>으로
          동작합니다 (Docker 불필요). <strong>녹화</strong>는 Chromium 브라우저 창을
          띄웁니다. 종료하면 빌더와 Smart TC 패널에 스텝이 반영됩니다. 실행 중에는{" "}
          <strong>로그</strong>, <strong>스크린샷</strong>, <strong>영상</strong>을 보고
          완료 후 <strong>HTML 리포트</strong>를 확인할 수 있습니다.
        </p>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-slate-800 bg-slate-900/40 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex min-w-[200px] flex-1 flex-col gap-1">
            <label className="text-xs text-slate-500">녹화 시작 URL</label>
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

      {smartTc && smartTc.length > 0 ? (
        <section className="flex flex-col gap-3 rounded-xl border border-emerald-800/50 bg-emerald-950/20 p-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-emerald-300">
                스마트 TC — 녹화 산출물
              </h3>
              <p className="mt-0.5 text-xs text-slate-500">
                {smartTc.length}개 스텝이 자동 변환되었습니다. 검증 후 저장하세요.
              </p>
            </div>
            <button
              type="button"
              onClick={onClearSmartTc}
              className="rounded px-2 py-1 text-xs text-slate-500 hover:bg-slate-800 hover:text-slate-300"
            >
              닫기
            </button>
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-900/80 text-left text-xs text-slate-500">
                  <th className="px-3 py-2 font-medium">#</th>
                  <th className="px-3 py-2 font-medium">액션</th>
                  <th className="px-3 py-2 font-medium">대상</th>
                  <th className="px-3 py-2 font-medium">설명</th>
                  <th className="px-3 py-2 font-medium">셀렉터 코드</th>
                </tr>
              </thead>
              <tbody>
                {smartTc.map((tc) => (
                  <tr
                    key={tc.step}
                    className="border-b border-slate-800/60 bg-slate-900/30 hover:bg-slate-800/40"
                  >
                    <td className="px-3 py-2.5 font-mono text-xs text-slate-500">
                      {tc.step}
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`rounded-full px-2 py-0.5 whitespace-nowrap text-xs font-semibold ${ACTION_BADGE[tc.action]}`}
                      >
                        {ACTION_LABEL[tc.action]}
                      </span>
                    </td>
                    <td className="max-w-[180px] truncate px-3 py-2.5 text-xs text-slate-300">
                      {tc.target}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-slate-200">
                      {tc.description}
                    </td>
                    <td className="px-3 py-2.5">
                      <code className="block max-w-[220px] truncate rounded bg-slate-900 px-2 py-1 font-mono text-[11px] text-emerald-300">
                        {tc.selector}
                      </code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <details className="text-xs text-slate-500">
            <summary className="cursor-pointer select-none hover:text-slate-400">
              JSON 원문 보기
            </summary>
            <pre className="mt-2 max-h-64 overflow-auto rounded-lg border border-slate-800 bg-slate-900/60 p-3 font-mono text-[11px] leading-relaxed text-slate-300">
              {JSON.stringify(smartTc, null, 2)}
            </pre>
          </details>
        </section>
      ) : null}

      {lastRecording &&
      (lastRecording.artifacts.videoUrl || lastRecording.artifacts.traceUrl) ? (
        <section className="flex flex-col gap-2 rounded-lg border border-violet-900/40 bg-violet-950/20 p-4">
          <h3 className="text-sm font-semibold text-violet-200">최근 녹화 세션</h3>
          <p className="text-xs text-slate-500">
            녹화에서 저장된 파일입니다. (WebM 및 트레이스)
          </p>
          <div className="flex flex-wrap gap-4 text-sm">
            {lastRecording.artifacts.videoUrl ? (
              <a
                href={lastRecording.artifacts.videoUrl}
                target="_blank"
                rel="noreferrer"
                className="text-violet-300 underline underline-offset-2 hover:text-violet-200"
              >
                세션 영상 (WebM)
              </a>
            ) : null}
            {lastRecording.artifacts.traceUrl ? (
              <a
                href={lastRecording.artifacts.traceUrl}
                target="_blank"
                rel="noreferrer"
                className="text-violet-300 underline underline-offset-2 hover:text-violet-200"
              >
                trace.zip (Playwright 트레이스)
              </a>
            ) : null}
          </div>
          {lastRecording.artifacts.videoUrl ? (
            <video
              controls
              className="mt-2 max-h-64 w-full max-w-lg rounded border border-slate-700 bg-black"
              src={lastRecording.artifacts.videoUrl}
            >
              <track kind="captions" />
            </video>
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

      {runVideos.length > 0 ? (
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
