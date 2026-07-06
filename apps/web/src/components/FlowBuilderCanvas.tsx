import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Plus,
  Trash2,
  RotateCcw,
  Sparkles,
  Code,
  FileText,
  MousePointer,
  Move,
  ArrowRight,
} from "lucide-react";
import { analyzeFlowToTestCases, generateMermaidFromFlow, type CustomNode, type CustomEdge } from "../services/doc-tc/flowGraphAnalyzer";
import type { GeneratedDocTestCase } from "../services/doc-tc/types";

interface FlowBuilderCanvasProps {
  onTestCasesGenerated: (testCases: GeneratedDocTestCase[]) => void;
}

const NODE_WIDTH = 180;
const NODE_HEIGHT = 50;

const initialNodes: CustomNode[] = [
  { id: "1", type: "input", label: "로그인 화면 진입", x: 250, y: 30 },
  { id: "2", type: "default", label: "이메일 및 비밀번호 입력", x: 250, y: 130 },
  { id: "3", type: "default", label: "로그인 버튼 클릭", x: 250, y: 230 },
  { id: "4", type: "default", label: "계정 존재 여부 확인?", x: 250, y: 330 },
  { id: "5", type: "output", label: "로그인 완료 및 대시보드 진입", x: 80, y: 460 },
  { id: "6", type: "output", label: "에러 메시지 표시", x: 420, y: 460 },
];

const initialEdges: CustomEdge[] = [
  { id: "e1-2", source: "1", target: "2" },
  { id: "e2-3", source: "2", target: "3" },
  { id: "e3-4", source: "3", target: "4" },
  { id: "e4-5", source: "4", target: "5", label: "존재함" },
  { id: "e4-6", source: "4", target: "6", label: "존재하지 않음" },
];

