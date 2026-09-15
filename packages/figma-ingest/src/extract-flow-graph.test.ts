import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { FigmaApiNode } from "./figma-api-types.js";
import { extractFlowGraph } from "./extract-flow-graph.js";

const page: FigmaApiNode = {
  id: "0:1",
  name: "Checkout",
  type: "CANVAS",
  children: [
    {
      id: "1:1",
      name: "로그인",
      type: "FRAME",
      children: [
        {
          id: "1:10",
          name: "로그인 버튼",
          type: "TEXT",
          characters: "로그인",
          reactions: [
            {
              actions: [{ type: "NODE", destinationId: "1:2" }],
            },
          ],
        },
      ],
    },
    { id: "1:2", name: "홈", type: "FRAME" },
    { id: "1:6", name: "실패", type: "FRAME" },
    {
      id: "9:1",
      name: "실패 경로",
      type: "CONNECTOR",
      connectorStart: { endpointNodeId: "1:1" },
      connectorEnd: { endpointNodeId: "1:6" },
    },
  ],
};

describe("extractFlowGraph", () => {
  it("프로토타입 반응과 커넥터를 간선으로 만든다", () => {
    const dump = extractFlowGraph({
      fileKey: "fileKey1",
      startNodeId: "0:1",
      roots: [page],
    });
    assert.equal(dump.fileKey, "fileKey1");
    assert.ok(dump.nodes.some((node) => node.id === "1:1"));
    assert.ok(dump.nodes.some((node) => node.id === "1:2"));
    assert.ok(
      dump.connections.some((edge) => edge.from === "1:1" && edge.to === "1:2"),
    );
    assert.ok(
      dump.connections.some(
        (edge) => edge.from === "1:1" && edge.to === "1:6" && edge.label === "실패 경로",
      ),
    );
  });
});
