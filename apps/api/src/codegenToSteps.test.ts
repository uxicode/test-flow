import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { codegenScriptToSteps } from "./codegenToSteps.js";
import { generateSpec } from "./specGenerator.js";
import type { Step } from "./scenarioStore.js";

describe("codegenScriptToSteps", () => {
  it("parses typical codegen output", () => {
    const script = `
import { test, expect } from '@playwright/test';

test('example', async ({ page }) => {
  await page.goto('https://example.com/');
  await page.getByRole('button', { name: 'Submit' }).click();
  await page.getByLabel('Email').fill('a@b.co');
  await expect(page.getByText('Thanks')).toBeVisible();
});
`;
    const { steps, warnings } = codegenScriptToSteps(script);
    assert.equal(warnings.length, 0);
    assert.equal(steps.length, 4);
    assert.equal(steps[0].type, "goto");
    assert.equal(steps[0].selectorValue, "https://example.com/");
    assert.equal(steps[1].type, "click");
    assert.equal(steps[1].selectorStrategy, "role");
    assert.equal(steps[1].role, "button");
    assert.equal(steps[1].selectorValue, "Submit");
    assert.equal(steps[2].type, "fill");
    assert.equal(steps[2].selectorStrategy, "label");
    assert.equal(steps[2].inputValue, "a@b.co");
    assert.equal(steps[3].type, "assert_visible");
    assert.equal(steps[3].selectorStrategy, "text");
    assert.equal(steps[3].selectorValue, "Thanks");
  });

  it("round-trips generateSpec for supported steps", () => {
    const original: Step[] = [
      {
        id: "x1",
        type: "goto",
        selectorStrategy: "css",
        selectorValue: "https://ex.test/",
        role: "button",
      },
      {
        id: "x2",
        type: "click",
        selectorStrategy: "role",
        selectorValue: "Go",
        role: "link",
      },
      {
        id: "x3",
        type: "fill",
        selectorStrategy: "placeholder",
        selectorValue: "Search",
        role: "textbox",
        inputValue: "q",
      },
      {
        id: "x4",
        type: "assert_text",
        selectorStrategy: "testid",
        selectorValue: "msg",
        role: "button",
        inputValue: "ok",
      },
      {
        id: "x5",
        type: "wait_ms",
        selectorStrategy: "css",
        selectorValue: "",
        waitMs: 250,
      },
    ];
    const spec = generateSpec(original);
    const { steps, warnings } = codegenScriptToSteps(spec);
    assert.equal(warnings.length, 0);
    assert.equal(steps.length, original.length);
    for (let i = 0; i < original.length; i++) {
      assert.equal(steps[i].type, original[i].type);
      assert.equal(steps[i].selectorStrategy, original[i].selectorStrategy);
      assert.equal(steps[i].selectorValue, original[i].selectorValue);
      assert.equal(steps[i].role ?? "button", original[i].role ?? "button");
      if (original[i].inputValue != null)
        assert.equal(steps[i].inputValue, original[i].inputValue);
      if (original[i].waitMs != null) assert.equal(steps[i].waitMs, original[i].waitMs);
    }
  });

  it("warns on unmapped lines", () => {
    const script = `
import { test } from '@playwright/test';
test('x', async ({ page }) => {
  await page.keyboard.press('Enter');
});
`;
    const { steps, warnings } = codegenScriptToSteps(script);
    assert.equal(steps.length, 0);
    assert.ok(warnings.some((w) => w.includes("unmapped")));
  });
});
