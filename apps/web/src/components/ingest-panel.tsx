import type {
  FigmaDump,
  FigmaDumpSummary,
  StoredFigmaDump,
} from "@testflow/figma-ingest";
import { useEffect, useState, type ChangeEvent } from "react";
import {
  ApiError,
  deleteJson,
  getJson,
  postJson,
  putJson,
} from "../lib/http";

interface DumpListResponse {
  items: FigmaDumpSummary[];
}

interface TokenStatus {
  configured: boolean;
  source: "env" | "local" | null;
  hint: string | null;
}

interface IngestPanelProps {
  onDumpSelected?: (dumpId: string | null) => void;
  onDumpsChanged?: () => void;
}

export function IngestPanel({ onDumpSelected, onDumpsChanged }: IngestPanelProps) {
  const [figmaUrl, setFigmaUrl] = useState("");
  const [tokenInput, setTokenInput] = useState("");
  const [tokenStatus, setTokenStatus] = useState<TokenStatus | null>(null);
  const [jsonText, setJsonText] = useState("");
  const [showJsonFallback, setShowJsonFallback] = useState(false);
  const [items, setItems] = useState<FigmaDumpSummary[]>([]);
  const [selected, setSelected] = useState<StoredFigmaDump | null>(null);
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [isWorking, setIsWorking] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  function applyError(error: unknown) {
    if (error instanceof ApiError) {
      setErrorCode(error.code);
      setErrorMessage(error.message);
      return;
    }
    setErrorCode("request_failed");
    setErrorMessage(error instanceof Error ? error.message : "요청에 실패했습니다.");
  }

  async function refreshList() {
    setIsLoadingList(true);
    try {
      const result = await getJson<DumpListResponse>("/api/figma-dumps");
      setItems(result.items);
    } catch (error) {
      applyError(error);
    } finally {
      setIsLoadingList(false);
    }
  }

  async function refreshTokenStatus() {
    const status = await getJson<TokenStatus>("/api/settings/figma");
    setTokenStatus(status);
  }

  useEffect(() => {
    void refreshList();
    void refreshTokenStatus().catch(applyError);
  }, []);

  async function handleSaveToken() {
    setIsWorking(true);
    try {
      const status = await putJson<TokenStatus>("/api/settings/figma-token", {
        token: tokenInput,
      });
      setTokenStatus(status);
      setTokenInput("");
      setErrorMessage(null);
      setErrorCode(null);
    } catch (error) {
      applyError(error);
    } finally {
      setIsWorking(false);
    }
  }

  async function handleClearToken() {
    setIsWorking(true);
    try {
      const status = await deleteJson<TokenStatus>("/api/settings/figma-token");
      setTokenStatus(status);
      setErrorMessage(null);
      setErrorCode(null);
    } catch (error) {
      applyError(error);
    } finally {
      setIsWorking(false);
    }
  }

  async function handleFromUrl() {
    setIsWorking(true);
    try {
      const stored = await postJson<StoredFigmaDump>("/api/figma-dumps/from-url", {
        url: figmaUrl,
      });
      setSelected(stored);
      onDumpSelected?.(stored.id);
      setErrorMessage(null);
      setErrorCode(null);
      await refreshList();
      onDumpsChanged?.();
    } catch (error) {
      applyError(error);
    } finally {
      setIsWorking(false);
    }
  }

  async function handleLoadSample() {
    setIsWorking(true);
    try {
      const sample = await getJson<FigmaDump>("/api/figma-dumps/sample");
      setJsonText(`${JSON.stringify(sample, null, 2)}\n`);
      setShowJsonFallback(true);
      setErrorMessage(null);
      setErrorCode(null);
    } catch (error) {
      applyError(error);
    } finally {
      setIsWorking(false);
    }
  }

  async function handleImport() {
    setIsWorking(true);
    try {
      const stored = await postJson<StoredFigmaDump>(
        "/api/figma-dumps",
        JSON.parse(jsonText) as unknown,
      );
      setSelected(stored);
      onDumpSelected?.(stored.id);
      setErrorMessage(null);
      setErrorCode(null);
      await refreshList();
      onDumpsChanged?.();
    } catch (error) {
      if (error instanceof SyntaxError) {
        setErrorCode("invalid_json");
        setErrorMessage("JSON을 파싱할 수 없습니다.");
      } else {
        applyError(error);
      }
    } finally {
      setIsWorking(false);
    }
  }

  async function handleDelete(id: string) {
    setIsWorking(true);
    try {
      await deleteJson<{ ok: boolean }>(`/api/figma-dumps/${id}`);
      if (selected?.id === id) {
        setSelected(null);
        onDumpSelected?.(null);
      }
      setErrorMessage(null);
      setErrorCode(null);
      await refreshList();
      onDumpsChanged?.();
    } catch (error) {
      applyError(error);
    } finally {
      setIsWorking(false);
    }
  }

  async function handleOpen(id: string) {
    setIsWorking(true);
    try {
      const dump = await getJson<StoredFigmaDump>(`/api/figma-dumps/${id}`);
      setSelected(dump);
      onDumpSelected?.(dump.id);
      setErrorMessage(null);
      setErrorCode(null);
    } catch (error) {
      applyError(error);
    } finally {
      setIsWorking(false);
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") setJsonText(reader.result);
    };
    reader.readAsText(file);
    setShowJsonFallback(true);
  }

  const sourceLabel =
    tokenStatus?.source === "env"
      ? "환경변수"
      : tokenStatus?.source === "local"
        ? "로컬 설정"
        : null;

  return (
    <section className="space-y-4 rounded-xl border border-slate-700 bg-slate-900/70 p-5">
      <header className="space-y-1">
        <h2 className="text-lg font-medium text-white">1. Figma에서 플로우 가져오기</h2>
        <p className="text-sm text-slate-400">
          URL을 넣으면 서버가 Figma API로 덤프를 만듭니다. 토큰은 API/로컬 설정에만
          저장되며 웹 번들에 들어가지 않습니다.
        </p>
      </header>

      <div className="space-y-2 rounded-md border border-slate-700 p-3">
        <p className="text-sm text-slate-300">
          토큰:{" "}
          {tokenStatus?.configured ? (
            <span className="text-emerald-300">
              설정됨 ({sourceLabel}
              {tokenStatus.hint ? ` ${tokenStatus.hint}` : ""})
            </span>
          ) : (
            <span className="text-amber-300">없음 — FIGMA_ACCESS_TOKEN 또는 아래에 저장</span>
          )}
        </p>
        {tokenStatus?.source === "env" ? (
          <p className="text-xs text-slate-500">
            환경변수가 있으면 로컬에 저장한 토큰보다 우선합니다.
          </p>
        ) : null}
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="password"
            autoComplete="off"
            className="flex-1 rounded-md border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-slate-100"
            value={tokenInput}
            onChange={(event) => setTokenInput(event.target.value)}
            placeholder="Figma personal access token"
          />
          <button
            type="button"
            className="rounded-md bg-slate-700 px-3 py-2 text-sm text-white disabled:opacity-50"
            disabled={isWorking || !tokenInput.trim()}
            onClick={() => void handleSaveToken()}
          >
            토큰 저장
          </button>
          <button
            type="button"
            className="rounded-md border border-slate-500 px-3 py-2 text-sm text-slate-200 disabled:opacity-50"
            disabled={isWorking || tokenStatus?.source !== "local"}
            onClick={() => void handleClearToken()}
          >
            로컬 토큰 삭제
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <label className="block text-sm text-slate-400" htmlFor="figma-url">
          Figma URL
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id="figma-url"
            className="flex-1 rounded-md border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-slate-100"
            value={figmaUrl}
            onChange={(event) => setFigmaUrl(event.target.value)}
            placeholder="https://www.figma.com/design/...?node-id=1-2"
          />
          <button
            type="button"
            className="rounded-md bg-emerald-700 px-3 py-2 text-sm text-white disabled:opacity-50"
            disabled={isWorking || !figmaUrl.trim()}
            onClick={() => void handleFromUrl()}
          >
            Figma에서 가져오기
          </button>
        </div>
      </div>

      {errorMessage ? (
        <p className="text-sm text-rose-300" role="alert">
          {errorCode ? <span className="font-mono">[{errorCode}] </span> : null}
          {errorMessage}
        </p>
      ) : null}

      <button
        type="button"
        className="text-sm text-slate-400 underline"
        onClick={() => setShowJsonFallback((value) => !value)}
      >
        {showJsonFallback ? "JSON 직접 가져오기 숨기기" : "JSON으로 직접 가져오기"}
      </button>

      {showJsonFallback ? (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-md bg-sky-700 px-3 py-2 text-sm text-white disabled:opacity-50"
              disabled={isWorking}
              onClick={() => void handleLoadSample()}
            >
              샘플 덤프 불러오기
            </button>
            <label className="cursor-pointer rounded-md border border-slate-500 px-3 py-2 text-sm text-slate-200">
              JSON 파일
              <input
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={handleFileChange}
              />
            </label>
          </div>
          <textarea
            className="h-40 w-full rounded-md border border-slate-600 bg-slate-950 px-3 py-2 font-mono text-xs text-slate-100"
            value={jsonText}
            onChange={(event) => setJsonText(event.target.value)}
            spellCheck={false}
          />
          <button
            type="button"
            className="rounded-md bg-slate-700 px-3 py-2 text-sm text-white disabled:opacity-50"
            disabled={isWorking || !jsonText.trim()}
            onClick={() => void handleImport()}
          >
            JSON 저장
          </button>
        </div>
      ) : null}

      <div className="space-y-2">
        <h3 className="text-sm font-medium text-slate-200">저장된 덤프</h3>
        {isLoadingList ? <p className="text-sm text-slate-400">목록 불러오는 중…</p> : null}
        {!isLoadingList && items.length === 0 ? (
          <p className="text-sm text-slate-500">아직 가져온 덤프가 없습니다.</p>
        ) : null}
        <ul className="space-y-1">
          {items.map((item) => (
            <li key={item.id} className="flex gap-2">
              <button
                type="button"
                className="min-w-0 flex-1 rounded-md border border-slate-700 px-3 py-2 text-left text-sm text-slate-200 hover:border-slate-500"
                onClick={() => void handleOpen(item.id)}
              >
                {item.fileKey} / {item.startNodeId} · 노드 {item.nodeCount} · 연결{" "}
                {item.connectionCount} · {item.source}
              </button>
              <button
                type="button"
                className="rounded-md border border-slate-700 px-2.5 text-sm text-slate-400 hover:border-rose-400 hover:text-rose-300 disabled:opacity-50"
                data-dump-id={item.id}
                aria-label={`${item.fileKey} ${item.id.slice(0, 8)} 덤프 삭제`}
                disabled={isWorking}
                onClick={() => void handleDelete(item.id)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      </div>

      {selected ? (
        <div className="rounded-md border border-slate-700 p-3 text-sm text-slate-300">
          <p className="mb-2 text-slate-100">선택됨: {selected.id}</p>
          <ul className="max-h-40 list-disc overflow-auto pl-5">
            {selected.nodes.map((node) => (
              <li key={node.id}>
                {node.name} ({node.id})
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
