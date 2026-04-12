import type { SmartTC } from "../types";

const ACTION_BADGE: Record<SmartTC["action"], string> = {
  navigate: "bg-sky-900/60 text-sky-200",
  click: "bg-violet-900/60 text-violet-200",
  fill: "bg-emerald-900/60 text-emerald-200",
  check: "bg-teal-900/60 text-teal-200",
  assert: "bg-amber-900/60 text-amber-200",
  wait: "bg-slate-700 text-slate-300",
  screenshot: "bg-rose-900/60 text-rose-200",
};

const ACTION_LABEL: Record<SmartTC["action"], string> = {
  navigate: "이동",
  click: "클릭",
  fill: "입력",
  check: "체크",
  assert: "검증",
  wait: "대기",
  screenshot: "캡처",
};

interface Props {
  items: SmartTC[];
  /** 좁은 패널·사이드바용 작은 표 */
  compact?: boolean;
}

export function SmartTcTable({ items, compact = false }: Props) {
  if (items.length === 0) return null;

  const th = compact
    ? "px-2 py-1.5 text-[10px]"
    : "px-3 py-2 text-xs";
  const td = compact
    ? "px-2 py-1.5 text-[10px]"
    : "px-3 py-2.5 text-sm";

  return (
    <div
      className={
        compact
          ? "overflow-x-auto rounded border border-slate-800"
          : "overflow-x-auto rounded-lg border border-slate-800"
      }
    >
      <table className="w-full text-sm">
        <thead>
          <tr
            className={`border-b border-slate-800 bg-slate-900/80 text-left text-slate-500 ${compact ? "text-[10px]" : "text-xs"}`}
          >
            <th className={`${th} font-medium`}>#</th>
            <th className={`${th} font-medium`}>액션</th>
            <th className={`${th} font-medium`}>대상</th>
            <th className={`${th} font-medium`}>설명</th>
            <th className={`${th} font-medium`}>셀렉터 코드</th>
          </tr>
        </thead>
        <tbody>
          {items.map((tc) => (
            <tr
              key={tc.step}
              className="border-b border-slate-800/60 bg-slate-900/30 hover:bg-slate-800/40"
            >
              <td className={`${td} font-mono text-slate-500`}>{tc.step}</td>
              <td className={td}>
                <span
                  className={`rounded-full px-2 py-0.5 whitespace-nowrap text-xs font-semibold ${ACTION_BADGE[tc.action]}`}
                >
                  {ACTION_LABEL[tc.action]}
                </span>
              </td>
              <td
                className={`max-w-[140px] truncate text-slate-300 ${compact ? "text-[10px]" : "text-xs"}`}
              >
                {tc.target}
              </td>
              <td className={`text-slate-200 ${compact ? "text-[10px]" : "text-xs"}`}>
                {tc.description}
              </td>
              <td className={td}>
                <code
                  className={`block max-w-[180px] truncate rounded bg-slate-900 px-1.5 py-0.5 font-mono text-emerald-300 ${compact ? "text-[10px]" : "text-[11px]"}`}
                >
                  {tc.selector}
                </code>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
