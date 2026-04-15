import { randomUUID } from "node:crypto";
import type { SelectorStrategy, Step, StepType } from "./scenarioStore.js";

export interface CodegenParseResult {
  steps: Step[];
  warnings: string[];
}

function newStep(type: StepType, partial: Partial<Step> = {}): Step {
  const base: Step = {
    id: randomUUID().slice(0, 8),
    type,
    selectorStrategy: "css",
    selectorValue: "",
    role: "button",
    inputValue: "",
    waitMs: 1000,
    label: "",
  };
  return { ...base, ...partial, type, id: base.id };
}

/** Pull first `async ({ page }) => { ... }` callback body (Playwright test / generateSpec). */
export function extractTestBody(script: string): string | null {
  const m = script.match(/async\s*\(\s*\{\s*page\s*\}\s*\)\s*=>\s*\{/);
  if (!m || m.index === undefined) return null;
  let i = m.index + m[0].length;
  let depth = 1;
  while (i < script.length && depth > 0) {
    const ch = script[i];
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
    i++;
  }
  if (depth !== 0) return null;
  return script.slice(m.index + m[0].length, i - 1);
}

/** Quoted string as a single capture group (for goto/fill/expect text). */
const QSTR_CAP = String.raw`('(?:\\.|[^'])*'|"(?:\\.|[^"])*")`;

function unquote(s: string): string {
  const t = s.trim();
  if (t.startsWith('"') && t.endsWith('"')) return JSON.parse(t) as string;
  if (t.startsWith("'") && t.endsWith("'"))
    return t
      .slice(1, -1)
      .replace(/\\'/g, "'")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\");
  return t;
}

/** Parse `page.getByRole('x', { name: 'y' })` tail after `page.` */
function parsePageLocator(afterPageDot: string): {
  strategy: SelectorStrategy;
  selectorValue: string;
  role: string;
} | null {
  const gr = afterPageDot.match(
    /^getByRole\s*\(\s*('(?:\\.|[^'])*'|"(?:\\.|[^"])*")\s*,\s*\{\s*name\s*:\s*('(?:\\.|[^'])*'|"(?:\\.|[^"])*")\s*\}\s*\)/,
  );
  if (gr) {
    return {
      strategy: "role",
      role: unquote(gr[1]),
      selectorValue: unquote(gr[2]),
    };
  }
  const gt = afterPageDot.match(/^getByText\s*\(\s*('(?:\\.|[^'])*'|"(?:\\.|[^"])*")\s*\)/);
  if (gt) return { strategy: "text", role: "button", selectorValue: unquote(gt[1]) };
  const gl = afterPageDot.match(/^getByLabel\s*\(\s*('(?:\\.|[^'])*'|"(?:\\.|[^"])*")\s*\)/);
  if (gl) return { strategy: "label", role: "textbox", selectorValue: unquote(gl[1]) };
  const gp = afterPageDot.match(
    /^getByPlaceholder\s*\(\s*('(?:\\.|[^'])*'|"(?:\\.|[^"])*")\s*\)/,
  );
  if (gp) return { strategy: "placeholder", role: "textbox", selectorValue: unquote(gp[1]) };
  const gid = afterPageDot.match(/^getByTestId\s*\(\s*('(?:\\.|[^'])*'|"(?:\\.|[^"])*")\s*\)/);
  if (gid) return { strategy: "testid", role: "button", selectorValue: unquote(gid[1]) };
  const loc = afterPageDot.match(/^locator\s*\(\s*('(?:\\.|[^'])*'|"(?:\\.|[^"])*")\s*\)/);
  if (loc) return { strategy: "css", role: "button", selectorValue: unquote(loc[1]) };
  return null;
}

function locatorFromExpr(expr: string): {
  strategy: SelectorStrategy;
  selectorValue: string;
  role: string;
} | null {
  const t = expr.trim();
  const pm = t.match(/^page\.(.+)$/s);
  if (!pm) return null;
  return parsePageLocator(pm[1]);
}

function parseActionLine(line: string): Step | null {
   const goto = line.match(
    new RegExp(String.raw`^await\s+page\.goto\s*\(\s*${QSTR_CAP}\s*\)\s*;?\s*$`),
  );
  if (goto) {
    const url = unquote(goto[1]);
    return newStep("goto", { selectorStrategy: "css", selectorValue: url, role: "button" });
  }

  const waitMs = line.match(/^await\s+page\.waitForTimeout\s*\(\s*(\d+)\s*\)\s*;?\s*$/);
  if (waitMs) {
    return newStep("wait_ms", {
      selectorStrategy: "css",
      selectorValue: "",
      waitMs: Number(waitMs[1]),
    });
  }

  const click2 = line.match(/^await\s+(page\.[\s\S]+?)\.click\s*\(\s*\)\s*;?\s*$/);
  if (click2) {
    const loc = locatorFromExpr(click2[1]);
    if (loc)
      return newStep("click", {
        selectorStrategy: loc.strategy,
        selectorValue: loc.selectorValue,
        role: loc.role as Step["role"],
      });
  }

  const fill = line.match(
    new RegExp(
      String.raw`^await\s+(page\.[\s\S]+?)\.fill\s*\(\s*${QSTR_CAP}\s*\)\s*;?\s*$`,
    ),
  );
  if (fill) {
    const loc = locatorFromExpr(fill[1]);
    if (loc)
      return newStep("fill", {
        selectorStrategy: loc.strategy,
        selectorValue: loc.selectorValue,
        role: loc.role as Step["role"],
        inputValue: unquote(fill[2]),
      });
  }

  const check = line.match(/^await\s+(page\.[\s\S]+?)\.check\s*\(\s*\)\s*;?\s*$/);
  if (check) {
    const loc = locatorFromExpr(check[1]);
    if (loc)
      return newStep("check", {
        selectorStrategy: loc.strategy,
        selectorValue: loc.selectorValue,
        role: loc.role as Step["role"],
      });
  }

  const waitVis = line.match(
    /^await\s+(page\.[\s\S]+?)\.waitFor\s*\(\s*\{\s*state\s*:\s*['"]visible['"]\s*\}\s*\)\s*;?\s*$/,
  );
  if (waitVis) {
    const loc = locatorFromExpr(waitVis[1]);
    if (loc)
      return newStep("wait_for_selector", {
        selectorStrategy: loc.strategy,
        selectorValue: loc.selectorValue,
        role: loc.role as Step["role"],
      });
  }

  return null;
}

function parseExpectLine(line: string): Step | null {
  const vis = line.match(
    /^await\s+expect(?:\.soft)?\s*\(([\s\S]+?)\)\.toBeVisible\s*\(\s*\)\s*;?\s*$/,
  );
  if (vis) {
    const loc = locatorFromExpr(vis[1]);
    if (loc)
      return newStep("assert_visible", {
        selectorStrategy: loc.strategy,
        selectorValue: loc.selectorValue,
        role: loc.role as Step["role"],
      });
  }
  const hid = line.match(
    /^await\s+expect(?:\.soft)?\s*\(([\s\S]+?)\)\.toBeHidden\s*\(\s*\)\s*;?\s*$/,
  );
  if (hid) {
    const loc = locatorFromExpr(hid[1]);
    if (loc)
      return newStep("assert_hidden", {
        selectorStrategy: loc.strategy,
        selectorValue: loc.selectorValue,
        role: loc.role as Step["role"],
      });
  }
  const txt = line.match(
    new RegExp(
      String.raw`^await\s+expect(?:\.soft)?\s*\(([\s\S]+?)\)\.toHaveText\s*\(\s*${QSTR_CAP}\s*\)\s*;?\s*$`,
    ),
  );
  if (txt) {
    const loc = locatorFromExpr(txt[1]);
    if (loc)
      return newStep("assert_text", {
        selectorStrategy: loc.strategy,
        selectorValue: loc.selectorValue,
        role: loc.role as Step["role"],
        inputValue: unquote(txt[2]),
      });
  }
  return null;
}

function normalizeLine(line: string): string {
  return line.trim().replace(/^\s*await\s+/, "await ").trim();
}

/**
 * Convert Playwright codegen / generateSpec-shaped test script to builder steps.
 * Unsupported constructs are reported in `warnings` (one line per issue).
 */
export function codegenScriptToSteps(script: string): CodegenParseResult {
  const warnings: string[] = [];
  const body = extractTestBody(script);
  if (!body) {
    warnings.push("no_test_callback_found");
    return { steps: [], warnings };
  }

  const steps: Step[] = [];
   const rawLines = body.split(/\n/);
  const merged: string[] = [];
  let buf = "";
  for (const ln of rawLines) {
    const t = ln.trim();
    if (!t || t.startsWith("//")) continue;
    buf = buf ? `${buf} ${t}` : t;
    if (/;\s*$/.test(buf)) {
      merged.push(buf);
      buf = "";
    }
  }
  if (buf.trim()) merged.push(buf);

  for (const chunk of merged) {
    const line = normalizeLine(chunk);
    if (!line) continue;
    const exp = parseExpectLine(line);
    if (exp) {
      steps.push(exp);
      continue;
    }
    const act = parseActionLine(line);
    if (act) {
      steps.push(act);
      continue;
    }
    warnings.push(`unmapped: ${line.slice(0, 120)}${line.length > 120 ? "…" : ""}`);
  }

  return { steps, warnings };
}
