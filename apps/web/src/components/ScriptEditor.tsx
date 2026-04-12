interface Props {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function ScriptEditor({ value, onChange, disabled }: Props) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-slate-500">
        여기에는 Playwright용 TypeScript 스크립트를 작성합니다. 녹화하면 자동으로
        채워지며, 실행 전에 필요하면 수정하세요.
      </p>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        spellCheck={false}
        className="min-h-[280px] w-full resize-y rounded-lg border border-slate-700 bg-slate-950 p-3 font-mono text-xs leading-relaxed text-slate-200 placeholder-slate-600 focus:border-sky-500 focus:outline-none disabled:opacity-50"
        placeholder={`import { test, expect } from '@playwright/test';

test('example', async ({ page }) => {
  await page.goto('https://example.com');
});`}
      />
    </div>
  );
}
