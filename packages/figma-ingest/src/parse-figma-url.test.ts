import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { INGEST_ERROR, IngestError } from "./error-codes.js";
import { parseFigmaUrl } from "./parse-figma-url.js";

describe("parseFigmaUrl", () => {
  it("design URL에서 fileKey와 node-id를 읽는다", () => {
    const parsed = parseFigmaUrl(
      "https://www.figma.com/design/AbC123xyz/Checkout?node-id=1-2&t=abc",
    );
    assert.equal(parsed.fileKey, "AbC123xyz");
    assert.equal(parsed.startNodeId, "1:2");
  });

  it("이미 콜론이 있는 node-id는 유지한다", () => {
    const parsed = parseFigmaUrl(
      "https://figma.com/file/Key99/Name?node-id=12%3A34",
    );
    assert.equal(parsed.fileKey, "Key99");
    assert.equal(parsed.startNodeId, "12:34");
  });

  it("잘못된 URL이면 invalid_url을 던진다", () => {
    assert.throws(
      () => parseFigmaUrl("https://example.com/x"),
      (error: unknown) =>
        error instanceof IngestError && error.code === INGEST_ERROR.invalidUrl,
    );
  });
});
