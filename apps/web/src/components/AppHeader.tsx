interface AppHeaderProps {
  onOpenDocTc: () => void;
}

export function AppHeader({ onOpenDocTc }: AppHeaderProps) {
  return (
    <header className="flex items-end justify-between border-b border-slate-800 pb-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">TestFlow</h1>
        <p className="mt-1 text-sm text-slate-400">
          아래에 테스트할 URL을 입력해 시나리오를 만들거나, 왼쪽 &quot;+ 새로&quot;로
          빈 시나리오를 만든 뒤 빌더에서 스텝을 추가하세요.
        </p>
      </div>
      <div>
        <button
          type="button"
          onClick={onOpenDocTc}
          className="rounded-lg border border-emerald-600 px-3 py-1.5 text-xs font-medium text-emerald-300 hover:bg-emerald-950"
        >
          문서로 TC 만들기
        </button>
      </div>
    </header>
  );
}
