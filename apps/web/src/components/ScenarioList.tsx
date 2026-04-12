import type { ScenarioSummary } from "../types";
import { RunHistoryPanel } from "./RunHistoryPanel";

interface Props {
  items: ScenarioSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
  historyRefreshTick: number;
  activeRunId: string | null;
  onHistoryDeletedActiveRun: () => void;
}

export function ScenarioList({
  items,
  selectedId,
  onSelect,
  onCreate,
  onDelete,
  historyRefreshTick,
  activeRunId,
  onHistoryDeletedActiveRun,
}: Props) {
  return (
    <aside className="flex w-80 min-w-72 flex-shrink-0 flex-col gap-3 border-r border-slate-800 pr-4">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            시나리오
          </h2>
          <button
            type="button"
            onClick={onCreate}
            className="rounded bg-sky-600 px-2 py-1 text-xs font-medium text-white hover:bg-sky-500"
          >
            + 새로
          </button>
        </div>
        <p className="text-[11px] leading-snug text-slate-600">
          {
            "오른쪽에서 URL을 입력해 만들거나, 여기서 빈 시나리오를 만든 후 빌더에서 “페이지 이동” 스텝을 추가하세요. 각 항목 아래 “실행 기록”에서 그 시나리오로 돌린 테스트만 확인할 수 있습니다."
          }
        </p>
      </div>
      <ul className="flex flex-1 flex-col gap-2 overflow-y-auto">
        {items.length === 0 ? (
          <li className="text-xs text-slate-600">
            {"\uC800\uC7A5\uB41C \uD56D\uBAA9\uC774 \uC5C6\uC2B5\uB2C8\uB2E4"}
          </li>
        ) : (
          items.map((s) => (
            <li
              key={s.id}
              className="flex flex-col gap-1 rounded-lg border border-slate-800/60 bg-slate-950/20 p-1.5"
            >
              <div className="group flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => onSelect(s.id)}
                  className={`min-w-0 flex-1 truncate rounded px-2 py-1.5 text-left text-sm transition-colors ${
                    selectedId === s.id
                      ? "bg-slate-800 text-sky-300"
                      : "text-slate-300 hover:bg-slate-800/60"
                  }`}
                >
                  {s.name}
                </button>
                <button
                  type="button"
                  title={"\uC0AD\uC81C"}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(s.id);
                  }}
                  className="rounded px-1 text-xs text-slate-500 opacity-0 transition-opacity hover:text-rose-400 group-hover:opacity-100"
                >
                  x
                </button>
              </div>
              <details className="group/runs rounded border border-slate-800/40 bg-slate-900/30">
                <summary className="cursor-pointer list-none px-2 py-1 text-[10px] text-slate-500 hover:bg-slate-800/40 hover:text-slate-400 [&::-webkit-details-marker]:hidden">
                  실행 기록
                </summary>
                <div className="border-t border-slate-800/50 p-1">
                  <RunHistoryPanel
                    scenarioId={s.id}
                    embedded
                    refreshTrigger={historyRefreshTick}
                    activeRunId={activeRunId}
                    onDeletedActiveRun={onHistoryDeletedActiveRun}
                  />
                </div>
              </details>
            </li>
          ))
        )}
      </ul>
    </aside>
  );
}
