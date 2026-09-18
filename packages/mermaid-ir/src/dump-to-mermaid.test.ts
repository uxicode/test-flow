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

  it("비전 워크플로우 덤프를 flowchart로 만든다", () => {
    const ir = dumpToMermaid({
      fileKey: "file",
      startNodeId: "1:1",
      nodes: [
        { id: "1:1", name: "로그인 프로세스" },
        { id: "s2", name: "로그인 화면 진입" },
        { id: "s3", name: "이메일 입력" },
        { id: "s4", name: "존재하지 않음" },
      ],
      connections: [
        { from: "1:1", to: "s2" },
        { from: "s2", to: "s3" },
        { from: "s2", to: "s4", label: "실패" },
      ],
    });
    assert.match(ir.mermaid, /로그인 화면 진입/);
    assert.match(ir.mermaid, /-->\|실패\|/);
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
