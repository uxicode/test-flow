import { useEffect, useRef } from "react";
import type { LogEvent } from "../lib/api";

interface LogPanelProps {
  events: LogEvent[];
}

export function LogPanel({ events }: LogPanelProps) {
  const listRef = useRef<HTMLUListElement | null>(null);

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [events]);

  return (
    <section className="space-y-2 rounded-xl border border-slate-700 bg-slate-900/70 p-4">
      <h2 className="text-sm font-medium text-slate-200">진행 로그</h2>
      <ul
        ref={listRef}
        className="h-[calc(100vh-8rem)] space-y-1 overflow-auto rounded-md bg-slate-950 p-3 font-mono text-xs text-slate-300"
        aria-live="polite"
      >
        {events.length === 0 ? (
          <li className="text-slate-500">분석이나 실행을 시작하면 로그가 여기에 쌓입니다.</li>
        ) : (
          events.map((event, index) => (
            <li key={`${event.at}-${index}`}>
              <span className="text-slate-600">{event.at.slice(11, 19)}</span> {event.message}
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
