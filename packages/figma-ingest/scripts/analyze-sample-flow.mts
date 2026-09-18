import fs from "node:fs";
import { requestOllamaVision } from "../src/ollama-vision.ts";
import { visionResultToDump } from "../src/vision-to-dump.ts";
import { dumpToMermaid } from "../../mermaid-ir/src/dump-to-mermaid.ts";

const imagePath =
  process.argv[2] ??
  "/Users/jeonbongcheol/.cursor/projects/Users-jeonbongcheol-Desktop-proj-test-flow/assets/___________2026-09-18_______11.05.04-a9827f91-4567-491f-a72c-6e446183ff83.png";

const image = fs.readFileSync(imagePath);
const { result, model } = await requestOllamaVision({
  imageBase64: image.toString("base64"),
});
const dump = visionResultToDump({
  fileKey: "demo",
  startNodeId: "1:1",
  fallbackName: "프로세스맵",
  result,
  model,
});
const ir = dumpToMermaid(dump);
console.log(
  JSON.stringify(
    {
      screens: result.screens.length,
      connections: result.connections.length,
      dumpNodes: dump.nodes.length,
      dumpEdges: dump.connections.length,
      mermaidLines: ir.mermaid.trim().split("\n").length,
    },
    null,
    2,
  ),
);
console.log("---MERMAID---");
console.log(ir.mermaid);