export function FlowBuilderCanvas({ onTestCasesGenerated }: FlowBuilderCanvasProps) {
  const [nodes, setNodes] = useState<CustomNode[]>(initialNodes);
  const [edges, setEdges] = useState<CustomEdge[]>(initialEdges);

  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  const [drawingSourceId, setDrawingSourceId] = useState<string | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);

  const [nodeLabel, setNodeLabel] = useState("");
  const [nodeType, setNodeType] = useState<"input" | "default" | "output">("default");
  const [edgeLabel, setEdgeLabel] = useState("");

  const [previewTab, setPreviewTab] = useState<"tc" | "mermaid">("tc");

  const canvasRef = useRef<HTMLDivElement>(null);

  // Synchronization refs to prevent closure locks and asynchronous lag in global listeners
  const draggingNodeIdRef = useRef<string | null>(null);
  const isPanningRef = useRef(false);
  const drawingSourceIdRef = useRef<string | null>(null);
  const panRef = useRef({ x: 0, y: 0 });
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const panStartRef = useRef({ x: 0, y: 0 });

  // Strictly sync refs to reflect state mutations
  useEffect(() => { draggingNodeIdRef.current = draggingNodeId; }, [draggingNodeId]);
  useEffect(() => { isPanningRef.current = isPanning; }, [isPanning]);
  useEffect(() => { drawingSourceIdRef.current = drawingSourceId; }, [drawingSourceId]);
  useEffect(() => { panRef.current = pan; }, [pan]);
  useEffect(() => { dragOffsetRef.current = dragOffset; }, [dragOffset]);
  useEffect(() => { panStartRef.current = panStart; }, [panStart]);

  // Global mousemove and mouseup events registered once to guarantee closure validity
  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (!canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();

      if (isPanningRef.current) {
        setPan({
          x: e.clientX - panStartRef.current.x,
          y: e.clientY - panStartRef.current.y,
        });
      } else if (draggingNodeIdRef.current) {
        const rawX = e.clientX - rect.left - panRef.current.x - dragOffsetRef.current.x;
        const rawY = e.clientY - rect.top - panRef.current.y - dragOffsetRef.current.y;
        
        const snapX = Math.round(rawX / 10) * 10;
        const snapY = Math.round(rawY / 10) * 10;

        setNodes((nds) =>
          nds.map((n) => (n.id === draggingNodeIdRef.current ? { ...n, x: snapX, y: snapY } : n))
        );
      } else if (drawingSourceIdRef.current) {
        setMousePos({
          x: e.clientX - rect.left - panRef.current.x,
          y: e.clientY - rect.top - panRef.current.y,
        });
      }
    };

    const handleGlobalMouseUp = () => {
      // Immediately drop refs synchronously to prevent downstream mousemove triggers
      isPanningRef.current = false;
      draggingNodeIdRef.current = null;
      drawingSourceIdRef.current = null;

      setIsPanning(false);
      setDraggingNodeId(null);
      setDrawingSourceId(null);
    };

    window.addEventListener("mousemove", handleGlobalMouseMove);
    window.addEventListener("mouseup", handleGlobalMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleGlobalMouseMove);
      window.removeEventListener("mouseup", handleGlobalMouseUp);
    };
  }, []);

  const getNodeCenter = (node: CustomNode) => {
    return {
      x: node.x + NODE_WIDTH / 2,
      y: node.y + NODE_HEIGHT / 2,
    };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.target === canvasRef.current || (e.target as HTMLElement).id === "svg-overlay") {
      const newPanStart = { x: e.clientX - pan.x, y: e.clientY - pan.y };
      
      // Update refs synchronously first
      panStartRef.current = newPanStart;
      setPanStart(newPanStart);
      
      isPanningRef.current = true;
      setIsPanning(true);
      
      setSelectedNodeId(null);
      setSelectedEdgeId(null);
    }
  };

  const handleNodeStartDrag = (e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return;

    setSelectedNodeId(nodeId);
    setSelectedEdgeId(null);
    setNodeLabel(node.label);
    setNodeType(node.type || "default");

    if (canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      const newOffset = {
        x: e.clientX - rect.left - pan.x - node.x,
        y: e.clientY - rect.top - pan.y - node.y,
      };

      // Set refs immediately to allow immediate mousemove reaction
      dragOffsetRef.current = newOffset;
      setDragOffset(newOffset);
      
      draggingNodeIdRef.current = nodeId;
      setDraggingNodeId(nodeId);
    }
  };

  const handlePortMouseDown = (e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();
    e.preventDefault();
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return;

    const center = getNodeCenter(node);
    const startPos = {
      x: center.x + NODE_WIDTH / 2,
      y: center.y,
    };

    drawingSourceIdRef.current = nodeId;
    setDrawingSourceId(nodeId);
    setMousePos(startPos);
  };

  const handleNodeMouseUp = (e: React.MouseEvent, targetId: string) => {
    if (drawingSourceIdRef.current && drawingSourceIdRef.current !== targetId) {
      const edgeExists = edges.some(
        (edge) => edge.source === drawingSourceIdRef.current && edge.target === targetId
      );
      if (!edgeExists) {
        const newEdge: CustomEdge = {
          id: `e${drawingSourceIdRef.current}-${targetId}`,
          source: drawingSourceIdRef.current,
          target: targetId,
        };
        setEdges((eds) => [...eds, newEdge]);
      }
    }
    
    // Clear drawing guides
    drawingSourceIdRef.current = null;
    setDrawingSourceId(null);
  };

  const handleAddNode = (type: "input" | "default" | "output") => {
    const id = (nodes.reduce((max, n) => Math.max(max, parseInt(n.id) || 0), 0) + 1).toString();
    const label = type === "input" ? "시작 단계" : type === "output" ? "종료/기대결과" : "새로운 단계";
    
    const viewCenterX = -pan.x + 180;
    const viewCenterY = -pan.y + 200;

    const newNode: CustomNode = {
      id,
      type,
      label,
      x: viewCenterX,
      y: viewCenterY,
    };

    setNodes((nds) => [...nds, newNode]);
    setSelectedNodeId(id);
    setSelectedEdgeId(null);
    setNodeLabel(label);
    setNodeType(type);
  };

  useEffect(() => {
    if (!selectedNodeId) return;
    setNodes((nds) =>
      nds.map((n) => (n.id === selectedNodeId ? { ...n, label: nodeLabel, type: nodeType } : n))
    );
  }, [nodeLabel, nodeType, selectedNodeId]);

  useEffect(() => {
    if (!selectedEdgeId) return;
    setEdges((eds) =>
      eds.map((e) => (e.id === selectedEdgeId ? { ...e, label: edgeLabel || undefined } : e))
    );
  }, [edgeLabel, selectedEdgeId]);

  const handleDeleteSelected = () => {
    if (selectedNodeId) {
      setNodes((nds) => nds.filter((n) => n.id !== selectedNodeId));
      setEdges((eds) => eds.filter((e) => e.source !== selectedNodeId && e.target !== selectedNodeId));
      setSelectedNodeId(null);
    } else if (selectedEdgeId) {
      setEdges((eds) => eds.filter((e) => e.id !== selectedEdgeId));
      setSelectedEdgeId(null);
    }
  };

  const handleReset = () => {
    if (window.confirm("다이어그램을 지우고 기본 샘플로 교체하시겠습니까?")) {
      setNodes(initialNodes);
      setEdges(initialEdges);
      setPan({ x: 0, y: 0 });
      setSelectedNodeId(null);
      setSelectedEdgeId(null);
    }
  };

  const handleClear = () => {
    if (window.confirm("캔버스를 완전히 비우시겠습니까?")) {
      setNodes([]);
      setEdges([]);
      setSelectedNodeId(null);
      setSelectedEdgeId(null);
    }
  };

  const generatedTestCases = useMemo(() => {
    return analyzeFlowToTestCases(nodes, edges);
  }, [nodes, edges]);

  useEffect(() => {
    onTestCasesGenerated(generatedTestCases);
  }, [generatedTestCases, onTestCasesGenerated]);

  const mermaidCode = useMemo(() => {
    return generateMermaidFromFlow(nodes, edges);
  }, [nodes, edges]);

  const drawBezierPath = (sx: number, sy: number, tx: number, ty: number) => {
    const dx = tx - sx;
    const ctrlOffset = Math.max(Math.abs(dx) * 0.5, 40);
    return `M ${sx} ${sy} C ${sx + ctrlOffset} ${sy}, ${tx - ctrlOffset} ${ty}, ${tx} ${ty}`;
  };

  return (
    <div className="flex h-[600px] w-full flex-col overflow-hidden rounded-xl border border-slate-800 bg-slate-950 text-slate-200">
      <div className="flex flex-wrap items-center justify-between border-b border-slate-800 bg-slate-900/60 px-4 py-2 select-none">
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => handleAddNode("input")}
            className="flex items-center gap-1 rounded bg-sky-950/80 px-2 py-1 text-xs font-medium text-sky-300 border border-sky-800 hover:bg-sky-900 transition"
          >
            <Plus size={13} />
            시작 노드
          </button>
          <button
            type="button"
            onClick={() => handleAddNode("default")}
            className="flex items-center gap-1 rounded bg-slate-800 px-2 py-1 text-xs font-medium text-slate-300 border border-slate-700 hover:bg-slate-700 transition"
          >
            <Plus size={13} />
            일반 노드
          </button>
          <button
            type="button"
            onClick={() => handleAddNode("output")}
            className="flex items-center gap-1 rounded bg-emerald-950/80 px-2 py-1 text-xs font-medium text-emerald-300 border border-emerald-800 hover:bg-emerald-900 transition"
          >
            <Plus size={13} />
            종료 노드
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleReset}
            className="flex items-center gap-1 rounded border border-slate-700 px-2.5 py-1 text-xs text-slate-400 hover:text-slate-200 hover:border-slate-500 transition"
          >
            <RotateCcw size={13} />
            샘플 로드
          </button>
          <button
            type="button"
            onClick={handleClear}
            className="flex items-center gap-1 rounded border border-slate-700 px-2.5 py-1 text-xs text-slate-400 hover:text-rose-400 hover:border-rose-800 transition"
          >
            <Trash2 size={13} />
            초기화
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          className={`relative flex-1 bg-slate-900 overflow-hidden outline-none ${
            isPanning ? "cursor-grabbing" : "cursor-grab"
          }`}
          style={{
            backgroundImage: "radial-gradient(#334155 1.2px, transparent 1.2px)",
            backgroundSize: "16px 16px",
            backgroundPosition: `${pan.x}px ${pan.y}px`,
          }}
        >
          <div
            className="absolute inset-0 origin-top-left pointer-events-none"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px)`,
            }}
          >
            <svg
              id="svg-overlay"
              className="absolute top-0 left-0 w-full h-full pointer-events-auto"
              style={{ overflow: "visible" }}
            >
              <defs>
                <marker
                  id="arrowhead"
                  viewBox="0 0 10 10"
                  refX="10"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#475569" />
                </marker>
                <marker
                  id="arrowhead-selected"
                  viewBox="0 0 10 10"
                  refX="10"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#f59e0b" />
                </marker>
              </defs>

              {edges.map((edge) => {
                const sourceNode = nodes.find((n) => n.id === edge.source);
                const targetNode = nodes.find((n) => n.id === edge.target);
                if (!sourceNode || !targetNode) return null;

                const sx = sourceNode.x + NODE_WIDTH;
                const sy = sourceNode.y + NODE_HEIGHT / 2;
                const tx = targetNode.x;
                const ty = targetNode.y + NODE_HEIGHT / 2;

                const pathString = drawBezierPath(sx, sy, tx, ty);
                const isSelected = selectedEdgeId === edge.id;

                return (
                  <g key={edge.id} className="pointer-events-auto cursor-pointer">
                    <path
                      d={pathString}
                      fill="none"
                      stroke="transparent"
                      strokeWidth={14}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedEdgeId(edge.id);
                        setSelectedNodeId(null);
                        setEdgeLabel(edge.label || "");
                      }}
                    />
                    <path
                      d={pathString}
                      fill="none"
                      stroke={isSelected ? "#f59e0b" : "#475569"}
                      strokeWidth={isSelected ? 2.5 : 2}
                      markerEnd={`url(#${isSelected ? "arrowhead-selected" : "arrowhead"})`}
                      className="transition"
                    />
                  </g>
                );
              })}

              {drawingSourceId && (() => {
                const srcNode = nodes.find((n) => n.id === drawingSourceId);
                if (!srcNode) return null;
                const sx = srcNode.x + NODE_WIDTH;
                const sy = srcNode.y + NODE_HEIGHT / 2;
                return (
                  <path
                    d={drawBezierPath(sx, sy, mousePos.x, mousePos.y)}
                    fill="none"
                    stroke="#f59e0b"
                    strokeWidth={2}
                    strokeDasharray="4 4"
                  />
                );
              })()}
            </svg>

            {nodes.map((node) => {
              const isSelected = selectedNodeId === node.id;
              
              let borderStyle = "border-slate-800 hover:border-slate-600";
              let bgStyle = "bg-slate-950/95";
              let textColor = "text-slate-100";

              if (node.type === "input") {
                bgStyle = "bg-sky-950/80";
                borderStyle = isSelected ? "border-sky-400" : "border-sky-700/80 hover:border-sky-500";
                textColor = "text-sky-200";
              } else if (node.type === "output") {
                bgStyle = "bg-emerald-950/80";
                borderStyle = isSelected ? "border-emerald-400" : "border-emerald-700/80 hover:border-emerald-500";
                textColor = "text-emerald-200";
              } else if (node.label.endsWith("?") || node.label.includes("여부") || node.label.includes("인가")) {
                borderStyle = isSelected ? "border-amber-400" : "border-amber-800 hover:border-amber-600";
              } else if (isSelected) {
                borderStyle = "border-sky-500";
              }

              return (
                <div
                  key={node.id}
                  onMouseDown={(e) => handleNodeStartDrag(e, node.id)}
                  onMouseUp={(e) => handleNodeMouseUp(e, node.id)}
                  onDragStart={(e) => e.preventDefault()}
                  draggable="false"
                  className={`absolute pointer-events-auto flex items-center justify-between rounded-lg border-2 ${bgStyle} ${borderStyle} ${textColor} px-3 py-1.5 transition-shadow shadow-md select-none`}
                  style={{
                    left: node.x,
                    top: node.y,
                    width: NODE_WIDTH,
                    height: NODE_HEIGHT,
                    cursor: "move",
                    zIndex: isSelected ? 10 : 2,
                  }}
                >
                  <div className="flex-1 overflow-hidden pr-2">
                    <p className="truncate text-xs font-semibold text-center leading-snug">
                      {node.label}
                    </p>
                  </div>

                  {node.type !== "output" && (
                    <div
                      onMouseDown={(e) => handlePortMouseDown(e, node.id)}
                      className="absolute top-1/2 -right-1.5 h-3.5 w-3.5 -translate-y-1/2 rounded-full border-2 border-slate-700 bg-sky-500 hover:bg-sky-400 hover:scale-125 cursor-crosshair z-20 transition"
                      title="화살표 그리기"
                    />
                  )}
                </div>
              );
            })}

            {edges.map((edge) => {
              if (!edge.label) return null;
              const sourceNode = nodes.find((n) => n.id === edge.source);
              const targetNode = nodes.find((n) => n.id === edge.target);
              if (!sourceNode || !targetNode) return null;

              const sx = sourceNode.x + NODE_WIDTH;
              const sy = sourceNode.y + NODE_HEIGHT / 2;
              const tx = targetNode.x;
              const ty = targetNode.y + NODE_HEIGHT / 2;
              
              const midX = sx + (tx - sx) * 0.5;
              const midY = sy + (ty - sy) * 0.5;
              const isSelected = selectedEdgeId === edge.id;

              return (
                <button
                  key={`label-${edge.id}`}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedEdgeId(edge.id);
                    setSelectedNodeId(null);
                    setEdgeLabel(edge.label || "");
                  }}
                  className={`absolute pointer-events-auto -translate-x-1/2 -translate-y-1/2 rounded border px-1.5 py-0.5 text-[10px] font-medium leading-none shadow transition ${
                    isSelected
                      ? "border-amber-400 bg-amber-950 text-amber-200 z-30"
                      : "border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700"
                  }`}
                  style={{
                    left: midX,
                    top: midY,
                  }}
                >
                  {edge.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex w-72 flex-col border-l border-slate-800 bg-slate-950 select-none">
          {selectedNodeId && (
            <div className="border-b border-slate-800 p-4">
              <h4 className="text-xs font-semibold text-sky-400 uppercase tracking-wider mb-2.5">
                선택된 단계 편집
              </h4>
              <div className="flex flex-col gap-3">
                <label className="flex flex-col gap-1 text-[11px] text-slate-400">
                  노드 타입
                  <select
                    value={nodeType}
                    onChange={(e) => setNodeType(e.target.value as any)}
                    className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-200 outline-none"
                  >
                    <option value="input">시작 단계 (Input)</option>
                    <option value="default">일반 단계 (Process)</option>
                    <option value="output">종료/기대결과 (Output)</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-[11px] text-slate-400">
                  단계 설명
                  <textarea
                    rows={2}
                    value={nodeLabel}
                    onChange={(e) => setNodeLabel(e.target.value)}
                    className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-200 outline-none focus:border-sky-500 resize-none"
                    placeholder="예: 로그인 버튼 클릭"
                  />
                </label>
                <button
                  type="button"
                  onClick={handleDeleteSelected}
                  className="flex items-center justify-center gap-1 rounded bg-rose-950/80 border border-rose-800 hover:bg-rose-900 py-1.5 text-xs text-rose-300 mt-1 transition"
                >
                  <Trash2 size={13} />
                  이 노드 삭제
                </button>
              </div>
            </div>
          )}

          {selectedEdgeId && (
            <div className="border-b border-slate-800 p-4">
              <h4 className="text-xs font-semibold text-amber-400 uppercase tracking-wider mb-2.5">
                선택된 화살표 편집
              </h4>
              <div className="flex flex-col gap-3">
                <label className="flex flex-col gap-1 text-[11px] text-slate-400">
                  분기 조건 (화살표 이름)
                  <input
                    type="text"
                    value={edgeLabel}
                    onChange={(e) => setEdgeLabel(e.target.value)}
                    className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-200 outline-none focus:border-amber-500"
                    placeholder="예: 성공, 실패, 예, 아니오"
                  />
                </label>
                <button
                  type="button"
                  onClick={handleDeleteSelected}
                  className="flex items-center justify-center gap-1 rounded bg-rose-950/80 border border-rose-800 hover:bg-rose-900 py-1.5 text-xs text-rose-300 mt-1 transition"
                >
                  <Trash2 size={13} />
                  이 화살표 삭제
                </button>
              </div>
            </div>
          )}

          {!selectedNodeId && !selectedEdgeId && (
            <div className="flex items-center justify-center border-b border-slate-800 bg-slate-900/10 p-4 min-h-[160px] text-center">
              <p className="text-xs text-slate-500 leading-relaxed">
                편집할 박스 또는 화살표 선을 클릭하면<br />상세 설정이 여기에 나타납니다.
              </p>
            </div>
          )}

          <div className="flex flex-1 flex-col overflow-hidden">
            <nav className="flex border-b border-slate-800 text-[11px]">
              <button
                type="button"
                onClick={() => setPreviewTab("tc")}
                className={`flex-1 py-2 text-center font-medium ${
                  previewTab === "tc"
                    ? "bg-slate-900 text-sky-400 border-b-2 border-sky-500"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <span className="flex items-center justify-center gap-1">
                  <FileText size={11} />
                  추출 경로 ({generatedTestCases.length})
                </span>
              </button>
              <button
                type="button"
                onClick={() => setPreviewTab("mermaid")}
                className={`flex-1 py-2 text-center font-medium ${
                  previewTab === "mermaid"
                    ? "bg-slate-900 text-sky-400 border-b-2 border-sky-500"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <span className="flex items-center justify-center gap-1">
                  <Code size={11} />
                  Mermaid
                </span>
              </button>
            </nav>

            <div className="flex-1 overflow-y-auto p-3 text-xs">
              {previewTab === "mermaid" ? (
                <pre className="rounded bg-slate-900 p-2 text-[10px] text-slate-300 font-mono overflow-x-auto whitespace-pre-wrap select-all">
                  {mermaidCode}
                </pre>
              ) : (
                <ul className="flex flex-col gap-2">
                  {generatedTestCases.length === 0 ? (
                    <li className="text-center text-slate-500 text-[11px] py-4">
                      연결된 시나리오 흐름 경로가 없습니다.
                    </li>
                  ) : (
                    generatedTestCases.map((tc, idx) => (
                      <li
                        key={tc.id}
                        className="rounded border border-slate-800 bg-slate-900/30 p-2 hover:bg-slate-900/60"
                      >
                        <div className="flex items-center justify-between gap-1 text-[9px] text-slate-500 mb-1">
                          <span className={`px-1 py-0.5 rounded text-[8px] font-bold ${
                            tc.type === "negative" ? "bg-rose-950 text-rose-300" : "bg-sky-950 text-sky-300"
                          }`}>
                            {tc.type === "negative" ? "예외/실패" : "정상흐름"}
                          </span>
                          <span>경로 {idx + 1}</span>
                        </div>
                        <h5 className="font-medium text-slate-200 leading-snug break-all text-[11px]">
                          {tc.title}
                        </h5>
                        <p className="text-[9px] text-slate-400 mt-1">
                          스텝: {tc.steps.length}개 · 결과: {tc.expectedResults[0]}
                        </p>
                      </li>
                    ))
                  )}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
