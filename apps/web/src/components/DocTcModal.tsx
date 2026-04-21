import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type FormEvent,
} from "react";
import type { Step } from "../types";
import { extractDocument } from "../services/doc-tc/extractors";
import { extractRequirements } from "../services/doc-tc/extractRequirements";
import { generateTestCases } from "../services/doc-tc/generateTestCases";
import { convertTestCasesToSteps } from "../services/doc-tc/toScenarioSteps";
import {
  downloadJson,
  downloadMarkdown,
  downloadXlsx,
} from "../services/doc-tc/exports";
import { terminateOcr } from "../services/doc-tc/ocr";
import {
  DEFAULT_DOC_TC_OPTIONS,
  type DocTcOptions,
  type DocTcProgress,
  type DocTcResult,
  type GeneratedDocTestCase,
} from "../services/doc-tc/types";
import {
  clearDocTcHistory,
  deleteDocTcHistory,
  isDocTcHistoryAvailable,
  listDocTcHistory,
  saveDocTcHistory,
  type DocTcHistoryEntry,
} from "../services/doc-tc/history";

const ACCEPT_EXTENSIONS = ".pdf,.docx,.md,.hwpx,.txt";
const HISTORY_DISPLAY_LIMIT = 20;

type ModalTab = "options" | "result" | "history";

interface DocTcModalProps {
  open: boolean;
  onClose: () => void;
  hasActiveScenario: boolean;
  onSendToCurrent: (steps: Step[]) => void;
  onCreateNewScenario: (payload: { name: string; steps: Step[] }) => void;
}

function progressLabel(progress: DocTcProgress | null): string {
  if (!progress) return "";
  switch (progress.phase) {
    case "extracting":
      return progress.pageTotal
        ? `텍스트 추출 ${progress.pageCurrent}/${progress.pageTotal}`
        : "텍스트 추출 중";
    case "ocr":
      return progress.pageTotal
        ? `OCR 인식 ${progress.pageCurrent}/${progress.pageTotal}`
        : "OCR 인식 중";
    case "requirements":
      return "요구사항 분석 중";
    case "testcases":
      return "테스트케이스 생성 중";
    case "done":
      return "완료";
    case "error":
      return progress.message ?? "오류";
    default:
      return progress.message ?? "";
  }
}

function baseNameFromFile(name: string): string {
  return name.replace(/\.[^.]+$/, "");
}

