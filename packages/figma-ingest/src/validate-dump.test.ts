import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { INGEST_ERROR, IngestError } from "./error-codes.js";
import { SAMPLE_CHECKOUT_DUMP } from "./sample-checkout.js";
import { ingestFromJsonText, ingestFromMcp } from "./ingest.js";
import { validateDump } from "./validate-dump.js";

describe("validateDump", () => {
  it("샘플 체크아웃 덤프를 통과시킨다", () => {
    const dump = validateDump(SAMPLE_CHECKOUT_DUMP);
    assert.equal(dump.nodes.length, 6);
    assert.equal(dump.startNodeId, "1:1");
  });

  it("시작 노드가 없으면 node_not_found", () => {
    assert.throws(
      () => validateDump({ ...SAMPLE_CHECKOUT_DUMP, startNodeId: "9:9" }),
      (error: unknown) =>
        error instanceof IngestError && error.code === INGEST_ERROR.nodeNotFound,
    );
  });

  it("깨진 JSON이면 invalid_json", () => {
    assert.throws(
      () => ingestFromJsonText("{"),
      (error: unknown) =>
        error instanceof IngestError && error.code === INGEST_ERROR.invalidJson,
    );
  });

  it("MCP 경로는 항상 mcp_unavailable", () => {
    assert.throws(
      () => ingestFromMcp(),
      (error: unknown) =>
        error instanceof IngestError &&
        error.code === INGEST_ERROR.mcpUnavailable,
    );
  });
});
