import type { GeneratedDocTestCase, TestCasePriority, TestCaseType } from "./types";

export interface CustomNode {
  id: string;
  type?: "input" | "default" | "output";
  label: string;
  x: number;
  y: number;
}

export interface CustomEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

/**
 * Generate a random unique ID for test cases
 */
function generateId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Clean up text content by removing unwanted spacing and symbols
 */
function cleanText(text: string | null | undefined): string {
  if (!text) return "";
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Helper to determine test case type (positive, negative, exception) based on path labels and node text
 */
function determineTestCaseType(nodes: CustomNode[], edgesInPath: CustomEdge[]): { type: TestCaseType; priority: TestCasePriority } {
  let hasFailureKeyword = false;
  const failureKeywords = /(실패|오류|에러|반려|대기|경고|제한|거부|fail|error|exception|reject)/i;

  // Check edge labels in the path
  for (const edge of edgesInPath) {
    const label = cleanText(edge.label);
    if (failureKeywords.test(label)) {
      hasFailureKeyword = true;
      break;
    }
  }

  // Check node content in the path
  for (const node of nodes) {
    const label = cleanText(node.label);
    if (failureKeywords.test(label)) {
      hasFailureKeyword = true;
      break;
    }
  }

  if (hasFailureKeyword) {
    return {
      type: "negative",
      priority: "P2",
    };
  }

  return {
    type: "positive",
    priority: "P1",
  };
}

/**
 * Analyzes custom flow chart nodes and edges to extract all logical execution paths
 * and converts them into structured Test Cases.
 */
export function analyzeFlowToTestCases(nodes: CustomNode[], edges: CustomEdge[]): GeneratedDocTestCase[] {
  if (nodes.length === 0) return [];

  // Build adjacency list for Directed Graph
  const adjList: Record<string, { target: string; edge: CustomEdge }[]> = {};
  const inDegree: Record<string, number> = {};

  for (const node of nodes) {
    adjList[node.id] = [];
    inDegree[node.id] = 0;
  }

  for (const edge of edges) {
    if (adjList[edge.source] && adjList[edge.target] !== undefined) {
      adjList[edge.source].push({ target: edge.target, edge });
      inDegree[edge.target] = (inDegree[edge.target] || 0) + 1;
    }
  }

  // Find start nodes (nodes with 0 in-degree)
  let startNodes = nodes.filter((n) => inDegree[n.id] === 0);
  
  // Fallback if graph has cycles or no 0 in-degree nodes
  if (startNodes.length === 0) {
    startNodes = [nodes[0]];
  }

  const testCases: GeneratedDocTestCase[] = [];
  const visited = new Set<string>();

  // Deep-first search to find all path permutations
  function dfs(
    currentNodeId: string,
    currentPathNodes: CustomNode[],
    currentPathEdges: CustomEdge[]
  ) {
    const node = nodes.find((n) => n.id === currentNodeId);
    if (!node) return;

    // Detect cycle to prevent infinite recursion
    if (visited.has(currentNodeId)) {
      savePathAsTestCase(currentPathNodes, currentPathEdges);
      return;
    }

    visited.add(currentNodeId);
    const nextSteps = adjList[currentNodeId] || [];

    const newPathNodes = [...currentPathNodes, node];

    if (nextSteps.length === 0) {
      // Reached leaf node (terminal path)
      savePathAsTestCase(newPathNodes, currentPathEdges);
    } else {
      for (const step of nextSteps) {
        dfs(step.target, newPathNodes, [...currentPathEdges, step.edge]);
      }
    }

    visited.delete(currentNodeId);
  }

  function savePathAsTestCase(pathNodes: CustomNode[], pathEdges: CustomEdge[]) {
    if (pathNodes.length === 0) return;

    const startNode = pathNodes[0];
    const leafNode = pathNodes[pathNodes.length - 1];

    const startName = cleanText(startNode.label) || "시작";
    const leafName = cleanText(leafNode.label) || "종료";

    // Build unique title highlighting branch conditions
    let branchNames = pathEdges
      .map((e) => cleanText(e.label))
      .filter(Boolean);
    
    const branchSuffix = branchNames.length > 0 ? ` [${branchNames.join(" -> ")}]` : "";
    const title = `${startName} ➔ ${leafName}${branchSuffix}`;

    const preconditions: string[] = [];
    const steps: string[] = [];

    pathNodes.forEach((node, idx) => {
      const label = cleanText(node.label);
      if (!label) return;

      if (label.startsWith("사전 조건:") || label.startsWith("Given:")) {
        preconditions.push(label.replace(/^(사전 조건:|Given:)\s*/, "").trim());
      } else {
        const edgeLeadingIn = idx > 0 ? pathEdges[idx - 1] : null;
        const edgeLabel = edgeLeadingIn ? cleanText(edgeLeadingIn.label) : "";
        
        if (edgeLabel) {
          steps.push(`[${edgeLabel}] 조건에서 ${label} 단계로 진행`);
        } else {
          steps.push(`${label} 수행`);
        }
      }
    });

    if (steps.length === 0) {
      steps.push("정의된 절차를 차례로 수행합니다.");
    }

    const { type, priority } = determineTestCaseType(pathNodes, pathEdges);

    testCases.push({
      id: generateId("tc"),
      title,
      feature: "프로세스 맵",
      objective: `기획 다이어그램 내 '${startName}'에서 '${leafName}'로 향하는 흐름 시나리오를 검증한다.`,
      preconditions: preconditions.length > 0 ? preconditions : [`${startName} 화면 혹은 상태에 위치한 상태`],
      steps,
      expectedResults: [leafName],
      priority,
      type,
      requirementIds: [],
    });
  }

  for (const startNode of startNodes) {
    dfs(startNode.id, [], []);
  }

  return testCases;
}

/**
 * Formats Flow Nodes and Edges into a clean Mermaid.js Flowchart syntax string.
 */
export function generateMermaidFromFlow(nodes: CustomNode[], edges: CustomEdge[]): string {
  if (nodes.length === 0) return "graph TD\n  %% 플로우 차트가 비어 있습니다.";

  const lines = ["graph TD"];

  // Add nodes definition
  for (const node of nodes) {
    const label = cleanText(node.label) || `노드 ${node.id}`;
    const escapedLabel = JSON.stringify(label);
    
    if (node.type === "input") {
      lines.push(`  ${node.id}([${escapedLabel}])`);
    } else if (node.type === "output") {
      lines.push(`  ${node.id}[[${escapedLabel}]]`);
    } else if (label.endsWith("?") || label.includes("여부") || label.includes("인가")) {
      lines.push(`  ${node.id}{${escapedLabel}}`);
    } else {
      lines.push(`  ${node.id}[${escapedLabel}]`);
    }
  }

  // Add edges definition
  for (const edge of edges) {
    const edgeLabel = cleanText(edge.label);
    if (edgeLabel) {
      lines.push(`  ${edge.source} -->|"${edgeLabel}"| ${edge.target}`);
    } else {
      lines.push(`  ${edge.source} --> ${edge.target}`);
    }
  }

  return lines.join("\n");
}
