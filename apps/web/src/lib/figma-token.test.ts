import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  maskFigmaToken,
  mergeTokenStatus,
  TOKEN_SOURCE,
  type TokenStatus,
} from "./figma-token.ts";

const emptyStatus: TokenStatus = {
  configured: false,
  source: null,
  hint: null,
};

describe("figma-token session helpers", () => {
  it("토큰 끝 4자리를 남기고 가린다", () => {
    assert.equal(maskFigmaToken("abcd"), "••••");
    assert.equal(maskFigmaToken("figma-token-9876"), "••••9876");
  });

  it("환경변수 상태가 있으면 세션보다 우선한다", () => {
    const envStatus: TokenStatus = {
      configured: true,
      source: TOKEN_SOURCE.env,
      hint: "••••env1",
    };
    const sessionStatus: TokenStatus = {
      configured: true,
      source: TOKEN_SOURCE.session,
      hint: "••••sess",
    };
    assert.deepEqual(mergeTokenStatus(envStatus, sessionStatus), envStatus);
  });

  it("환경변수가 없으면 세션 상태를 쓴다", () => {
    const sessionStatus: TokenStatus = {
      configured: true,
      source: TOKEN_SOURCE.session,
      hint: "••••sess",
    };
    assert.deepEqual(mergeTokenStatus(emptyStatus, sessionStatus), sessionStatus);
  });
});
