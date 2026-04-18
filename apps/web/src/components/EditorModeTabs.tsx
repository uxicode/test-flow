import type { EditorMode } from "../types";

interface EditorModeTabsProps {
  editorTab: EditorMode;
  onSelectBuilder: () => void;
  onSelectDocTc: () => void;
}

export function EditorModeTabs({
  editorTab,
  onSelectBuilder,
  onSelectDocTc,
}: EditorModeTabsProps) {
  return (
    <div className="flex gap-2 border-b border-slate-800 pb-2">
      <button
        type="button"
        onClick={onSelectBuilder}
        className={`rounded px-3 py-1.5 text-sm font-medium ${
          editorTab === "builder"
            ? "bg-slate-800 text-sky-300"
            : "text-slate-400 hover:text-slate-200"
        }`}
      >
       빌더
      </button>
      <button
        type="button"
        onClick={onSelectDocTc}
        className={`rounded px-3 py-1.5 text-sm font-medium ${
          editorTab === "docTc"
            ? "bg-slate-800 text-sky-300"
            : "text-slate-400 hover:text-slate-200"
        }`}
      >
        문서 TC
      </button>
    </div>
  );
}
