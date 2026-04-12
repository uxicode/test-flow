import type { ScenarioSummary } from "../types";

interface Props {
  items: ScenarioSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
}

export function ScenarioList({
  items,
  selectedId,
  onSelect,
  onCreate,
  onDelete,
}: Props) {
  return (
    <aside className="flex w-56 flex-shrink-0 flex-col gap-3 border-r border-slate-800 pr-4">
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
          오른쪽에서 URL을 넣고 만들거나, 여기서 빈 시나리오를 만든 뒤 빌더에서
          &quot;페이지 이동&quot;을 추가하세요.
        </p>
      </div>
      <ul className="flex flex-1 flex-col gap-1 overflow-y-auto">
        {items.length === 0 ? (
          <li className="text-xs text-slate-600">저장된 항목 없음</li>
        ) : (
          items.map((s) => (
            <li key={s.id} className="group flex items-center gap-1">
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
                title="삭제"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(s.id);
                }}
                className="rounded px-1 text-xs text-slate-500 opacity-0 transition-opacity hover:text-rose-400 group-hover:opacity-100"
              >
                x
              </button>
            </li>
          ))
        )}
      </ul>
    </aside>
  );
}
