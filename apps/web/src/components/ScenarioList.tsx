import { useEffect, useRef, useState } from "react";
import type { ScenarioSummary } from "../types";

interface Props {
  items: ScenarioSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, name: string) => void;
}

interface EditingState {
  id: string;
  value: string;
}

export function ScenarioList({
  items,
  selectedId,
  onSelect,
  onCreate,
  onDelete,
  onRename,
}: Props) {
  const [editing, setEditing] = useState<EditingState | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  function startEdit(s: ScenarioSummary) {
    setEditing({ id: s.id, value: s.name });
  }

  function commitEdit() {
    if (!editing) return;
    onRename(editing.id, editing.value);
    setEditing(null);
  }

  function cancelEdit() {
    setEditing(null);
  }

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
            + new
          </button>
        </div>
        <p className="text-[11px] leading-snug text-slate-600">
          더블 클릭으로 이름을 변경할 수 있습니다.
        </p>
      </div>
      <ul className="flex flex-1 flex-col gap-1 overflow-y-auto">
        {items.length === 0 ? (
          <li className="text-xs text-slate-600">저장된 항목이 없습니다</li>
        ) : (
          items.map((s) => (
            <li key={s.id} className="group flex items-center gap-1">
              {editing?.id === s.id ? (
                <input
                  ref={inputRef}
                  type="text"
                  value={editing.value}
                  onChange={(e) =>
                    setEditing({ id: s.id, value: e.target.value })
                  }
                  onBlur={commitEdit}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitEdit();
                    if (e.key === "Escape") cancelEdit();
                  }}
                  className="min-w-0 flex-1 rounded border border-sky-500 bg-slate-900 px-2 py-1 text-sm text-slate-200 focus:outline-none"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => onSelect(s.id)}
                  onDoubleClick={() => startEdit(s)}
                  title="더블 클릭으로 이름 변경"
                  className={`min-w-0 flex-1 truncate rounded px-2 py-1.5 text-left text-sm transition-colors ${
                    selectedId === s.id
                      ? "bg-slate-800 text-sky-300"
                      : "text-slate-300 hover:bg-slate-800/60"
                  }`}
                >
                  {s.name}
                </button>
              )}
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
