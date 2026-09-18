import {
  DUMP_ANALYSIS_METHOD,
  type FigmaDump,
  type FigmaDumpSummary,
  type StoredFigmaDump,
} from "@testflow/figma-ingest";
import { useEffect, useState, type ChangeEvent } from "react";
import {
  clearSessionFigmaToken,
  getSessionTokenStatus,
  mergeTokenStatus,
  readSessionFigmaToken,
  saveSessionFigmaToken,
  TOKEN_SOURCE,
  type TokenStatus,
} from "../lib/figma-token";
import { ApiError, deleteJson, getJson, postJson } from "../lib/http";

interface DumpListResponse {
  items: FigmaDumpSummary[];
}

interface VisionStatus {
  enabled: boolean;
  connected: boolean;
  url: string;
  model: string;
  hasVisionModel: boolean;
  recommendedModel: string;
}

interface IngestPanelProps {
  onDumpSelected?: (dumpId: string | null) => void;
  onDumpsChanged?: () => void;
}

export function IngestPanel({ onDumpSelected, onDumpsChanged }: IngestPanelProps) {
  const [figmaUrl, setFigmaUrl] = useState("");
  const [tokenInput, setTokenInput] = useState("");
  const [tokenStatus, setTokenStatus] = useState<TokenStatus | null>(null);
  const [hasSessionToken, setHasSessionToken] = useState(false);
  const [visionStatus, setVisionStatus] = useState<VisionStatus | null>(null);
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
    const envStatus = await getJson<TokenStatus>("/api/settings/figma");
    const sessionStatus = getSessionTokenStatus();
    setHasSessionToken(sessionStatus.configured);
    setTokenStatus(mergeTokenStatus(envStatus, sessionStatus));
  }

  async function refreshVisionStatus() {
    const status = await getJson<VisionStatus>("/api/settings/vision");
    setVisionStatus(status);
  }

  useEffect(() => {
    void refreshList();
    void refreshTokenStatus().catch(applyError);
    void refreshVisionStatus().catch(applyError);
  }, []);

  async function handleSaveToken() {
    setIsWorking(true);
    try {
      saveSessionFigmaToken(tokenInput);
      await refreshTokenStatus();
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
      clearSessionFigmaToken();
      await refreshTokenStatus();
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
        token: readSessionFigmaToken() ?? undefined,
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
    tokenStatus?.source === TOKEN_SOURCE.env
      ? "환경변수"
      : tokenStatus?.source === TOKEN_SOURCE.session
        ? "세션"
        : null;

  return (
    <section className="space-y-4 rounded-xl border border-slate-700 bg-slate-900/70 p-5">
      <header className="space-y-1">
        <h2 className="text-lg font-medium text-white">1. Figma에서 플로우 가져오기</h2>
        <p className="text-sm text-slate-400">
          URL을 넣으면 서버가 Figma API로 덤프를 만듭니다. 토큰은 이 탭의 세션
          스토리지에만 저장되며 탭을 닫으면 사라집니다. 텍스트 레이어가 없는 한
          장짜리 이미지는 로컬 Ollama(qwen2.5vl:7b)로 화면 텍스트를 추출합니다.
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
        {tokenStatus?.source === TOKEN_SOURCE.env ? (
          <p className="text-xs text-slate-500">
            환경변수가 있으면 세션에 저장한 토큰보다 우선합니다.
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
            disabled={isWorking || !hasSessionToken}
            onClick={() => void handleClearToken()}
          >
            세션 토큰 삭제
          </button>
        </div>
      </div>

      {visionStatus ? (
        <p className="text-xs text-slate-500">
          이미지 분석:{" "}
          {!visionStatus.enabled ? (
            <span>꺼짐 (OLLAMA_VISION=0)</span>
          ) : visionStatus.connected && visionStatus.hasVisionModel ? (
            <span className="text-emerald-300">
              Ollama 연결됨 ({visionStatus.model})
            </span>
          ) : visionStatus.connected ? (
            <span className="text-amber-300">
              Ollama는 켜져 있으나 비전 모델이 없습니다. `ollama pull{" "}
              {visionStatus.recommendedModel}`
            </span>
          ) : (
            <span className="text-amber-300">
              Ollama 없음 — {visionStatus.url} 에서 qwen2.5vl:7b 를 실행하세요
            </span>
          )}
        </p>
      ) : null}

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
          {selected.analysis?.method === DUMP_ANALYSIS_METHOD.vision ? (
            <p className="mb-2 text-xs text-emerald-300">
              이미지 분석으로 워크플로우 추출 · 노드 {selected.nodes.length} ·
              연결 {selected.connections.length}
              {selected.analysis.model ? ` (${selected.analysis.model})` : ""}
            </p>
          ) : null}
          <ul className="max-h-40 list-disc overflow-auto pl-5">
            {selected.nodes.map((node) => (
              <li key={node.id}>
                {node.name} ({node.id})
                {node.text ? (
                  <span className="block text-xs text-slate-400">
                    {node.text.length > 120
                      ? `${node.text.slice(0, 120)}…`
                      : node.text}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
