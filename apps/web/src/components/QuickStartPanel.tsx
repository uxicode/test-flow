interface QuickStartPanelProps {
  quickStartUrl: string;
  onQuickStartUrlChange: (url: string) => void;
  onCreateWithStartUrl: () => void;
  onCreateEmpty: () => void;
  onOpenDocTc: () => void;
}

export function QuickStartPanel({
  quickStartUrl,
  onQuickStartUrlChange,
  onCreateWithStartUrl,
  onCreateEmpty,
  onOpenDocTc,
}: QuickStartPanelProps) {
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-slate-800 bg-slate-900/50 p-6">
      <h2 className="text-base font-semibold text-slate-200">
        시나리오 만들기
      </h2>
      <p className="text-sm text-slate-500">
        테스트할 웹 페이지 주소(https://…)를 입력한 뒤 버튼을 누르면,
        빌더에 <strong className="text-slate-400">페이지 이동</strong> 스텝이
        자동으로 들어갑니다. 녹화에 쓰는 URL도 같이 맞춰 둡니다.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <label
            htmlFor="quick-start-url"
            className="text-xs font-medium text-slate-500"
          >
            테스트 시작 URL
          </label>
          <input
            id="quick-start-url"
            type="url"
            value={quickStartUrl}
            onChange={(e) => onQuickStartUrlChange(e.target.value)}
            placeholder="https://example.com"
            className="rounded-lg border border-slate-600 bg-slate-950 px-3 py-2.5 text-sm text-slate-200 placeholder-slate-600 focus:border-sky-500 focus:outline-none"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onCreateWithStartUrl}
            className="rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-sky-500"
          >
            URL로 시나리오 만들기
          </button>
          <button
            type="button"
            onClick={onCreateEmpty}
            className="rounded-lg border border-slate-600 px-4 py-2.5 text-sm font-medium text-slate-300 hover:border-slate-500"
          >
            빈 시나리오
          </button>
          <button
            type="button"
            onClick={onOpenDocTc}
            className="rounded-lg border border-emerald-600 px-4 py-2.5 text-sm font-medium text-emerald-300 hover:bg-emerald-950"
          >
            문서로 TC 만들기
          </button>
        </div>
      </div>
      <p className="text-xs text-slate-600">
        이미 목록에 시나리오가 있으면 왼쪽에서 선택하세요. 기획 문서(PDF·DOCX·HWPX·MD·TXT)가 있으면
        <strong className="text-slate-400"> 문서로 TC 만들기</strong>로 자동 생성할 수 있습니다.
      </p>
    </div>
  );
}
