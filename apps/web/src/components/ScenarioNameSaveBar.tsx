interface Props {
  name: string;
  onNameChange: (name: string) => void;
  onSave: () => void;
  isSaveBusy: boolean;
}

export function ScenarioNameSaveBar({
  name,
  onNameChange,
  onSave,
  isSaveBusy,
}: Props) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <input
        type="text"
        value={name}
        onChange={(e) => onNameChange(e.target.value)}
        className="min-w-[200px] flex-1 rounded border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-200 focus:border-sky-500 focus:outline-none"
      />
      <button
        type="button"
        onClick={onSave}
        disabled={isSaveBusy}
        className="rounded-lg border border-slate-600 px-4 py-2 text-sm font-medium text-slate-200 hover:border-sky-500 hover:text-sky-300 disabled:opacity-50"
      >
        {isSaveBusy ? "저장 중…" : "저장"}
      </button>
    </div>
  );
}
