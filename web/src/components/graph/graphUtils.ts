import type { AnalyzedFile, AnalysisIssue } from "../../lib/types";

export interface GraphNode {
  id: string;
  label: string;
  fanIn: number;
  fanOut: number;
  lineCount: number;
  isHotspot: boolean;
  isCyclic: boolean;
}

export interface GraphLink {
  source: string;
  target: string;
  isCyclic: boolean;
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
  /** Number of files excluded by the node cap (0 when all files are shown). */
  hiddenCount: number;
}

/**
 * Maximum number of nodes rendered in the force-directed graph. SVG rendering
 * with per-tick React reconciliation janks badly past a few hundred nodes, so
 * we keep the most structurally significant files (highest fan-in + fan-out)
 * and surface the rest as a "+N hidden" indicator.
 */
const MAX_GRAPH_NODES = 400;

/**
 * Build a graph from analyzed files and circular dependency issues.
 * Reuses circular_dependency issue file lists to mark cyclic nodes/edges.
 * Nodes are capped to MAX_GRAPH_NODES by structural significance (fan-in +
 * fan-out); cyclic nodes are always retained so cycles stay visible.
 */
export function buildGraphData(
  files: AnalyzedFile[],
  issues: AnalysisIssue[],
): GraphData {
  const knownPaths = new Set(files.map((f) => f.path));

  // Collect cyclic file sets from circular_dependency issues
  const cyclicFileSets = issues
    .filter((issue) => issue.issueType === "circular_dependency")
    .map((issue) => new Set(issue.files));

  const cyclicFiles = new Set<string>();
  for (const fileSet of cyclicFileSets) {
    for (const file of fileSet) {
      cyclicFiles.add(file);
    }
  }

  // Build links with cycle marking
  const allLinks: GraphLink[] = [];
  const fanInMap = new Map<string, number>();

  for (const file of files) {
    for (const imp of file.imports) {
      if (knownPaths.has(imp)) {
        const isCyclicEdge = cyclicFileSets.some(
          (set) => set.has(file.path) && set.has(imp),
        );
        allLinks.push({ source: file.path, target: imp, isCyclic: isCyclicEdge });
        fanInMap.set(imp, (fanInMap.get(imp) ?? 0) + 1);
      }
    }
  }

  // Compute fan-out per file once.
  const fanOutMap = new Map<string, number>();
  for (const file of files) {
    fanOutMap.set(
      file.path,
      file.imports.filter((imp) => knownPaths.has(imp)).length,
    );
  }

  // Build nodes
  const allNodes: GraphNode[] = files.map((file) => {
    const fanIn = fanInMap.get(file.path) ?? 0;
    const fanOut = fanOutMap.get(file.path) ?? 0;
    return {
      id: file.path,
      label: file.path.split("/").pop() ?? file.path,
      fanIn,
      fanOut,
      lineCount: file.metrics.lineCount,
      isHotspot: fanIn + fanOut >= 4,
      isCyclic: cyclicFiles.has(file.path),
    };
  });

  // Cap nodes by significance. Cyclic nodes are always kept; remaining slots
  // go to the highest fan-in + fan-out files. Links touching dropped nodes are
  // discarded so the simulation stays consistent.
  let nodes = allNodes;
  let links = allLinks;
  let hiddenCount = 0;

  if (allNodes.length > MAX_GRAPH_NODES) {
    const keepSet = new Set<string>();

    // Always keep cyclic nodes (usually a small minority).
    for (const node of allNodes) {
      if (node.isCyclic) keepSet.add(node.id);
    }

    // Rank the rest by fan-in + fan-out descending and take until full.
    const ranked = allNodes
      .filter((n) => !keepSet.has(n.id))
      .sort((a, b) => b.fanIn + b.fanOut - (a.fanIn + a.fanOut));

    for (const node of ranked) {
      if (keepSet.size >= MAX_GRAPH_NODES) break;
      keepSet.add(node.id);
    }

    nodes = allNodes.filter((n) => keepSet.has(n.id));
    links = allLinks.filter(
      (l) => keepSet.has(l.source) && keepSet.has(l.target),
    );
    hiddenCount = allNodes.length - nodes.length;
  }

  return { nodes, links, hiddenCount };
}
