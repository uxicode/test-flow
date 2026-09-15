import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SAMPLE_CHECKOUT_DUMP } from "@testflow/figma-ingest";
import { dumpToMermaid } from "./dump-to-mermaid.js";
import { MERMAID_ERROR, MermaidError } from "./error-codes.js";
import { validateMermaid } from "./validate-mermaid.js";

describe("dumpToMermaid", () => {
  it("샘플 체크아웃의 분기 라벨을 보존한다", () => {
    const ir = dumpToMermaid(SAMPLE_CHECKOUT_DUMP);
    assert.match(ir.mermaid, /^flowchart TD/m);
    assert.match(ir.mermaid, /-->\|성공\|/);
    assert.match(ir.mermaid, /-->\|실패\|/);
    assert.equal(ir.checksum.length, 64);
    assert.ok(ir.nodeMap.some((entry) => entry.figmaNodeId === "1:1"));
    validateMermaid(ir.mermaid);
  });

  it("빈 덤프는 empty_dump", () => {
    assert.throws(
      () =>
        dumpToMermaid({
          fileKey: "x",
          startNodeId: "1:1",
          nodes: [],
          connections: [],
        }),
      (error: unknown) =>
        error instanceof MermaidError && error.code === MERMAID_ERROR.emptyDump,
    );
  });
});
