import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { publishLog, readLogs, subscribeLog } from "./log-hub.js";

describe("log hub", () => {
  it("구독 전에 쌓인 로그를 나중에 읽을 수 있다", () => {
    const channelId = `test-${Date.now()}`;
    publishLog(channelId, "질문 1/2 시작");
    const seen: string[] = [];
    subscribeLog(channelId, (event) => seen.push(event.message));
    publishLog(channelId, "취합 1화면");
    assert.deepEqual(readLogs(channelId).map((event) => event.message), [
      "질문 1/2 시작",
      "취합 1화면",
    ]);
    assert.deepEqual(seen, ["취합 1화면"]);
  });
});
