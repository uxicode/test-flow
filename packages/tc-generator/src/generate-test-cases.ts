import type { FigmaDump } from "@testflow/figma-ingest";
import type { MermaidNodeMapEntry } from "@testflow/mermaid-ir";
import { TC_ERROR, TcError } from "./error-codes.js";
import { enumeratePaths } from "./enumerate-paths.js";
import type { TestCase, TestStep } from "./types.js";

function mermaidIdOf(
  figmaNodeId: string,
  nodeMap: MermaidNodeMapEntry[],
): string | undefined {
  return nodeMap.find((entry) => entry.figmaNodeId === figmaNodeId)?.mermaidId;
}

function pathId(nodeIds: string[]): string {
  const slug = nodeIds.join("_").replace(/[^A-Za-z0-9_-]/g, "");
  return `tc-${slug.slice(0, 48)}`;
}

export function generateTestCases(
  dump: FigmaDump,
  nodeMap: MermaidNodeMapEntry[] = [],
): TestCase[] {
  const paths = enumeratePaths(dump);
  return paths.map((hops) => {
    const names = hops.map((hop) => hop.node.name);
    const steps: TestStep[] = hops.map((hop, index) => {
      const targetHint = hop.node.name.trim();
      if (!targetHint) throw new TcError(TC_ERROR.missingTargetHint, hop.node.id);
      const action =
        index === 0 ? "시작" : hop.viaLabel?.trim() ? hop.viaLabel.trim() : "이동";
      return {
        action,
        targetHint,
        expected: hop.node.text?.trim() || `${hop.node.name} 화면이 표시된다`,
        sourceNodeId: hop.node.id,
        mermaidNodeId: mermaidIdOf(hop.node.id, nodeMap),
      };
    });
    return {
      id: pathId(hops.map((hop) => hop.node.id)),
      title: names.join(" → "),
      preconditions: `${hops[0]?.node.name ?? "시작"} 화면에 진입할 수 있다`,
      steps,
    };
  });
}
