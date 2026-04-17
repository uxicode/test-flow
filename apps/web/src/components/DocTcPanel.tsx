import { useEffect, useId, useState, type DragEvent } from "react";
import type {
  RequirementItem,
  Scenario,
  SourceDocumentRef,
} from "../types";
import {
  downloadGeneratedDocTcExcel,
  downloadGeneratedDocTcJson,
  downloadGeneratedDocTcMarkdown,
} from "../utils/docTcExport";

interface ParseResponse {
  document: SourceDocumentRef;
  extractedText: string;
  requirements: RequirementItem[];
  warnings: string[];
}

interface GenerateResponse {
  id: string;
  name: string;
  mode: "builder" | "script" | "docTc";
  steps: Scenario["steps"];
  rawScript: string;
  createdAt: string;
  updatedAt: string;
  excelTestCases?: Scenario["excelTestCases"];
  smartTc?: Scenario["smartTc"];
  sourceDocument?: SourceDocumentRef;
  requirementsExtract?: RequirementItem[];
  generatedDocTestCases?: Scenario["generatedDocTestCases"];
  docTcGeneration?: Scenario["docTcGeneration"];
}

interface Props {
  scenario: Scenario;
  onScenarioUpdated: (scenario: Scenario) => void;
}

async function readError(res: Response): Promise<string> {
  const json = (await res.json().catch(() => ({}))) as { message?: string };
  return json.message ?? `HTTP ${res.status}`;
}