export function DocTcModal({
  open,
  onClose,
  hasActiveScenario,
  onSendToCurrent,
  onCreateNewScenario,
}: DocTcModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [options, setOptions] = useState<DocTcOptions>(DEFAULT_DOC_TC_OPTIONS);
  const [progress, setProgress] = useState<DocTcProgress | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<DocTcResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<ModalTab>("options");
  const [isDragging, setIsDragging] = useState(false);
  const [history, setHistory] = useState<DocTcHistoryEntry[]>([]);
  const [isStorageAvailable, setIsStorageAvailable] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  const resetState = useCallback(() => {
    setFile(null);
    setProgress(null);
    setIsProcessing(false);
    setResult(null);
    setError(null);
    setTab("options");
    setIsDragging(false);
    if (inputRef.current) inputRef.current.value = "";
  }, []);

  useEffect(() => {
    if (!open) {
      resetState();
      return;
    }
    setIsStorageAvailable(isDocTcHistoryAvailable());
    setHistory(listDocTcHistory());
  }, [open, resetState]);

  useEffect(() => {
    return () => {
      void terminateOcr();
    };
  }, []);

  const hasResult = Boolean(result);
  const testCases = result?.testCases ?? [];
  const exportBaseName = useMemo(() => {
    if (!result) return "doc-tc";
    return `${baseNameFromFile(result.document.fileName)}_tc`;
  }, [result]);

  const handleFileChosen = (selected: File | null) => {
    if (!selected) return;
    setFile(selected);
    setResult(null);
    setError(null);
    setTab("options");
  };

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const dropped = event.dataTransfer.files?.[0];
    if (dropped) handleFileChosen(dropped);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!file || isProcessing) return;
    setIsProcessing(true);
    setError(null);
    setResult(null);
    setProgress({ phase: "extracting", message: "문서 파싱 시작" });
    try {
      const extracted = await extractDocument({
        file,
        language: options.language,
        onProgress: setProgress,
      });
      if (!extracted.text.trim()) {
        throw new Error(
          "문서에서 텍스트를 추출하지 못했습니다. OCR 결과가 비어 있거나 문서가 비어 있을 수 있습니다.",
        );
      }
      setProgress({ phase: "requirements", message: "요구사항 분석 중" });
      const requirements = extractRequirements(extracted.text);
      setProgress({ phase: "testcases", message: "테스트케이스 생성 중" });
      const generated = generateTestCases(requirements, options);
      const resultPayload: DocTcResult = {
        document: extracted.document,
        text: extracted.text,
        requirements,
        testCases: generated,
        warnings: extracted.warnings,
      };
      setResult(resultPayload);
      const saved = saveDocTcHistory(resultPayload, options);
      if (saved) {
        setHistory((prev) =>
          [saved, ...prev.filter((e) => e.id !== saved.id)].slice(
            0,
            HISTORY_DISPLAY_LIMIT,
          ),
        );
      }
      setProgress({ phase: "done", message: "완료" });
      setTab("result");
    } catch (err) {
      const message = (err as Error).message ?? String(err);
      setError(message);
      setProgress({ phase: "error", message });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSendToCurrent = () => {
    if (!result) return;
    const steps = convertTestCasesToSteps(result.testCases);
    onSendToCurrent(steps);
    onClose();
  };

  const handleCreateNew = () => {
    if (!result) return;
    const steps = convertTestCasesToSteps(result.testCases);
    const name = `${baseNameFromFile(result.document.fileName)} TC`;
    onCreateNewScenario({ name, steps });
    onClose();
  };

  const handleRestoreHistory = (entry: DocTcHistoryEntry) => {
    setResult({
      document: entry.document,
      text: "",
      requirements: entry.requirements,
      testCases: entry.testCases,
      warnings: entry.warnings,
    });
    setOptions({ ...entry.options });
    setError(null);
    setProgress(null);
    setTab("result");
  };

  const handleDeleteHistory = (id: string) => {
    setHistory(deleteDocTcHistory(id));
  };

  const handleClearHistory = () => {
    if (history.length === 0) return;
    const ok = window.confirm("문서 TC 히스토리를 모두 삭제할까요?");
    if (!ok) return;
    clearDocTcHistory();
    setHistory([]);
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl">
        <header className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-100">
              문서로 TC 만들기
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              PDF · DOCX · HWPX · MD · TXT를 업로드하면 규칙 기반으로 TC 초안을
              생성합니다. OCR은 브라우저에서 Tesseract.js로 수행합니다.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:border-slate-500"
            disabled={isProcessing}
          >
            닫기
          </button>
        </header>

        <nav className="flex gap-2 border-b border-slate-800 px-6 py-2 text-xs">
          <button
            type="button"
            onClick={() => setTab("options")}
            className={`rounded-md px-3 py-1.5 ${
              tab === "options"
                ? "bg-sky-600 text-white"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            업로드 / 옵션
          </button>
          <button
            type="button"
            onClick={() => hasResult && setTab("result")}
            disabled={!hasResult}
            className={`rounded-md px-3 py-1.5 ${
              tab === "result"
                ? "bg-sky-600 text-white"
                : "text-slate-400 hover:text-slate-200"
            } ${hasResult ? "" : "cursor-not-allowed opacity-50"}`}
          >
            결과 {hasResult ? `(${testCases.length})` : ""}
          </button>
          <button
            type="button"
            onClick={() => setTab("history")}
            className={`rounded-md px-3 py-1.5 ${
              tab === "history"
                ? "bg-sky-600 text-white"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            히스토리 {history.length > 0 ? `(${history.length})` : ""}
          </button>
        </nav>

        <div className="flex-1 overflow-y-auto px-6 py-4 text-sm text-slate-200">
          {tab === "history" ? (
            <HistoryView
              history={history}
              isStorageAvailable={isStorageAvailable}
              onRestore={handleRestoreHistory}
              onDelete={handleDeleteHistory}
              onClearAll={handleClearHistory}
            />
          ) : tab === "options" ? (
            <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
              <label
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                className={`flex min-h-[120px] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 text-xs text-slate-400 transition ${
                  isDragging
                    ? "border-sky-500 bg-sky-950/40 text-sky-200"
                    : "border-slate-700 hover:border-slate-500"
                }`}
              >
                <input
                  ref={inputRef}
                  type="file"
                  accept={ACCEPT_EXTENSIONS}
                  className="hidden"
                  onChange={(e) => handleFileChosen(e.target.files?.[0] ?? null)}
                />
                {file ? (
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-sm text-slate-200">{file.name}</span>
                    <span className="text-[11px] text-slate-500">
                      {(file.size / 1024).toFixed(1)} KB · {file.type || "unknown"}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        handleFileChosen(null as unknown as File);
                        setFile(null);
                        if (inputRef.current) inputRef.current.value = "";
                      }}
                      className="mt-1 rounded-md border border-slate-600 px-2 py-0.5 text-[11px] text-slate-300 hover:border-slate-400"
                    >
                      다른 파일 선택
                    </button>
                  </div>
                ) : (
                  <>
                    <span className="text-sm text-slate-300">
                      파일을 드래그하거나 클릭해 업로드
                    </span>
                    <span className="text-[11px] text-slate-500">
                      지원 형식: PDF / DOCX / HWPX / MD / TXT
                    </span>
                  </>
                )}
              </label>

              <fieldset className="grid grid-cols-1 gap-3 rounded-lg border border-slate-800 bg-slate-950/40 p-4 sm:grid-cols-2">
                <legend className="px-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                  생성 옵션
                </legend>
                <label className="flex items-center gap-2 text-xs text-slate-300">
                  <input
                    type="checkbox"
                    checked={options.includeNegative}
                    onChange={(e) =>
                      setOptions((prev) => ({
                        ...prev,
                        includeNegative: e.target.checked,
                      }))
                    }
                  />
                  부정/예외 케이스 포함
                </label>
                <label className="flex items-center gap-2 text-xs text-slate-300">
                  <input
                    type="checkbox"
                    checked={options.includeBoundary}
                    onChange={(e) =>
                      setOptions((prev) => ({
                        ...prev,
                        includeBoundary: e.target.checked,
                      }))
                    }
                  />
                  경계 값 케이스 포함
                </label>
                <label className="flex flex-col gap-1 text-xs text-slate-300">
                  요구사항당 최대 TC 수
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={options.maxCasesPerRequirement}
                    onChange={(e) =>
                      setOptions((prev) => ({
                        ...prev,
                        maxCasesPerRequirement: Math.max(
                          1,
                          Math.min(20, Number(e.target.value) || 1),
                        ),
                      }))
                    }
                    className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-slate-300">
                  OCR 언어
                  <select
                    value={options.language}
                    onChange={(e) =>
                      setOptions((prev) => ({
                        ...prev,
                        language: e.target.value as DocTcOptions["language"],
                      }))
                    }
                    className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200"
                  >
                    <option value="ko">한국어 + 영어 (kor+eng)</option>
                    <option value="en">영어 (eng)</option>
                  </select>
                </label>
              </fieldset>

              {progress && (
                <div className="rounded-md border border-slate-800 bg-slate-950/40 px-3 py-2 text-xs text-slate-300">
                  <div className="flex items-center justify-between">
                    <span>{progressLabel(progress)}</span>
                    {progress.pageCurrent && progress.pageTotal ? (
                      <span className="text-[11px] text-slate-500">
                        {progress.pageCurrent} / {progress.pageTotal}
                      </span>
                    ) : null}
                  </div>
                </div>
              )}
              {error && (
                <div className="rounded-md border border-rose-800 bg-rose-950/50 px-3 py-2 text-xs text-rose-200">
                  {error}
                </div>
              )}

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isProcessing}
                  className="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:border-slate-500"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={!file || isProcessing}
                  className="rounded-md bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isProcessing ? "처리 중…" : "TC 생성"}
                </button>
              </div>
            </form>
          ) : (
            <ResultView
              testCases={testCases}
              warnings={result?.warnings ?? []}
              exportBaseName={exportBaseName}
              onSendToCurrent={handleSendToCurrent}
              onCreateNewScenario={handleCreateNew}
              hasActiveScenario={hasActiveScenario}
            />
          )}
        </div>
      </div>
    </div>
  );
}

