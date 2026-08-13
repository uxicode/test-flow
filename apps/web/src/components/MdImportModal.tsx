import React, { useState, useMemo } from "react";
import type { Step } from "../types";
import { parseMarkdownToSteps } from "../services/doc-tc/mdToSteps";
import { STEP_LABELS } from "../types";

interface MdImportModalProps {
  open: boolean;
  onClose: () => void;
  onApply: (steps: Step[], mode: "append" | "replace") => void;
  existingStepCount: number;
}

const SAMPLE_MD_TEXT = `# 시나리오 테스트 플로우 예시

1. 페이지 이동: http://localhost:5174/patient/whole-patient
2. 1500ms 대기
3. API 응답 검증: GET http://localhost:5714/nipa/linked
4. 페이지 이동: http://localhost:5714/referral/
5. 1500ms 대기
6. 의뢰서 상세 팝업 표시 확인 (.referral-confirm-popup)
7. 1500ms 대기
8. 회송서 상세 팝업 표시 확인 (.referral-request-popup)
9. 1500ms 대기
`;

export function MdImportModal({
  open,
  onClose,
  onApply,
  existingStepCount,
}: MdImportModalProps) {
  const [mdContent, setMdContent] = useState("");
  const [applyMode, setApplyMode] = useState<"append" | "replace">("replace");

  const parsedSteps = useMemo(() => {
    return parseMarkdownToSteps(mdContent);
  }, [mdContent]);

  if (!open) return null;

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (text) setMdContent(text);
    };
    reader.readAsText(file, "UTF-8");
  }

  function handleInsertSample() {
    setMdContent(SAMPLE_MD_TEXT);
  }

  function handleConfirm() {
    if (parsedSteps.length === 0) {
      alert("변환할 유효한 마크다운 스텝이 없습니다.");
      return;
    }
    onApply(parsedSteps, applyMode);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl border border-slate-800 bg-slate-900 shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/10 text-sky-400 font-bold border border-sky-500/20">
              MD
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100">
                Markdown(.md) 텍스트로 플로우 반영
              </h2>
              <p className="text-xs text-slate-400">
                .md 형식의 테스트케이스 텍스트를 입력하거나 파일을 업로드하여 시나리오 플로우로 변환합니다.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-5">
          {/* Top Control Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <label className="cursor-pointer rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-700 hover:text-white transition-colors">
                📁 .md 파일 불러오기
                <input
                  type="file"
                  accept=".md,.txt"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
              <button
                type="button"
                onClick={handleInsertSample}
                className="rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-1.5 text-xs font-medium text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors"
              >
                예시 텍스트 넣기
              </button>
            </div>

            {existingStepCount > 0 && (
              <div className="flex items-center gap-3 text-xs text-slate-300 bg-slate-950/60 px-3 py-1.5 rounded-lg border border-slate-800">
                <span className="font-semibold text-slate-400">반영 방식:</span>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="applyMode"
                    value="replace"
                    checked={applyMode === "replace"}
                    onChange={() => setApplyMode("replace")}
                    className="accent-sky-500"
                  />
                  <span>새로 덮어쓰기</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="applyMode"
                    value="append"
                    checked={applyMode === "append"}
                    onChange={() => setApplyMode("append")}
                    className="accent-sky-500"
                  />
                  <span>기존 플로우 뒤에 추가 ({existingStepCount}개)</span>
                </label>
              </div>
            )}
          </div>

          {/* Textarea Input */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-slate-300">
              .md 마크다운 내용 붙여넣기
            </label>
            <textarea
              value={mdContent}
              onChange={(e) => setMdContent(e.target.value)}
              placeholder={`# 테스트 시나리오\n1. 페이지 이동: http://localhost:3000\n2. "로그인" 버튼 클릭\n3. 이메일 입력...`}
              className="h-44 w-full rounded-lg border border-slate-700 bg-slate-950 p-3 font-mono text-xs text-slate-200 placeholder-slate-600 focus:border-sky-500 focus:outline-none"
            />
          </div>

          {/* Real-time Preview */}
          <div className="flex flex-col gap-2 rounded-lg border border-slate-800 bg-slate-950/50 p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-sky-400">
                실시간 변환 미리보기 ({parsedSteps.length}개 스텝 감지됨)
              </span>
              {parsedSteps.length > 0 && (
                <span className="text-[11px] text-slate-400">
                  {applyMode === "append" && existingStepCount > 0
                    ? `최종 ${existingStepCount + parsedSteps.length}개 스텝이 됩니다`
                    : `${parsedSteps.length}개 스텝으로 교체됩니다`}
                </span>
              )}
            </div>

            {parsedSteps.length === 0 ? (
              <p className="py-4 text-center text-xs text-slate-500">
                마크다운 텍스트를 입력하면 분석된 시나리오 스텝 목록이 여기에 표시됩니다.
              </p>
            ) : (
              <div className="max-h-36 overflow-y-auto flex flex-col gap-1.5 pr-1">
                {parsedSteps.map((step, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between rounded bg-slate-900 px-2.5 py-1.5 border border-slate-800/80 text-xs"
                  >
                    <div className="flex items-center gap-2 overflow-hidden">
                      <span className="font-mono text-[10px] text-slate-500 w-5">
                        #{idx + 1}
                      </span>
                      <span className="rounded bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-sky-400 border border-sky-500/20 whitespace-nowrap">
                        {STEP_LABELS[step.type]}
                      </span>
                      <span className="truncate text-slate-200">
                        {step.label || step.selectorValue}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between border-t border-slate-800 px-5 py-3.5 bg-slate-900/80">
          <span className="text-xs text-slate-400">
            {parsedSteps.length > 0
              ? `Ready to import ${parsedSteps.length} steps.`
              : "텍스트를 입력하세요."}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-700 px-4 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800 transition-colors"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={parsedSteps.length === 0}
              className="rounded-lg bg-sky-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-sky-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-lg shadow-sky-900/30"
            >
              플로우에 반영하기
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
