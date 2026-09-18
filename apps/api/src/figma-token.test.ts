import { INGEST_ERROR, IngestError } from "@testflow/figma-ingest";
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { getTokenStatus, resolveFigmaToken, TOKEN_SOURCE } from "./figma-token.js";

const ENV_KEYS = ["FIGMA_ACCESS_TOKEN", "FIGMA_TOKEN"] as const;

describe("resolveFigmaToken", () => {
  const original = new Map<string, string | undefined>();

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      original.set(key, process.env[key]);
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      const value = original.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("환경변수가 있으면 요청 토큰보다 우선한다", () => {
    process.env.FIGMA_ACCESS_TOKEN = "env-token-1234";
    const resolved = resolveFigmaToken("session-token");
    assert.equal(resolved.source, TOKEN_SOURCE.env);
    assert.equal(resolved.token, "env-token-1234");
  });

  it("환경변수가 없으면 요청 토큰을 세션으로 쓴다", () => {
    const resolved = resolveFigmaToken("session-token");
    assert.equal(resolved.source, TOKEN_SOURCE.session);
    assert.equal(resolved.token, "session-token");
  });

  it("둘 다 없으면 missingToken을 던진다", () => {
    assert.throws(
      () => resolveFigmaToken(),
      (error: unknown) =>
        error instanceof IngestError && error.code === INGEST_ERROR.missingToken,
    );
  });

  it("환경변수만 있으면 설정됨으로 표시한다", () => {
    process.env.FIGMA_ACCESS_TOKEN = "abcd";
    const status = getTokenStatus();
    assert.equal(status.configured, true);
    assert.equal(status.source, TOKEN_SOURCE.env);
    assert.equal(status.hint, "••••");
  });
});
