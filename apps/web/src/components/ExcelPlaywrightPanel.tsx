import { useCallback, useId, useState, type DragEvent } from "react";
import * as XLSX from "xlsx";
import type { ExcelTestCase } from "../types";

interface ParseResponse {
  features: ExcelTestCase[];
  diagnostics: { errors: string[]; warnings: string[] };
}

function readSheetNamesFromFile(file: File): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = new Uint8Array(reader.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        resolve([...wb.SheetNames]);
      } catch (e) {
        reject(e);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

interface Props {
  excelTestCases: ExcelTestCase[];
  onExcelTestCasesChange: (next: ExcelTestCase[]) => void;
}

export function ExcelPlaywrightPanel({
  excelTestCases,
  onExcelTestCasesChange,
}: Props): JSX.Element {
  const uploadId = useId();
  const [file, setFile] = useState<File | null>(null);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [selectedSheets, setSelectedSheets] = useState<Set<string>>(
    () => new Set(),
  );
  const [isDragging, setIsDragging] = useState(false);
  const [lastDiagnostics, setLastDiagnostics] = useState<
    ParseResponse["diagnostics"] | null
  >(null);
  const [parseBusy, setParseBusy] = useState(false);
  const [zipBusy, setZipBusy] = useState(false);
  const [jsonOpen, setJsonOpen] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const resetWorkbook = useCallback(async (next: File | null): Promise<void> => {
    setFile(next);
    setLastDiagnostics(null);
    setError(null);
    if (!next) {
      setSheetNames([]);
      setSelectedSheets(new Set());
      return;
    }
    try {
      const names = await readSheetNamesFromFile(next);
      setSheetNames(names);
      setSelectedSheets(new Set(names));
    } catch {
      setError(".xlsx workbook could not be read.");
      setSheetNames([]);
      setSelectedSheets(new Set());
    }
  }, []);

  const onDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const f = e.dataTransfer.files[0];
      if (!f) return;
      if (!f.name.toLowerCase().endsWith(".xlsx")) {
        setError("Only .xlsx files are supported.");
        return;
      }
      void resetWorkbook(f);
    },
    [resetWorkbook],
  );

  async function handleParse(): Promise<void> {
    if (!file) {
      setError("Choose a file first.");
      return;
    }
    setParseBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const sheets = sheetNames.filter((n) => selectedSheets.has(n));
      fd.append(
        "sheetNames",
        JSON.stringify(sheets.length > 0 ? sheets : sheetNames),
      );
      const res = await fetch("/api/excel/parse", { method: "POST", body: fd });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(j.message ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as ParseResponse;
      onExcelTestCasesChange(data.features);
      setLastDiagnostics(data.diagnostics);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setParseBusy(false);
    }
  }

  async function handleDownloadZip(): Promise<void> {
    if (!excelTestCases.length) {
      setError("Parse an .xlsx to load JSON first.");
      return;
    }
    setZipBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/excel/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ testCases: excelTestCases }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(j.message ?? `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "generated-tests.zip";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setZipBusy(false);
    }
  }

  function toggleSheet(name: string): void {
    setSelectedSheets((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  const hasData = excelTestCases.length > 0;

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-slate-800 bg-slate-900/50 p-6">
      <h2 className="text-base font-semibold text-slate-200">
        Excel test cases
      </h2>
      <p className="text-sm text-slate-500">
        QA .xlsx를 업로드하면 JSON이 이 시나리오에 저장됩니다. 아래 패널의{" "}
        <strong className="text-slate-400">테스트 URL</strong>을 입력한 뒤{" "}
        <strong className="text-slate-400">Run</strong>을 누르면, 각 TC마다
        해당 URL을 먼저 방문한 뒤 테스트가 실행됩니다. ZIP 다운로드는 선택
        사항입니다.
      </p>

      <div
        role="presentation"
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        className={`flex min-h-[120px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors ${
          isDragging
            ? "border-sky-500 bg-sky-950/30"
            : "border-slate-600 bg-slate-950/50"
        }`}
      >
        <input
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          id={uploadId}
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            void resetWorkbook(f);
            e.target.value = "";
          }}
        />
        <label
          htmlFor={uploadId}
          className="cursor-pointer text-sm text-slate-400"
        >
          Drop a file here or click to choose
        </label>
        {file ? (
          <p className="mt-2 text-xs text-slate-500">{file.name}</p>
        ) : null}
      </div>

      {sheetNames.length > 0 ? (
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium text-slate-500">Sheets</span>
          <div className="flex flex-wrap gap-3">
            {sheetNames.map((name) => (
              <label
                key={name}
                className="flex cursor-pointer items-center gap-2 text-sm text-slate-300"
              >
                <input
                  type="checkbox"
                  checked={selectedSheets.has(name)}
                  onChange={() => toggleSheet(name)}
                  className="rounded border-slate-600"
                />
                {name}
              </label>
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!file || parseBusy}
          onClick={() => void handleParse()}
          className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50"
        >
          {parseBusy ? "Parsing…" : "Parse to JSON"}
        </button>
        <button
          type="button"
          disabled={!hasData || zipBusy}
          onClick={() => void handleDownloadZip()}
          className="rounded-lg border border-slate-600 px-4 py-2 text-sm font-medium text-slate-200 hover:border-sky-500 disabled:opacity-50"
        >
          {zipBusy ? "Building ZIP…" : "Download ZIP"}
        </button>
        <button
          type="button"
          disabled={!hasData}
          onClick={() => {
            onExcelTestCasesChange([]);
            setLastDiagnostics(null);
          }}
          className="rounded-lg border border-slate-600 px-4 py-2 text-sm font-medium text-slate-400 hover:border-rose-700 hover:text-rose-200 disabled:opacity-50"
        >
          Clear Excel TC
        </button>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-900/50 bg-red-950/40 px-3 py-2 text-sm text-red-200">
          {error}
        </p>
      ) : null}

      {lastDiagnostics &&
      (lastDiagnostics.errors.length > 0 ||
        lastDiagnostics.warnings.length > 0) ? (
        <div className="rounded-lg border border-amber-900/40 bg-amber-950/20 p-3 text-sm">
          {lastDiagnostics.errors.length > 0 ? (
            <div className="mb-2">
              <span className="font-medium text-red-300">Errors</span>
              <ul className="mt-1 list-inside list-disc text-red-200/90">
                {lastDiagnostics.errors.map((err) => (
                  <li key={err}>{err}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {lastDiagnostics.warnings.length > 0 ? (
            <div>
              <span className="font-medium text-amber-200">Warnings</span>
              <ul className="mt-1 list-inside list-disc text-amber-100/80">
                {lastDiagnostics.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      {hasData ? (
        <div>
          <button
            type="button"
            onClick={() => setJsonOpen((v) => !v)}
            className="text-sm font-medium text-sky-400 hover:text-sky-300"
          >
            {jsonOpen ? "Hide JSON" : "Show JSON"}
          </button>
          {jsonOpen ? (
            <pre className="mt-2 max-h-[320px] overflow-auto rounded-lg border border-slate-800 bg-slate-950 p-3 text-xs text-slate-300">
              {JSON.stringify(excelTestCases, null, 2)}
            </pre>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