interface ResultViewProps {
  testCases: GeneratedDocTestCase[];
  warnings: string[];
  exportBaseName: string;
  onSendToCurrent: () => void;
  onCreateNewScenario: () => void;
  hasActiveScenario: boolean;
}

function ResultView({
  testCases,
  warnings,
  exportBaseName,
  onSendToCurrent,
  onCreateNewScenario,
  hasActiveScenario,
}: ResultViewProps) {
  if (testCases.length === 0) {
    return (
      <p className="text-xs text-slate-400">
        생성된 테스트케이스가 없습니다. 문서 본문에서 요구사항을 감지하지
        못했을 수 있습니다.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {warnings.length > 0 && (
        <div className="rounded-md border border-amber-800 bg-amber-950/40 px-3 py-2 text-xs text-amber-200">
          <p className="font-medium">경고</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {warnings.slice(0, 8).map((w, idx) => (
              <li key={idx}>{w}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-400">
          총 {testCases.length}개 생성됨
        </span>
        <div className="ml-auto flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => downloadXlsx(testCases, exportBaseName)}
            className="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:border-slate-500"
          >
            xlsx 다운로드
          </button>
          <button
            type="button"
            onClick={() => downloadMarkdown(testCases, exportBaseName)}
            className="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:border-slate-500"
          >
            md 다운로드
          </button>
          <button
            type="button"
            onClick={() => downloadJson(testCases, exportBaseName)}
            className="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:border-slate-500"
          >
            json 다운로드
          </button>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onSendToCurrent}
          disabled={!hasActiveScenario}
          className="rounded-md bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-60"
          title={hasActiveScenario ? undefined : "편집 중인 시나리오가 없습니다"}
        >
          현재 시나리오 스텝에 추가
        </button>
        <button
          type="button"
          onClick={onCreateNewScenario}
          className="rounded-md border border-sky-600 px-3 py-1.5 text-xs font-medium text-sky-300 hover:bg-sky-950"
        >
          새 시나리오로 만들기
        </button>
      </div>
      <ul className="flex flex-col gap-3">
        {testCases.map((tc) => (
          <li
            key={tc.id}
            className="rounded-lg border border-slate-800 bg-slate-950/40 px-4 py-3"
          >
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              <span className="rounded bg-slate-800 px-1.5 py-0.5 text-slate-300">
                {tc.priority}
              </span>
              <span className="rounded bg-slate-800 px-1.5 py-0.5 text-slate-300">
                {tc.type}
              </span>
              <span className="text-slate-500">{tc.feature}</span>
            </div>
            <h3 className="mt-1 text-sm font-medium text-slate-100">
              {tc.title}
            </h3>
            {tc.objective && (
              <p className="mt-0.5 text-xs text-slate-500">{tc.objective}</p>
            )}
            {tc.preconditions.length > 0 && (
              <Section title="사전 조건" items={tc.preconditions} />
            )}
            {tc.steps.length > 0 && (
              <Section title="단계" items={tc.steps} ordered />
            )}
            {tc.expectedResults.length > 0 && (
              <Section title="기대 결과" items={tc.expectedResults} />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Section({
  title,
  items,
  ordered,
}: {
  title: string;
  items: string[];
  ordered?: boolean;
}) {
  const ListTag = ordered ? "ol" : "ul";
  return (
    <div className="mt-2">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
        {title}
      </p>
      <ListTag
        className={`mt-1 space-y-0.5 pl-4 text-xs text-slate-300 ${
          ordered ? "list-decimal" : "list-disc"
        }`}
      >
        {items.map((item, idx) => (
          <li key={idx}>{item}</li>
        ))}
      </ListTag>
    </div>
  );
}

interface HistoryViewProps {
  history: DocTcHistoryEntry[];
  isStorageAvailable: boolean;
  onRestore: (entry: DocTcHistoryEntry) => void;
  onDelete: (id: string) => void;
  onClearAll: () => void;
}

function formatHistoryTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function describeOptions(options: DocTcOptions): string {
  const parts: string[] = [];
  parts.push(options.includeNegative ? "부정 포함" : "부정 제외");
  parts.push(options.includeBoundary ? "경계 포함" : "경계 제외");
  parts.push(`최대 ${options.maxCasesPerRequirement}건/요구`);
  parts.push(`OCR: ${options.language === "ko" ? "kor+eng" : "eng"}`);
  return parts.join(" · ");
}

function HistoryView({
  history,
  isStorageAvailable,
  onRestore,
  onDelete,
  onClearAll,
}: HistoryViewProps) {
  if (!isStorageAvailable) {
    return (
      <div className="rounded-md border border-amber-800 bg-amber-950/40 px-3 py-2 text-xs text-amber-200">
        브라우저 저장소를 사용할 수 없어 문서 TC 히스토리가 기록되지 않습니다.
        시크릿 모드 또는 저장소 권한 제한 여부를 확인해 주세요.
      </div>
    );
  }
  if (history.length === 0) {
    return (
      <p className="text-xs text-slate-400">
        아직 생성된 문서 TC가 없습니다. 업로드 / 옵션 탭에서 TC를 생성하면
        여기에 자동으로 기록됩니다.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-400">
          최근 {history.length}건 (최대 {HISTORY_DISPLAY_LIMIT}건 보관)
        </span>
        <button
          type="button"
          onClick={onClearAll}
          className="text-[11px] text-slate-500 underline-offset-2 hover:text-rose-300 hover:underline"
        >
          전체 비우기
        </button>
      </div>
      <ul className="flex flex-col gap-2">
        {history.map((entry) => (
          <li
            key={entry.id}
            className="rounded-lg border border-slate-800 bg-slate-950/40 px-4 py-3"
          >
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
              <span className="rounded bg-slate-800 px-1.5 py-0.5 uppercase text-slate-300">
                {entry.document.type}
              </span>
              <span className="text-slate-300">{entry.document.fileName}</span>
              <span className="text-slate-500">
                {formatHistoryTimestamp(entry.createdAt)}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-300">
              <span>TC {entry.testCases.length}건</span>
              <span className="text-slate-500">
                요구사항 {entry.requirements.length}건
              </span>
              {entry.warnings.length > 0 && (
                <span className="text-amber-300">
                  경고 {entry.warnings.length}
                </span>
              )}
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              {describeOptions(entry.options)}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onRestore(entry)}
                className="rounded-md bg-sky-600 px-3 py-1 text-[11px] font-medium text-white hover:bg-sky-500"
              >
                불러오기
              </button>
              <button
                type="button"
                onClick={() => onDelete(entry.id)}
                className="rounded-md border border-slate-700 px-3 py-1 text-[11px] text-slate-300 hover:border-rose-500 hover:text-rose-200"
              >
                삭제
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
