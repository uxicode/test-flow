import type { MermaidIrSummary } from "@testflow/mermaid-ir";
import type {
  TcDocumentSummary,
  TcVersion,
  TcVersionSummary,
  TestCase,
} from "@testflow/tc-generator";
import { testCasesToMarkdown } from "@testflow/tc-generator";
import { useEffect, useState } from "react";
import { ApiError, deleteJson, getJson, patchJson, postJson } from "../lib/http";
import { MANUAL_MERMAID_DUMP_ID } from "../lib/mermaid";

interface MermaidListResponse {
  items: MermaidIrSummary[];
}

interface TcListResponse {
  items: TcDocumentSummary[];
}

interface TcHeadResponse {
  document: TcDocumentSummary;
  head: TcVersion;
}

interface TcHistoryResponse {
  document: TcDocumentSummary;
  versions: TcVersionSummary[];
}

interface TcVersionResponse {
  document: TcDocumentSummary;
  version: TcVersion;
}

interface TcPanelProps {
  mermaidId: string | null;
  mermaidListRevision?: number;
  onDocumentSelected?: (documentId: string | null) => void;
  onDocumentsChanged?: () => void;
}

export function TcPanel({
  mermaidId,
  mermaidListRevision = 0,
  onDocumentSelected,
  onDocumentsChanged,
}: TcPanelProps) {
  const [mermaids, setMermaids] = useState<MermaidIrSummary[]>([]);
  const [selectedMermaidId, setSelectedMermaidId] = useState(mermaidId ?? "");
  const [docs, setDocs] = useState<TcDocumentSummary[]>([]);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [head, setHead] = useState<TcVersion | null>(null);
  const [draft, setDraft] = useState<TestCase[]>([]);
  const [history, setHistory] = useState<TcVersionSummary[]>([]);
  const [viewing, setViewing] = useState<TcVersion | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  useEffect(() => {
    if (mermaidId) setSelectedMermaidId(mermaidId);
  }, [mermaidId]);

  useEffect(() => {
    void getJson<MermaidListResponse>("/api/mermaid").then((result) => {
      setMermaids(result.items);
      setSelectedMermaidId((current) => {
        if (mermaidId && result.items.some((item) => item.id === mermaidId))
          return mermaidId;
        if (current && result.items.some((item) => item.id === current)) return current;
        return result.items[0]?.id ?? "";
      });
    });
    void refreshDocs();
  }, [mermaidId, mermaidListRevision]);

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
    const result = await getJson<TcListResponse>("/api/tc");
    setDocs(result.items);
  }

  async function loadDocument(id: string, version?: number) {
    if (version !== undefined) {
      const result = await getJson<TcVersionResponse>(
        `/api/tc/${id}/versions/${version}`,
      );
      setDocumentId(id);
      setViewing(result.version);
      setDraft(result.version.cases);
    } else {
      const result = await getJson<TcHeadResponse>(`/api/tc/${id}`);
      setDocumentId(id);
      setHead(result.head);
      setViewing(null);
      setDraft(result.head.cases);
    }
    const hist = await getJson<TcHistoryResponse>(`/api/tc/${id}/history`);
    setHistory(hist.versions);
    onDocumentSelected?.(id);
  }

  async function handleGenerate() {
    if (!selectedMermaidId) return;
    setIsWorking(true);
    try {
      const result = await postJson<TcHeadResponse>("/api/tc", {
        mermaidId: selectedMermaidId,
      });
      setDocumentId(result.document.documentId);
      setHead(result.head);
      setViewing(null);
      setDraft(result.head.cases);
      setErrorMessage(null);
      setErrorCode(null);
      await refreshDocs();
      onDocumentsChanged?.();
      await loadDocument(result.document.documentId);
    } catch (error) {
      applyError(error);
    } finally {
      setIsWorking(false);
    }
  }

  async function handleSaveEdit() {
    if (!documentId || viewing) return;
    setIsWorking(true);
    try {
      const result = await patchJson<TcHeadResponse>(`/api/tc/${documentId}`, {
        cases: draft,
      });
      setHead(result.head);
      setDraft(result.head.cases);
      setErrorMessage(null);
      setErrorCode(null);
      await loadDocument(documentId);
    } catch (error) {
      applyError(error);
    } finally {
      setIsWorking(false);
    }
  }

  async function handleRestore(version: number) {
    if (!documentId) return;
    setIsWorking(true);
    try {
      const result = await postJson<TcHeadResponse>(`/api/tc/${documentId}/restore`, {
        version,
      });
      setHead(result.head);
      setViewing(null);
      setDraft(result.head.cases);
      setErrorMessage(null);
      setErrorCode(null);
      await loadDocument(documentId);
    } catch (error) {
      applyError(error);
    } finally {
      setIsWorking(false);
    }
  }

  function clearDocument() {
    setDocumentId(null);
    setHead(null);
    setDraft([]);
    setHistory([]);
    setViewing(null);
    onDocumentSelected?.(null);
  }

  async function handleDeleteDocument(id: string) {
    setIsWorking(true);
    try {
      await deleteJson<{ ok: boolean }>(`/api/tc/${id}`);
      if (documentId === id) clearDocument();
      setErrorMessage(null);
      setErrorCode(null);
      await refreshDocs();
      onDocumentsChanged?.();
    } catch (error) {
      applyError(error);
    } finally {
      setIsWorking(false);
    }
  }

  async function handleDeleteVersion(version: number) {
    if (!documentId) return;
    setIsWorking(true);
    try {
      const result = await deleteJson<{
        ok: boolean;
        deletedDocument?: boolean;
      }>(`/api/tc/${documentId}/versions/${version}`);
      setErrorMessage(null);
      setErrorCode(null);
      if (result.deletedDocument) {
        clearDocument();
        await refreshDocs();
        onDocumentsChanged?.();
      } else {
        await refreshDocs();
        onDocumentsChanged?.();
        await loadDocument(documentId);
      }
    } catch (error) {
      applyError(error);
    } finally {
      setIsWorking(false);
    }
  }

  const isReadOnly = viewing !== null && viewing.version !== head?.version;
  const shown = viewing ?? head;

  return (
    <section className="space-y-4 rounded-xl border border-slate-700 bg-slate-900/70 p-5">
      <header className="space-y-1">
        <h2 className="text-lg font-medium text-white">3. TC 생성 · 이력</h2>
        <p className="text-sm text-slate-400">
          Mermaid에서 경로별 TC를 만들고, 수정·이전 버전 열람·복원은 모두 이력에
          남습니다.
        </p>
      </header>

      <div className="flex flex-col gap-2 sm:flex-row">
        <select
          className="flex-1 rounded-md border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-slate-100"
          value={selectedMermaidId}
          onChange={(event) => setSelectedMermaidId(event.target.value)}
        >
          <option value="">Mermaid 선택</option>
          {mermaids.map((doc) => (
            <option key={doc.id} value={doc.id}>
              {doc.dumpId === MANUAL_MERMAID_DUMP_ID ? "직접 입력 · " : ""}
              {doc.id.slice(0, 8)} · checksum {doc.checksum.slice(0, 8)}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="rounded-md bg-emerald-700 px-3 py-2 text-sm text-white disabled:opacity-50"
          disabled={isWorking || !selectedMermaidId}
          onClick={() => void handleGenerate()}
        >
          TC 생성
        </button>
      </div>

      {errorMessage ? (
        <p className="text-sm text-rose-300" role="alert">
          {errorCode ? <span className="font-mono">[{errorCode}] </span> : null}
          {errorMessage}
        </p>
      ) : null}

      {docs.length > 0 ? (
        <ul className="space-y-1">
          {docs.map((doc) => (
            <li key={doc.documentId} className="flex gap-2">
              <button
                type="button"
                className="min-w-0 flex-1 rounded-md border border-slate-700 px-3 py-2 text-left text-sm text-slate-200 hover:border-slate-500"
                onClick={() => void loadDocument(doc.documentId)}
              >
                {doc.figmaFileKey} / {doc.figmaStartNodeId} · v{doc.headVersion} · TC{" "}
                {doc.caseCount}
              </button>
              <button
                type="button"
                data-tc-doc={doc.documentId}
                className="rounded-md border border-slate-700 px-2.5 text-sm text-slate-400 hover:border-rose-400 hover:text-rose-300 disabled:opacity-50"
                aria-label={`${doc.documentId} 삭제`}
                disabled={isWorking}
                onClick={() => void handleDeleteDocument(doc.documentId)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {shown ? (
        <div className="space-y-3">
          <p className="text-xs text-slate-500">
            버전 {shown.version} · {shown.summary}
            {shown.parentVersion !== null ? ` · 부모 v${shown.parentVersion}` : ""}
            {documentId ? ` · ${documentId}` : ""} · checksum {shown.mermaidChecksum.slice(0, 12)}
            {isReadOnly ? " · 읽기 전용" : ""}
          </p>
          {draft.map((testCase, caseIndex) => (
            <article
              key={testCase.id}
              className="space-y-2 rounded-md border border-slate-700 p-3"
            >
              <input
                className="w-full rounded-md border border-slate-600 bg-slate-950 px-2 py-1 text-sm text-slate-100 disabled:opacity-70"
                value={testCase.title}
                disabled={isReadOnly}
                onChange={(event) => {
                  const next = [...draft];
                  const current = next[caseIndex];
                  if (!current) return;
                  next[caseIndex] = { ...current, title: event.target.value };
                  setDraft(next);
                }}
              />
              <textarea
                className="w-full rounded-md border border-slate-600 bg-slate-950 px-2 py-1 text-xs text-slate-200 disabled:opacity-70"
                value={testCase.preconditions}
                disabled={isReadOnly}
                onChange={(event) => {
                  const next = [...draft];
                  const current = next[caseIndex];
                  if (!current) return;
                  next[caseIndex] = { ...current, preconditions: event.target.value };
                  setDraft(next);
                }}
              />
              {testCase.steps.map((step, stepIndex) => (
                <div key={`${testCase.id}-${stepIndex}`} className="grid gap-1 sm:grid-cols-3">
                  <input
                    className="rounded-md border border-slate-600 bg-slate-950 px-2 py-1 text-xs text-slate-200 disabled:opacity-70"
                    value={step.action}
                    disabled={isReadOnly}
                    onChange={(event) => {
                      const next = [...draft];
                      const current = next[caseIndex];
                      if (!current) return;
                      const steps = current.steps.map((item, index) =>
                        index === stepIndex ? { ...item, action: event.target.value } : item,
                      );
                      next[caseIndex] = { ...current, steps };
                      setDraft(next);
                    }}
                  />
                  <input
                    className="rounded-md border border-slate-600 bg-slate-950 px-2 py-1 text-xs text-slate-200 disabled:opacity-70"
                    value={step.targetHint}
                    disabled={isReadOnly}
                    onChange={(event) => {
                      const next = [...draft];
                      const current = next[caseIndex];
                      if (!current) return;
                      const steps = current.steps.map((item, index) =>
                        index === stepIndex
                          ? { ...item, targetHint: event.target.value }
                          : item,
                      );
                      next[caseIndex] = { ...current, steps };
                      setDraft(next);
                    }}
                  />
                  <input
                    className="rounded-md border border-slate-600 bg-slate-950 px-2 py-1 text-xs text-slate-200 disabled:opacity-70"
                    value={step.expected}
                    disabled={isReadOnly}
                    onChange={(event) => {
                      const next = [...draft];
                      const current = next[caseIndex];
                      if (!current) return;
                      const steps = current.steps.map((item, index) =>
                        index === stepIndex
                          ? { ...item, expected: event.target.value }
                          : item,
                      );
                      next[caseIndex] = { ...current, steps };
                      setDraft(next);
                    }}
                  />
                </div>
              ))}
            </article>
          ))}
          {!isReadOnly ? (
            <button
              type="button"
              className="rounded-md bg-sky-700 px-3 py-2 text-sm text-white disabled:opacity-50"
              disabled={isWorking}
              onClick={() => void handleSaveEdit()}
            >
              수정 저장 (새 버전)
            </button>
          ) : (
            <button
              type="button"
              className="rounded-md bg-amber-700 px-3 py-2 text-sm text-white disabled:opacity-50"
              disabled={isWorking || !documentId}
              onClick={() => viewing && void handleRestore(viewing.version)}
            >
              이 버전으로 복원
            </button>
          )}
          <pre className="max-h-48 overflow-auto rounded-md bg-slate-950 p-3 text-xs text-slate-300">
            {testCasesToMarkdown(draft)}
          </pre>
        </div>
      ) : null}

      {history.length > 0 ? (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-slate-200">이력</h3>
          <ul className="space-y-1">
            {history.map((item) => (
              <li key={item.version} className="flex gap-2">
                <button
                  type="button"
                  className="min-w-0 flex-1 rounded-md border border-slate-700 px-3 py-2 text-left text-sm text-slate-200 hover:border-slate-500"
                  onClick={() => documentId && void loadDocument(documentId, item.version)}
                >
                  v{item.version} · {item.summary}
                  {item.parentVersion !== null ? ` · 부모 v${item.parentVersion}` : ""}
                  · checksum {item.mermaidChecksum.slice(0, 8)}
                </button>
                <button
                  type="button"
                  data-tc-version={item.version}
                  className="rounded-md border border-slate-700 px-2.5 text-sm text-slate-400 hover:border-rose-400 hover:text-rose-300 disabled:opacity-50"
                  aria-label={`이력 v${item.version} 삭제`}
                  disabled={isWorking}
                  onClick={() => void handleDeleteVersion(item.version)}
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
