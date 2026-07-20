import type { GeneratedDocTestCase, TestCasePriority, TestCaseType } from "./types";

export interface CustomNode {
  id: string;
  type?: "input" | "default" | "output" | "decision" | "condition";
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
  return text.replace(/<br\s*\/?>/gi, " ").replace(/\s+/g, " ").trim();
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
export function generateMermaidFromFlow(
  nodes: CustomNode[],
  edges: CustomEdge[],
  type: string = "graph",
  dir: string = "TD"
): string {
  if (nodes.length === 0) return `${type} ${dir}\n  %% 플로우 차트가 비어 있습니다.`;

  const lines = [`${type} ${dir}`];

  // Add nodes definition
  for (const node of nodes) {
    const label = cleanText(node.label) || `노드 ${node.id}`;
    const escapedLabel = JSON.stringify(label);
    
    if (node.type === "input") {
      lines.push(`  ${node.id}([${escapedLabel}])`);
    } else if (node.type === "output") {
      lines.push(`  ${node.id}[[${escapedLabel}]]`);
    } else if (node.type === "decision") {
      lines.push(`  ${node.id}{${escapedLabel}}`);
    } else if (node.type === "condition") {
      lines.push(`  ${node.id}{{${escapedLabel}}}`);
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

/**
 * Automatically calculates positions of nodes using hierarchical depth-first/breadth-first traversal.
 */
export function layoutNodes(nodes: CustomNode[], edges: CustomEdge[], dir: string = "TD"): void {
  if (nodes.length === 0) return;

  const adjList: Record<string, string[]> = {};
  const inDegree: Record<string, number> = {};

  for (const node of nodes) {
    adjList[node.id] = [];
    inDegree[node.id] = 0;
  }

  for (const edge of edges) {
    if (adjList[edge.source] && adjList[edge.target] !== undefined) {
      adjList[edge.source].push(edge.target);
      inDegree[edge.target]++;
    }
  }

  // Find roots (in-degree is 0)
  const roots = nodes.filter((n) => inDegree[n.id] === 0).map((n) => n.id);
  const levels: Record<string, number> = {};
  const visited = new Set<string>();
  const queue: [string, number][] = [];

  if (roots.length > 0) {
    for (const r of roots) {
      queue.push([r, 0]);
      levels[r] = 0;
      visited.add(r);
    }
  } else if (nodes.length > 0) {
    // Fallback if there is a cycle and no 0 in-degree node
    const firstId = nodes[0].id;
    queue.push([firstId, 0]);
    levels[firstId] = 0;
    visited.add(firstId);
  }

  // BFS traversal to compute depth level for each node
  let head = 0;
  while (head < queue.length) {
    const [currId, currLevel] = queue[head++];
    const neighbors = adjList[currId] || [];

    for (const nextId of neighbors) {
      const nextLevel = currLevel + 1;
      if (nextLevel >= nodes.length) {
        continue;
      }
      if (!visited.has(nextId)) {
        visited.add(nextId);
        levels[nextId] = nextLevel;
        queue.push([nextId, nextLevel]);
      } else {
        // If a deeper level is found, update and re-enqueue to propagate
        if (levels[nextId] < nextLevel) {
          levels[nextId] = nextLevel;
          queue.push([nextId, nextLevel]);
        }
      }
    }
  }

  // Assign level 0 to any remaining nodes (disconnected components)
  for (const node of nodes) {
    if (!visited.has(node.id)) {
      levels[node.id] = 0;
      visited.add(node.id);

      const componentQueue: [string, number][] = [[node.id, 0]];
      let cHead = 0;
      while (cHead < componentQueue.length) {
        const [currId, currLevel] = componentQueue[cHead++];
        const neighbors = adjList[currId] || [];
        for (const nextId of neighbors) {
          if (!visited.has(nextId)) {
            visited.add(nextId);
            levels[nextId] = currLevel + 1;
            componentQueue.push([nextId, currLevel + 1]);
          }
        }
      }
    }
  }

  // Group nodes by levels
  const nodesByLevel: Record<number, string[]> = {};
  for (const node of nodes) {
    const lvl = levels[node.id] ?? 0;
    if (!nodesByLevel[lvl]) {
      nodesByLevel[lvl] = [];
    }
    nodesByLevel[lvl].push(node.id);
  }

  const levelKeys = Object.keys(nodesByLevel).map(Number).sort((a, b) => a - b);
  const isHorizontal = dir === "LR" || dir === "RL";
  const centerValue = 250;
  const levelSpacing = 130;
  const spreadSpacing = 220;

  for (const lvl of levelKeys) {
    const nodeIds = nodesByLevel[lvl];
    nodeIds.sort(); // Stable ordering
    const count = nodeIds.length;

    nodeIds.forEach((id, index) => {
      const node = nodes.find((n) => n.id === id);
      if (node) {
        const offset = (index - (count - 1) / 2) * spreadSpacing;
        if (isHorizontal) {
          node.x = lvl * levelSpacing + 50;
          node.y = centerValue + offset;
        } else {
          node.x = centerValue + offset;
          node.y = lvl * levelSpacing + 50;
        }
      }
    });
  }
}

/**
 * Parses Mermaid Flowchart syntax string and converts it into custom nodes and edges.
 */
export function parseMermaidToFlow(mermaidCode: string): {
  nodes: CustomNode[];
  edges: CustomEdge[];
  type: string;
  dir: string;
} {
  const nodesMap = new Map<string, CustomNode>();
  const edges: CustomEdge[] = [];
  let type = "graph";
  let dir = "TD";

  if (!mermaidCode) {
    return { nodes: [], edges: [], type, dir };
  }

  const lines = mermaidCode.split(/\r?\n/);

  for (let line of lines) {
    let trimmed = line.trim();
    if (trimmed.endsWith(";")) {
      trimmed = trimmed.substring(0, trimmed.length - 1).trim();
    }

    const headerMatch = trimmed.match(/^(graph|flowchart)\s+(TD|TB|LR|BT|RL)/i);
    if (headerMatch) {
      type = headerMatch[1].toLowerCase();
      dir = headerMatch[2].toUpperCase();
      continue;
    }

    if (
      !trimmed ||
      trimmed.startsWith("%%") ||
      trimmed.startsWith("graph") ||
      trimmed.startsWith("flowchart")
    ) {
      continue;
    }

    // Match explicit node definitions: e.g. A([\"Label\"]) or A[\"Label\"] or A[[Label]] or A{{Label}}
    const nodeDefRegex = /([a-zA-Z0-9_-]+)\s*(?:\(\[|\[\[|\(\(|\{|{{|\[|\()\s*(?:"([^"]*)"|'([^']*)'|([^\])}]*?))\s*(?:\]\]|\]\)|}}|}|\]|\))/g;
    
    let match;
    let simplifiedLine = trimmed;
    nodeDefRegex.lastIndex = 0;

    while ((match = nodeDefRegex.exec(trimmed)) !== null) {
      const id = match[1];
      const label = match[2] || match[3] || match[4] || id;
      
      // Determine node type based on brackets
      const bracketType = trimmed.substring(match.index + id.length, match.index + id.length + 3).trim();
      let nodeType: "input" | "default" | "output" | "decision" | "condition" = "default";
      
      if (bracketType.startsWith("([")) {
        nodeType = "input";
      } else if (bracketType.startsWith("[[")) {
        nodeType = "output";
      } else if (bracketType.startsWith("{{")) {
        nodeType = "condition";
      } else if (bracketType.startsWith("{")) {
        nodeType = "decision";
      }

      nodesMap.set(id, {
        id,
        label,
        type: nodeType,
        x: 0,
        y: 0,
      });

      // Replace definition with ID for simpler edge matching
      const fullMatch = match[0];
      simplifiedLine = simplifiedLine.replace(fullMatch, id);
    }

    // Match edges with different styles:
    // 1. A -->|label| B or A --> B
    // 2. A -- label --> B or A -- "label" --> B
    // 3. A ==>|label| B or A ==> B
    // 4. A == label ==> B or A == "label" ==> B
    // 5. A -.->|label| B or A -.-> B
    // 6. A -. label .-> B or A -. "label" .-> B
    const edgePatterns = [
      /([a-zA-Z0-9_-]+)\s*-->\s*(?:\|(?:"([^"]*)"|'([^']*)'|([^|]*))\|\s*)?([a-zA-Z0-9_-]+)/g,
      /([a-zA-Z0-9_-]+)\s*--\s*(?:"([^"]*)"|'([^']*)'|([^-]+?))\s*-->\s*([a-zA-Z0-9_-]+)/g,
      /([a-zA-Z0-9_-]+)\s*==>\s*(?:\|(?:"([^"]*)"|'([^']*)'|([^|]*))\|\s*)?([a-zA-Z0-9_-]+)/g,
      /([a-zA-Z0-9_-]+)\s*==\s*(?:"([^"]*)"|'([^']*)'|([^=]+?))\s*==>\s*([a-zA-Z0-9_-]+)/g,
      /([a-zA-Z0-9_-]+)\s*-\.-\s*>\s*(?:\|(?:"([^"]*)"|'([^']*)'|([^|]*))\|\s*)?([a-zA-Z0-9_-]+)/g,
      /([a-zA-Z0-9_-]+)\s*-\.\s*(?:"([^"]*)"|'([^']*)'|([^-.]+?))\s*\.-\s*>\s*([a-zA-Z0-9_-]+)/g,
    ];

    for (const regex of edgePatterns) {
      let edgeMatch;
      regex.lastIndex = 0;
      while ((edgeMatch = regex.exec(simplifiedLine)) !== null) {
        const source = edgeMatch[1];
        const label = edgeMatch[2] || edgeMatch[3] || edgeMatch[4] || undefined;
        const target = edgeMatch[5];

        // Clean HTML break tags <br/> from label if present
        const cleanLabel = label ? label.replace(/<br\s*\/?>/gi, " ").trim() : undefined;

        if (!edges.some((e) => e.source === source && e.target === target)) {
          edges.push({
            id: `e${source}-${target}-${edges.length}`,
            source,
            target,
            label: cleanLabel,
          });

          // Register referenced nodes if not already defined
          if (!nodesMap.has(source)) {
            nodesMap.set(source, {
              id: source,
              label: source,
              type: "default",
              x: 0,
              y: 0,
            });
          }
          if (!nodesMap.has(target)) {
            nodesMap.set(target, {
              id: target,
              label: target,
              type: "default",
              x: 0,
              y: 0,
            });
          }
        }
      }
    }
  }

  const nodes = Array.from(nodesMap.values());
  layoutNodes(nodes, edges, dir);

  return { nodes, edges, type, dir };
}

