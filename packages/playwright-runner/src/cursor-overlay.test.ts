import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CURSOR_OVERLAY_SCRIPT } from "./cursor-overlay.js";

describe("CURSOR_OVERLAY_SCRIPT", () => {
  it("페이지 DOM에 가상 커서를 그리고 이동시킨다", () => {
    assert.match(CURSOR_OVERLAY_SCRIPT, /testflow-virtual-cursor/);
    assert.match(CURSOR_OVERLAY_SCRIPT, /__testflowMoveCursor/);
    assert.match(CURSOR_OVERLAY_SCRIPT, /pointerEvents/);
  });
});
