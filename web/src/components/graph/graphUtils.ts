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
}

/**
 * Build a graph from analyzed files and circular dependency issues.
 * Reuses circular_dependency issue file lists to mark cyclic nodes/edges.
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
  const links: GraphLink[] = [];
  const fanInMap = new Map<string, number>();

  for (const file of files) {
    for (const imp of file.imports) {
      if (knownPaths.has(imp)) {
        const isCyclicEdge = cyclicFileSets.some(
          (set) => set.has(file.path) && set.has(imp),
        );
        links.push({ source: file.path, target: imp, isCyclic: isCyclicEdge });
        fanInMap.set(imp, (fanInMap.get(imp) ?? 0) + 1);
      }
    }
  }

  // Build nodes
  const nodes: GraphNode[] = files.map((file) => {
    const fanIn = fanInMap.get(file.path) ?? 0;
    const fanOut = file.imports.filter((imp) => knownPaths.has(imp)).length;
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

  return { nodes, links };
}