export function DocTcPanel({
  scenario,
  onScenarioUpdated,
}: Props): JSX.Element {
  const uploadId = useId();
  const [file, setFile] = useState<File | null>(null);
  const [language, setLanguage] = useState<"ko" | "en">("ko");
  const [includeNegative, setIncludeNegative] = useState(true);
  const [includeBoundary, setIncludeBoundary] = useState(true);
  const [maxCasesPerRequirement, setMaxCasesPerRequirement] = useState(3);
  const [parseBusy, setParseBusy] = useState(false);
  const [generateBusy, setGenerateBusy] = useState(false);
  const [reextractBusy, setReextractBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [documentTextDraft, setDocumentTextDraft] = useState(
    scenario.documentText ?? "",
  );

  useEffect(() => {
    setDocumentTextDraft(scenario.documentText ?? "");
  }, [scenario.id, scenario.documentText]);

  function acceptDocument(fileLike: File | null): void {
    setError(null);
    setFile(fileLike);
  }

  function isSupportedDocument(fileLike: File): boolean {
    const name = fileLike.name.toLowerCase();
    return (
      name.endsWith(".txt") ||
      name.endsWith(".md") ||
      name.endsWith(".pdf") ||
      name.endsWith(".docx") ||
      name.endsWith(".hwpx")
    );
  }

  function handleDrop(e: DragEvent<HTMLLabelElement>): void {
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer.files?.[0] ?? null;
    if (!dropped) return;
    if (!isSupportedDocument(dropped)) {
      setError("지원 파일 형식은 .txt, .md, .pdf, .docx, .hwpx 입니다.");
      return;
    }
    acceptDocument(dropped);
  }

  async function handleParse(): Promise<void> {
    if (!file) {
      setError("먼저 문서 파일을 선택하세요.");
      return;
    }
    setParseBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("language", language);
      const res = await fetch("/api/docs/parse", { method: "POST", body: fd });
      if (!res.ok) throw new Error(await readError(res));
      const parsed = (await res.json()) as ParseResponse;
      const saveRes = await fetch(`/api/scenarios/${scenario.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode: "docTc",
          sourceDocument: parsed.document,
          documentText: parsed.extractedText,
          requirementsExtract: parsed.requirements,
        }),
      });
      if (!saveRes.ok) throw new Error(await readError(saveRes));
      const updated = (await saveRes.json()) as Scenario;
      setWarnings(parsed.warnings);
      setDocumentTextDraft(parsed.extractedText);
      onScenarioUpdated({
        ...updated,
        excelTestCases: updated.excelTestCases ?? [],
        smartTc: updated.smartTc ?? [],
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setParseBusy(false);
    }
  }

  async function handleGenerate(): Promise<void> {
    const requirements = scenario.requirementsExtract ?? [];
    if (requirements.length === 0) {
      setError("먼저 문서를 분석해 requirements를 생성하세요.");
      return;
    }
    setGenerateBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/scenarios/${scenario.id}/doc/generate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sourceDocument: scenario.sourceDocument,
          requirements,
          options: {
            includeNegative,
            includeBoundary,
            maxCasesPerRequirement,
          },
        }),
      });
      if (!res.ok) throw new Error(await readError(res));
      const updated = (await res.json()) as GenerateResponse;
      setWarnings(updated.docTcGeneration?.warnings ?? []);
      onScenarioUpdated({
        ...updated,
        excelTestCases: updated.excelTestCases ?? [],
        smartTc: updated.smartTc ?? [],
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGenerateBusy(false);
    }
  }

  async function handleReextractFromText(): Promise<void> {
    if (!documentTextDraft.trim()) {
      setError("추출 원문이 비어 있습니다.");
      return;
    }
    setReextractBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/docs/extract-requirements", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: documentTextDraft }),
      });
      if (!res.ok) throw new Error(await readError(res));
      const parsed = (await res.json()) as {
        requirements: RequirementItem[];
        warnings: string[];
      };
      const saveRes = await fetch(`/api/scenarios/${scenario.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode: "docTc",
          sourceDocument: scenario.sourceDocument,
          documentText: documentTextDraft,
          requirementsExtract: parsed.requirements,
        }),
      });
      if (!saveRes.ok) throw new Error(await readError(saveRes));
      const updated = (await saveRes.json()) as Scenario;
      setWarnings(parsed.warnings);
      onScenarioUpdated({
        ...updated,
        excelTestCases: updated.excelTestCases ?? [],
        smartTc: updated.smartTc ?? [],
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setReextractBusy(false);
    }
  }

  const requirements = scenario.requirementsExtract ?? [];
  const generatedCases = scenario.generatedDocTestCases ?? [];
  const provider = scenario.docTcGeneration?.provider ?? "unknown";
  const model = scenario.docTcGeneration?.model ?? "-";

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-slate-800 bg-slate-900/50 p-6">
      <div>
        <h2 className="text-base font-semibold text-slate-200">문서 기반 TC</h2>
        <p className="mt-1 text-sm text-slate-500">
          `.txt`, `.md`, `.pdf`, `.docx`, `.hwpx` 기획서를 업로드해 requirement를 추출하고 LLM으로 테스트 케이스를 생성합니다.
          생성된 결과는 현재 시나리오에 저장되고 바로 실행하거나 문서로 내보낼 수 있습니다.
        </p>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-slate-800 bg-slate-950/40 p-4">
        <div className="flex flex-wrap gap-3">
          <div className="min-w-[220px] flex-1">
            <input
              id={uploadId}
              type="file"
              accept=".txt,.md,.pdf,.docx,.hwpx,text/plain,text/markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="hidden"
              onChange={(e) => {
                acceptDocument(e.target.files?.[0] ?? null);
              }}
            />
            <label
              htmlFor={uploadId}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              className={`flex min-h-[96px] cursor-pointer items-center justify-center rounded-lg border-2 border-dashed px-4 py-6 text-center text-sm transition-colors ${
                isDragging
                  ? "border-sky-500 bg-sky-950/30 text-sky-200"
                  : "border-slate-600 text-slate-400 hover:border-sky-500"
              }`}
            >
              {file ? file.name : "문서 파일 선택 (.txt, .md, .pdf, .docx, .hwpx)"}
            </label>
          </div>
          <label className="flex min-w-[120px] flex-col gap-1">
            <span className="text-xs font-medium text-slate-500">언어</span>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as "ko" | "en")}
              className="rounded border border-slate-600 bg-slate-950 px-2 py-2 text-sm text-slate-200"
            >
              <option value="ko">한국어</option>
              <option value="en">English</option>
            </select>
          </label>
        </div>

      <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void handleParse()}
            disabled={!file || parseBusy}
            className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50"
          >
            {parseBusy ? "분석 중…" : "문서 분석"}
          </button>
          <button
            type="button"
            onClick={() => void handleReextractFromText()}
            disabled={!documentTextDraft.trim() || reextractBusy}
            className="rounded-lg border border-amber-700 px-4 py-2 text-sm font-medium text-amber-200 hover:bg-amber-950/40 disabled:opacity-50"
          >
            {reextractBusy ? "재추출 중…" : "텍스트로 요구사항 재추출"}
          </button>
          <button
            type="button"
            onClick={() => void handleGenerate()}
            disabled={requirements.length === 0 || generateBusy}
            className="rounded-lg border border-emerald-700 px-4 py-2 text-sm font-medium text-emerald-200 hover:bg-emerald-950/40 disabled:opacity-50"
          >
            {generateBusy ? "생성 중…" : "LLM으로 TC 생성"}
          </button>
        </div>
      </div>

      <section className="rounded-lg border border-slate-800 bg-slate-950/30 p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-200">추출 원문 텍스트</h3>
          <span className="text-xs text-slate-500">
            OCR 결과가 잘못되면 여기서 수정 후 재추출하세요.
          </span>
        </div>
        <textarea
          value={documentTextDraft}
          onChange={(e) => setDocumentTextDraft(e.target.value)}
          className="mt-3 min-h-[220px] w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm leading-6 text-slate-200 focus:border-sky-500 focus:outline-none"
          placeholder="문서에서 추출된 원문 텍스트가 여기에 표시됩니다."
        />
      </section>

      <div className="flex flex-wrap gap-3 rounded-lg border border-slate-800 bg-slate-950/40 p-4">
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={includeNegative}
            onChange={(e) => setIncludeNegative(e.target.checked)}
            className="rounded border-slate-600"
          />
          Negative 포함
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={includeBoundary}
            onChange={(e) => setIncludeBoundary(e.target.checked)}
            className="rounded border-slate-600"
          />
          Boundary 포함
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <span>요구사항당 최대 케이스</span>
          <input
            type="number"
            min={1}
            max={10}
            value={maxCasesPerRequirement}
            onChange={(e) =>
              setMaxCasesPerRequirement(
                Math.max(1, Math.min(10, Number(e.target.value) || 1)),
              )
            }
            className="w-20 rounded border border-slate-600 bg-slate-950 px-2 py-1.5 text-sm text-slate-200"
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/40 p-4">
        <button
          type="button"
          disabled={generatedCases.length === 0}
          onClick={() =>
            downloadGeneratedDocTcExcel(
              generatedCases,
              `${scenario.name || "generated-doc-tc"}-tc`,
            )
          }
          className="rounded-lg border border-slate-600 px-4 py-2 text-sm font-medium text-slate-200 hover:border-sky-500 disabled:opacity-50"
        >
          Excel 다운로드
        </button>
        <button
          type="button"
          disabled={generatedCases.length === 0}
          onClick={() =>
            downloadGeneratedDocTcMarkdown(
              generatedCases,
              `${scenario.name || "generated-doc-tc"}-tc`,
            )
          }
          className="rounded-lg border border-slate-600 px-4 py-2 text-sm font-medium text-slate-200 hover:border-emerald-500 disabled:opacity-50"
        >
          Markdown 다운로드
        </button>
        <button
          type="button"
          disabled={generatedCases.length === 0}
          onClick={() =>
            downloadGeneratedDocTcJson(
              generatedCases,
              `${scenario.name || "generated-doc-tc"}-tc`,
            )
          }
          className="rounded-lg border border-slate-600 px-4 py-2 text-sm font-medium text-slate-200 hover:border-violet-500 disabled:opacity-50"
        >
          JSON 다운로드
        </button>
        <span className="text-xs text-slate-500">
          생성된 TC를 문서로 내보낼 수 있습니다.
        </span>
      </div>

      {scenario.sourceDocument ? (
        <div className="rounded-lg border border-slate-800 bg-slate-950/30 p-4 text-sm text-slate-400">
          <p>
            문서: <span className="text-slate-200">{scenario.sourceDocument.fileName}</span>
          </p>
          <p className="mt-1">
            추출: {scenario.sourceDocument.type} / {scenario.sourceDocument.size} bytes
          </p>
          <p className="mt-1">
            생성기: <span className="text-slate-200">{provider}</span> / {model}
          </p>
        </div>
      ) : null}

      {error ? (
        <p className="rounded-lg border border-rose-900/50 bg-rose-950/30 px-3 py-2 text-sm text-rose-200">
          {error}
        </p>
      ) : null}

      {warnings.length > 0 ? (
        <div className="rounded-lg border border-amber-900/50 bg-amber-950/20 p-3 text-sm text-amber-100/90">
          <p className="font-medium text-amber-200">Warnings</p>
          <ul className="mt-2 list-inside list-disc">
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-lg border border-slate-800 bg-slate-950/30 p-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-200">
              Requirements ({requirements.length})
            </h3>
          </div>
          {requirements.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">아직 문서 분석 결과가 없습니다.</p>
          ) : (
            <div className="mt-3 max-h-[360px] overflow-auto space-y-3">
              {requirements.map((item) => (
                <article
                  key={item.id}
                  className="rounded-lg border border-slate-800 bg-slate-900/40 p-3"
                >
                  <p className="text-xs text-sky-300">{item.id}</p>
                  <p className="mt-1 text-sm font-medium text-slate-100">
                    {item.feature || item.sectionTitle || item.id}
                  </p>
                  {item.acceptanceCriteria.length > 0 ? (
                    <p className="mt-2 text-xs text-slate-400">
                      기대: {item.acceptanceCriteria.join(" / ")}
                    </p>
                  ) : null}
                  {item.flow.length > 0 ? (
                    <p className="mt-1 text-xs text-slate-500">
                      흐름: {item.flow.slice(0, 3).join(" -> ")}
                    </p>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-lg border border-slate-800 bg-slate-950/30 p-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-200">
              Generated TC ({generatedCases.length})
            </h3>
          </div>
          {generatedCases.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">아직 생성된 테스트 케이스가 없습니다.</p>
          ) : (
            <div className="mt-3 max-h-[360px] overflow-auto space-y-3">
              {generatedCases.map((item) => (
                <article
                  key={item.id}
                  className="rounded-lg border border-slate-800 bg-slate-900/40 p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-slate-100">{item.title}</p>
                    <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[11px] text-slate-300">
                      {item.type ?? "positive"} / {item.priority ?? "P2"}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-slate-400">
                    기대결과: {item.expectedResults.join(" / ")}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Steps: {item.steps.slice(0, 3).join(" -> ")}
                  </p>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
