import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { HINT_KIND, classifyHint } from "./resolve-hint.js";

describe("classifyHint", () => {
  it("URL·CSS·텍스트를 구분한다", () => {
    assert.equal(classifyHint("https://example.com"), HINT_KIND.url);
    assert.equal(classifyHint("#login"), HINT_KIND.css);
    assert.equal(classifyHint(".btn-primary"), HINT_KIND.css);
    assert.equal(classifyHint("로그인"), HINT_KIND.text);
  });
});
