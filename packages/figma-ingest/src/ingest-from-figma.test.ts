import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { INGEST_ERROR, IngestError } from "./error-codes.js";
import { ingestFromFigmaUrl } from "./ingest-from-figma.js";

describe("ingestFromFigmaUrl", () => {
  it("모의 Figma 응답으로 덤프를 만든다", async () => {
    const dump = await ingestFromFigmaUrl({
      url: "https://www.figma.com/design/AbcFile/Name?node-id=1-1",
      token: "test-token",
      fetchImpl: async (url, init) => {
        assert.match(url, /\/files\/AbcFile\/nodes/);
        assert.equal(init?.headers?.["X-Figma-Token"], "test-token");
        return {
          status: 200,
          json: async () => ({
            nodes: {
              "1:1": {
                document: {
                  id: "1:1",
                  name: "로그인",
                  type: "FRAME",
                  reactions: [
                    { actions: [{ type: "NODE", destinationId: "1:2" }] },
                  ],
                },
              },
              "1:2": {
                document: { id: "1:2", name: "홈", type: "FRAME" },
              },
            },
          }),
        };
      },
    });
    assert.equal(dump.startNodeId, "1:1");
    assert.ok(dump.connections.some((edge) => edge.to === "1:2"));
  });

  it("텍스트 없는 한 장 이미지는 비전 분석 결과를 덤프로 만든다", async () => {
    const png = Buffer.from("fake-png").toString("base64");
    let analyzed = "";
    const dump = await ingestFromFigmaUrl({
      url: "https://www.figma.com/design/AbcFile/Name?node-id=2-2",
      token: "test-token",
      fetchImpl: async (url) => {
        if (url.includes("/images/")) {
          return {
            status: 200,
            json: async () => ({ images: { "2:2": "https://img.example/shot.png" } }),
          };
        }
        if (url.includes("img.example")) {
          return {
            status: 200,
            json: async () => ({}),
            arrayBuffer: async () => Buffer.from("fake-png"),
          };
        }
        return {
          status: 200,
          json: async () => ({
            nodes: {
              "2:2": {
                document: { id: "2:2", name: "스크린샷", type: "IMAGE" },
              },
            },
          }),
        };
      },
      vision: {
        analyze: async (imageBase64) => {
          analyzed = imageBase64;
          return {
            screens: [
              { id: "s1", name: "로그인", text: "이메일\n비밀번호\n로그인" },
              { id: "s2", name: "홈", text: "홈 화면" },
            ],
            connections: [{ from: "s1", to: "s2", label: "로그인" }],
          };
        },
      },
    });
    assert.equal(analyzed, png);
    assert.equal(dump.startNodeId, "2:2");
    assert.equal(dump.nodes[0]?.text, "이메일\n비밀번호\n로그인");
    assert.equal(dump.analysis?.method, "vision");
    assert.ok(dump.connections.some((edge) => edge.to === "s2"));
  });

  it("401이면 figma_unauthorized", async () => {
    await assert.rejects(
      () =>
        ingestFromFigmaUrl({
          url: "https://www.figma.com/design/AbcFile/Name?node-id=1-1",
          token: "bad",
          fetchImpl: async () => ({
            status: 401,
            json: async () => ({}),
          }),
        }),
      (error: unknown) =>
        error instanceof IngestError &&
        error.code === INGEST_ERROR.figmaUnauthorized,
    );
  });
});
