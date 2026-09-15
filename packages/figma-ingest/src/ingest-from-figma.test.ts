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
