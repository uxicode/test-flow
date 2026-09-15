import type { FigmaDumpSummary } from "@testflow/figma-ingest";
import type { MermaidIrSummary, StoredMermaidIr } from "@testflow/mermaid-ir";
import mermaid from "mermaid";
import { useEffect, useState } from "react";
import { ApiError, deleteJson, getJson, postJson } from "../lib/http";

interface DumpListResponse {
  items: FigmaDumpSummary[];
}

interface MermaidListResponse {
  items: MermaidIrSummary[];
}

interface MermaidPanelProps {
  dumpId: string | null;
  dumpListRevision?: number;
  onMermaidSelected?: (mermaidId: string | null) => void;
  onMermaidsChanged?: () => void;
}

function dumpOptionLabel(dump: FigmaDumpSummary): string {
  return `${dump.fileKey} / ${dump.startNodeId} · ${dump.source} · ${dump.id.slice(0, 8)}`;
}

mermaid.initialize({ startOnLoad: false, theme: "dark", securityLevel: "strict" });

export function MermaidPanel({
  dumpId,
  dumpListRevision = 0,
  onMermaidSelected,
  onMermaidsChanged,
}: MermaidPanelProps) {
  const [dumps, setDumps] = useState<FigmaDumpSummary[]>([]);
  const [selectedDumpId, setSelectedDumpId] = useState(dumpId ?? "");
  const [docs, setDocs] = useState<MermaidIrSummary[]>([]);
  const [current, setCurrent] = useState<StoredMermaidIr | null>(null);
  const [svg, setSvg] = useState<string>("");
  const [isWorking, setIsWorking] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  useEffect(() => {
    if (dumpId) setSelectedDumpId(dumpId);
    else setSelectedDumpId("");
  }, [dumpId]);

  useEffect(() => {
    void getJson<DumpListResponse>("/api/figma-dumps")
      .then((result) => {
        setDumps(result.items);
        setSelectedDumpId((current) => {
          if (dumpId && result.items.some((item) => item.id === dumpId)) return dumpId;
          if (current && result.items.some((item) => item.id === current)) return current;
          return result.items[0]?.id ?? "";
        });
      })
      .catch(applyError);
    void refreshDocs();
  }, [dumpId, dumpListRevision]);

  useEffect(() => {
    if (!current) {
      setSvg("");
      return;
    }
    let isCancelled = false;
    const renderId = `mermaid-${current.id.replace(/[^A-Za-z0-9]/g, "")}`;
    mermaid
      .render(renderId, current.mermaid)
      .then((result) => {
        if (!isCancelled) {
          setSvg(result.svg);
          setErrorMessage(null);
          setErrorCode(null);
        }
      })
      .catch((error: unknown) => {
        if (isCancelled) return;
        setSvg("");
        setErrorCode("invalid_mermaid");
        setErrorMessage(
          error instanceof Error ? error.message : "Mermaid 미리보기에 실패했습니다.",
        );
      });
    return () => {
      isCancelled = true;
    };
  }, [current]);

  function applyError(error: unknown) {
    if (error instanceof ApiError) {
      setErrorCode(error.code);
      setErrorMessage(error.message);
      return;
    }
    setErrorCode("request_failed");
    setErrorMessage(error instanceof Error ? error.message : "요청에 실패했습니다.");
  }

  async function refreshDocs() {
    const result = await getJson<MermaidListResponse>("/api/mermaid");
    setDocs(result.items);
  }

  async function handleConvert() {
    if (!selectedDumpId) return;
    setIsWorking(true);
    try {
      const stored = await postJson<StoredMermaidIr>("/api/mermaid", {
        dumpId: selectedDumpId,
      });
      setCurrent(stored);
      onMermaidSelected?.(stored.id);
      setErrorMessage(null);
      setErrorCode(null);
      await refreshDocs();
      onMermaidsChanged?.();
    } catch (error) {
      applyError(error);
    } finally {
      setIsWorking(false);
    }
  }

  async function handleDelete(id: string) {
    setIsWorking(true);
    try {
      await deleteJson<{ ok: boolean }>(`/api/mermaid/${id}`);
      if (current?.id === id) {
        setCurrent(null);
        setSvg("");
        onMermaidSelected?.(null);
      }
      setErrorMessage(null);
      setErrorCode(null);
      await refreshDocs();
      onMermaidsChanged?.();
    } catch (error) {
      applyError(error);
    } finally {
      setIsWorking(false);
    }
  }

  async function handleOpen(id: string) {
    setIsWorking(true);
    try {
      const doc = await getJson<StoredMermaidIr>(`/api/mermaid/${id}`);
      setCurrent(doc);
      onMermaidSelected?.(doc.id);
      setErrorMessage(null);
      setErrorCode(null);
    } catch (error) {
      applyError(error);
    } finally {
      setIsWorking(false);
    }
  }

  async function handleCopy() {
    if (!current) return;
    await navigator.clipboard.writeText(current.mermaid);
  }

  function handleDownload() {
    if (!current) return;
    const blob = new Blob([current.mermaid], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${current.id}.mmd`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="space-y-4 rounded-xl border border-slate-700 bg-slate-900/70 p-5">
      <header className="space-y-1">
        <h2 className="text-lg font-medium text-white">2. Mermaid 변환</h2>
        <p className="text-sm text-slate-400">
          저장된 덤프를 flowchart로 바꾸고 미리보기·복사·.mmd 저장을 할 수 있습니다.
        </p>
      </header>

      <div className="flex flex-col gap-2 sm:flex-row">
        <select
          className="flex-1 rounded-md border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-slate-100"
          value={selectedDumpId}
          onChange={(event) => setSelectedDumpId(event.target.value)}
        >
          <option value="">덤프 선택</option>
          {dumps.map((dump) => (
            <option key={dump.id} value={dump.id}>
              {dumpOptionLabel(dump)}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="rounded-md bg-emerald-700 px-3 py-2 text-sm text-white disabled:opacity-50"
          disabled={isWorking || !selectedDumpId}
          onClick={() => void handleConvert()}
        >
          Mermaid 생성
        </button>
      </div>

      {errorMessage ? (
        <p className="text-sm text-rose-300" role="alert">
          {errorCode ? <span className="font-mono">[{errorCode}] </span> : null}
          {errorMessage}
        </p>
      ) : null}

      {current ? (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-md bg-slate-700 px-3 py-2 text-sm text-white"
              onClick={() => void handleCopy()}
            >
              코드 복사
            </button>
            <button
              type="button"
              className="rounded-md border border-slate-500 px-3 py-2 text-sm text-slate-200"
              onClick={handleDownload}
            >
              .mmd 저장
            </button>
          </div>
          <p className="text-xs text-slate-500">checksum {current.checksum}</p>
          {svg ? (
            <div
              className="overflow-auto rounded-md bg-slate-950 p-3"
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          ) : null}
          <pre className="max-h-56 overflow-auto rounded-md bg-slate-950 p-3 text-xs text-slate-200">
            {current.mermaid}
          </pre>
        </div>
      ) : null}

      <div className="space-y-2">
        <h3 className="text-sm font-medium text-slate-200">저장된 Mermaid</h3>
        {docs.length === 0 ? (
          <p className="text-sm text-slate-500">아직 변환한 문서가 없습니다.</p>
        ) : null}
        <ul className="space-y-1">
          {docs.map((doc) => (
            <li key={doc.id} className="flex gap-2">
              <button
                type="button"
                className="min-w-0 flex-1 rounded-md border border-slate-700 px-3 py-2 text-left text-sm text-slate-200 hover:border-slate-500"
                onClick={() => void handleOpen(doc.id)}
              >
                {doc.id.slice(0, 8)} · 노드 {doc.nodeCount}
              </button>
              <button
                type="button"
                data-mermaid-id={doc.id}
                className="rounded-md border border-slate-700 px-2.5 text-sm text-slate-400 hover:border-rose-400 hover:text-rose-300 disabled:opacity-50"
                aria-label={`Mermaid ${doc.id.slice(0, 8)} 삭제`}
                disabled={isWorking}
                onClick={() => void handleDelete(doc.id)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
