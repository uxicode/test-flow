export function AppHeader() {
  return (
    <header className="border-b border-slate-800 pb-4">
      <h1 className="text-xl font-semibold tracking-tight">TestFlow</h1>
      <p className="mt-1 text-sm text-slate-400">
        아래에 테스트할 URL을 입력해 시나리오를 만들거나, 왼쪽 &quot;+ 새로&quot;로
        빈 시나리오를 만든 뒤 빌더에서 스텝을 추가하세요.
      </p>
    </header>
  );
}
