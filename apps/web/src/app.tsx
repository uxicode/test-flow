import { useEffect, useRef, useState } from "react";
import { ActionButton } from "./components/action-button";
import { LogPanel } from "./components/log-panel";
import { TcDocument } from "./components/tc-document";
import type { TcInput } from "@testflow/tc";
import {
  getJson,
  openLogSocket,
  postJson,
  type AnalysisView,
  type LogEvent,
  type RunView,
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
const STORED_FIGMA_TOKEN = "testflow.figma-token";
const STORED_ACCOUNT_EMAIL = "testflow.account-email";
const STORED_ACCOUNT_PASSWORD = "testflow.account-password";
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
  const [token, setToken] = useState(() => readStored(STORED_FIGMA_TOKEN));
  const [specText, setSpecText] = useState("");
  const [jobId, setJobId] = useState("");
  const [status, setStatus] = useState("");
  const [cases, setCases] = useState<TestCase[]>([]);
  const [screenCount, setScreenCount] = useState(0);
  const [logs, setLogs] = useState<LogEvent[]>([]);
  const [startUrl, setStartUrl] = useState(() => readSession(STORED_START_URL) || "https://");
  const [accountEmail, setAccountEmail] = useState(() => readStored(STORED_ACCOUNT_EMAIL));
  const [accountPassword, setAccountPassword] = useState(() => readStored(STORED_ACCOUNT_PASSWORD));
  const [values, setValues] = useState<Record<string, Record<string, string>>>({});
  const [runIds, setRunIds] = useState<Record<string, string>>({});
  const [caseState, setCaseState] = useState<Record<string, string>>({});
  const [errorMessage, setErrorMessage] = useState("");
  const [isWorking, setIsWorking] = useState(false);
  const [busyAction, setBusyAction] = useState<"analyze" | "text" | "cancel" | "refresh" | "stop-run" | null>(null);
  const [runningCaseId, setRunningCaseId] = useState("");
  const [editingInputKey, setEditingInputKey] = useState("");
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    return () => {
      socketRef.current?.close();
    };
  }, []);

  useEffect(() => {
    writeStored(STORED_FIGMA_URL, figmaUrl);
  }, [figmaUrl]);

  useEffect(() => {
    writeStored(STORED_FIGMA_TOKEN, token);
  }, [token]);

  useEffect(() => {
    writeStored(STORED_ACCOUNT_EMAIL, accountEmail);
  }, [accountEmail]);

  useEffect(() => {
    writeStored(STORED_ACCOUNT_PASSWORD, accountPassword);
  }, [accountPassword]);

  useEffect(() => {
    writeSession(STORED_START_URL, startUrl);
  }, [startUrl]);

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
    await startAnalysis({ url: figmaUrl, token }, "analyze");
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
    const own = { ...(values[testCase.id] ?? {}) };
    for (const input of testCase.inputs) {
      if (own[input.target]?.trim()) continue;
      if (ACCOUNT_EMAIL.test(input.target)) own[input.target] = accountEmail;
      if (ACCOUNT_PASSWORD.test(input.target)) own[input.target] = accountPassword;
    }
    return own;
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
        loginEmail: accountEmail,
        loginPassword: accountPassword,
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
    if (ACCOUNT_PASSWORD.test(input.target)) return typed ? "입력됨" : "상단 공통 입력";
    if (typed) return typed;
    if (isAccountField(input.target)) return "상단 공통 입력";
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
          <label className="w-56 shrink-0 space-y-1 text-xs text-slate-400">
            액세스 토큰
            <input
              type="password"
              autoComplete="off"
              className="block w-full rounded-md border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-slate-100"
              placeholder="엑세스 토큰"
              value={token}
              onChange={(event) => setToken(event.target.value)}
            />
          </label>
        </div>
        <div className="flex gap-2">
          <ActionButton
            label="피그마 분석"
            variant="primary"
            busy={busyAction === "analyze"}
            busyLabel="피그마 분석 중…"
            disabled={isWorking || !figmaUrl || !token}
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

      {errorMessage ? <p className="text-sm text-rose-300">{errorMessage}</p> : null}

      <section className="space-y-3 rounded-xl border border-slate-700 bg-slate-900/70 p-4">
        <h2 className="text-sm font-medium">실행</h2>
        <p className="text-xs text-slate-400">
          어드민처럼 로그인이 필요하면 아래 계정으로 먼저 들어간 뒤 TC를 실행합니다. 시작 주소는 로그인 페이지가 아니라
          검사할 화면 주소로 넣으세요. 로그인 TC는 이 단계를 건너뜁니다.
        </p>
        <div className="flex items-end gap-3">
          <label className="min-w-0 flex-1 space-y-1 text-xs text-slate-400">
            이메일 또는 아이디
            <input
              className="block w-full rounded-md border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-slate-100"
              value={accountEmail}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              data-1p-ignore="true"
              data-lpignore="true"
              readOnly={editingInputKey !== "shared:email"}
              onFocus={() => setEditingInputKey("shared:email")}
              onChange={(event) => setAccountEmail(event.target.value)}
            />
          </label>
          <label className="w-56 shrink-0 space-y-1 text-xs text-slate-400">
            비밀번호
            <input
              type="password"
              className="block w-full rounded-md border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-slate-100"
              value={accountPassword}
              autoComplete="off"
              data-1p-ignore="true"
              data-lpignore="true"
              readOnly={editingInputKey !== "shared:password"}
              onFocus={() => setEditingInputKey("shared:password")}
              onChange={(event) => setAccountPassword(event.target.value)}
            />
          </label>
        </div>
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
                      <span>
                        {input.target}
                        {controlLabel(input)}
                        {input.options?.length ? ` · ${input.options.join(" / ")}` : ""}
                      </span>
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
                              : /비밀번호/.test(input.target)
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
