import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";

import type { AnalyzedFile, AnalysisIssue } from "../../lib/types";
import { useLocale } from "../../lib/i18n";
import { buildGraphData, type GraphNode } from "./graphUtils";

interface DependencyGraphProps {
  files: AnalyzedFile[];
  issues: AnalysisIssue[];
  onNodeClick?: (filePath: string) => void;
}

interface SimNode extends SimulationNodeDatum {
  id: string;
  graphNode: GraphNode;
}

interface SimLink extends SimulationLinkDatum<SimNode> {
  isCyclic: boolean;
}

interface RenderNode extends GraphNode {
  x: number;
  y: number;
}

interface RenderLink {
  source: string;
  target: string;
  isCyclic: boolean;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

interface ViewBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

function nodeRadius(node: GraphNode): number {
  return Math.max(7, Math.min(18, 7 + node.fanIn * 2));
}

function nodeColor(node: GraphNode): string {
  if (node.isCyclic) return "#ef4444";
  if (node.isHotspot) return "#f59e0b";
  return "#3b82f6";
}

export function DependencyGraph({
  files,
  issues,
  onNodeClick,
}: DependencyGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const simRef = useRef<Simulation<SimNode, SimLink> | null>(null);
  const { t } = useLocale();

  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [nodes, setNodes] = useState<RenderNode[]>([]);
  const [links, setLinks] = useState<RenderLink[]>([]);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [viewBox, setViewBox] = useState<ViewBox>({ x: 0, y: 0, w: 800, h: 480 });
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);
  const dragNodeId = useRef<string | null>(null);
  const dragOffset = useRef<{ dx: number; dy: number }>({ dx: 0, dy: 0 });

  // Measure container
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setContainerSize({ width, height });
      setViewBox({ x: 0, y: 0, w: width, h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const graphData = useMemo(
    () => buildGraphData(files, issues),
    [files, issues],
  );

  // Build adjacency for hover highlighting
  const adjacency = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const link of graphData.links) {
      if (!map.has(link.source)) map.set(link.source, new Set());
      if (!map.has(link.target)) map.set(link.target, new Set());
      map.get(link.source)!.add(link.target);
      map.get(link.target)!.add(link.source);
    }
    return map;
  }, [graphData.links]);

  // Start simulation (only when graphData changes, not on resize)
  useEffect(() => {
    const { width, height } = containerSize;
    if (width === 0 || height === 0 || graphData.nodes.length === 0) return;

    const simNodes: SimNode[] = graphData.nodes.map((node, i) => {
      const angle = (2 * Math.PI * i) / graphData.nodes.length;
      const r = Math.min(width, height) * 0.3;
      return {
        id: node.id,
        graphNode: node,
        x: width / 2 + r * Math.cos(angle),
        y: height / 2 + r * Math.sin(angle),
      };
    });

    const nodeById = new Map(simNodes.map((n) => [n.id, n]));

    const simLinks: SimLink[] = graphData.links
      .filter((l) => nodeById.has(l.source) && nodeById.has(l.target))
      .map((l) => ({
        source: nodeById.get(l.source)!,
        target: nodeById.get(l.target)!,
        isCyclic: l.isCyclic,
      }));

    const sim = forceSimulation<SimNode, SimLink>(simNodes)
      .force("link", forceLink<SimNode, SimLink>(simLinks).id((d) => d.id).distance(70))
      .force("charge", forceManyBody<SimNode>().strength(-100))
      .force("center", forceCenter(width / 2, height / 2))
      .force("collide", forceCollide<SimNode>(16))
      .alphaDecay(0.04)
      .velocityDecay(0.45);

    sim.on("tick", () => {
      setNodes(
        simNodes.map((sn) => ({
          ...sn.graphNode,
          x: sn.x ?? 0,
          y: sn.y ?? 0,
        })),
      );
      setLinks(
        simLinks.map((sl) => {
          const src = sl.source as SimNode;
          const tgt = sl.target as SimNode;
          return {
            source: src.id,
            target: tgt.id,
            isCyclic: sl.isCyclic,
            x1: src.x ?? 0,
            y1: src.y ?? 0,
            x2: tgt.x ?? 0,
            y2: tgt.y ?? 0,
          };
        }),
      );
    });

    simRef.current = sim;
    return () => {
      sim.stop();
      simRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally exclude containerSize
  }, [graphData]);

  // Gently update center force on resize instead of restarting simulation
  useEffect(() => {
    const sim = simRef.current;
    if (!sim || containerSize.width === 0) return;
    sim.force("center", forceCenter(containerSize.width / 2, containerSize.height / 2));
    sim.alpha(0.1).restart();
  }, [containerSize]);

  // Convert SVG screen coords to viewBox coords
  const svgToVb = useCallback(
    (clientX: number, clientY: number) => {
      const svg = svgRef.current;
      if (!svg) return { x: 0, y: 0 };
      const rect = svg.getBoundingClientRect();
      const scaleX = viewBox.w / rect.width;
      const scaleY = viewBox.h / rect.height;
      return {
        x: viewBox.x + (clientX - rect.left) * scaleX,
        y: viewBox.y + (clientY - rect.top) * scaleY,
      };
    },
    [viewBox],
  );

  // Mouse handlers for drag + pan
  function handleMouseDown(e: React.MouseEvent<SVGSVGElement>) {
    const target = e.target as SVGElement;
    const nodeId = target.closest("[data-node-id]")?.getAttribute("data-node-id");

    if (nodeId) {
      e.preventDefault();
      dragNodeId.current = nodeId;
      const node = nodes.find((n) => n.id === nodeId);
      if (node) {
        const pt = svgToVb(e.clientX, e.clientY);
        dragOffset.current = { dx: node.x - pt.x, dy: node.y - pt.y };
        // Fix position
        const sim = simRef.current;
        if (sim) {
          const sn = (sim.nodes() as SimNode[]).find((n) => n.id === nodeId);
          if (sn) {
            sn.fx = sn.x;
            sn.fy = sn.y;
            sim.alphaTarget(0.3).restart();
          }
        }
      }
    } else if (e.button === 0) {
      setIsPanning(true);
      panStart.current = { x: e.clientX, y: e.clientY, vx: viewBox.x, vy: viewBox.y };
    }
  }

  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    if (dragNodeId.current) {
      const pt = svgToVb(e.clientX, e.clientY);
      const nx = pt.x + dragOffset.current.dx;
      const ny = pt.y + dragOffset.current.dy;
      const sim = simRef.current;
      if (sim) {
        const sn = (sim.nodes() as SimNode[]).find((n) => n.id === dragNodeId.current);
        if (sn) {
          sn.fx = nx;
          sn.fy = ny;
        }
      }
    } else if (isPanning && panStart.current) {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const scaleX = viewBox.w / rect.width;
      const scaleY = viewBox.h / rect.height;
      const dx = (e.clientX - panStart.current.x) * scaleX;
      const dy = (e.clientY - panStart.current.y) * scaleY;
      setViewBox((vb) => ({
        ...vb,
        x: panStart.current!.vx - dx,
        y: panStart.current!.vy - dy,
      }));
    }
  }

  function handleMouseUp() {
    if (dragNodeId.current) {
      const sim = simRef.current;
      if (sim) {
        const sn = (sim.nodes() as SimNode[]).find((n) => n.id === dragNodeId.current);
        if (sn) {
          sn.fx = null;
          sn.fy = null;
        }
        sim.alphaTarget(0);
      }
      dragNodeId.current = null;
    }
    setIsPanning(false);
    panStart.current = null;
  }

  // Native wheel event listener (non-passive to allow preventDefault)
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const zoomFactor = e.deltaY > 0 ? 1.1 : 0.9;
      const pt = svgToVb(e.clientX, e.clientY);
      setViewBox((vb) => {
        const newW = vb.w * zoomFactor;
        const newH = vb.h * zoomFactor;
        return {
          x: pt.x - (pt.x - vb.x) * zoomFactor,
          y: pt.y - (pt.y - vb.y) * zoomFactor,
          w: newW,
          h: newH,
        };
      });
    };
    svg.addEventListener("wheel", handler, { passive: false });
    return () => svg.removeEventListener("wheel", handler);
  }, [svgToVb]);

  function handleNodeClick(nodeId: string) {
    onNodeClick?.(nodeId);
  }

  // Compute dimmed set when hovering
  const connectedSet = useMemo(() => {
    if (!hoveredNode) return null;
    const set = new Set<string>([hoveredNode]);
    adjacency.get(hoveredNode)?.forEach((n) => set.add(n));
    return set;
  }, [hoveredNode, adjacency]);

  const viewBoxStr = `${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`;

  if (graphData.nodes.length === 0) {
    return (
      <div className="graph-empty">
        <p>{t("chart.noGraph")}</p>
      </div>
    );
  }

  return (
    <div>
      <div className="graph-header-row">
        <h4 className="chart-title">{t("chart.dependencyGraph")}</h4>
        <div className="graph-legend">
          <span className="graph-legend-item">
            <span className="graph-legend-dot" aria-hidden="true" style={{ background: "#ef4444" }} />
            {t("legend.cyclic")}
          </span>
          <span className="graph-legend-item">
            <span className="graph-legend-dot" aria-hidden="true" style={{ background: "#f59e0b" }} />
            {t("legend.hotspot")}
          </span>
          <span className="graph-legend-item">
            <span className="graph-legend-dot" aria-hidden="true" style={{ background: "#3b82f6" }} />
            {t("legend.normal")}
          </span>
        </div>
      </div>
      <div ref={containerRef} className="graph-container">
        <svg
          ref={svgRef}
          role="img"
          aria-label="Interactive dependency graph showing file relationships and circular dependencies"
          width="100%"
          height="100%"
          viewBox={viewBoxStr}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          style={{ cursor: isPanning ? "grabbing" : dragNodeId.current ? "move" : "grab" }}
        >
          <defs>
            <marker
              id="arrow"
              viewBox="0 0 10 6"
              refX="10"
              refY="3"
              markerWidth="7"
              markerHeight="5"
              orient="auto"
            >
              <path d="M0,0 L10,3 L0,6 z" fill="#4b5563" />
            </marker>
            <marker
              id="arrow-cyclic"
              viewBox="0 0 10 6"
              refX="10"
              refY="3"
              markerWidth="7"
              markerHeight="5"
              orient="auto"
            >
              <path d="M0,0 L10,3 L0,6 z" fill="#ef4444" />
            </marker>
          </defs>

          {/* Links */}
          <g>
            {links.map((link) => {
              const dimmed =
                connectedSet &&
                !connectedSet.has(link.source) &&
                !connectedSet.has(link.target);
              const opacity = dimmed ? 0.08 : 1;
              // Shorten the line to stop at the node radius
              const srcNode = nodes.find((n) => n.id === link.source);
              const tgtNode = nodes.find((n) => n.id === link.target);
              const tgtR = tgtNode ? nodeRadius(tgtNode) : 7;
              const dx = link.x2 - link.x1;
              const dy = link.y2 - link.y1;
              const len = Math.sqrt(dx * dx + dy * dy) || 1;
              const ux = dx / len;
              const uy = dy / len;
              const x2 = link.x2 - ux * (tgtR + 4);
              const y2 = link.y2 - uy * (tgtR + 4);

              return (
                <line
                  key={`${link.source}-${link.target}`}
                  x1={link.x1}
                  y1={link.y1}
                  x2={x2}
                  y2={y2}
                  stroke={link.isCyclic ? "#ef4444" : "#4b5563"}
                  strokeWidth={link.isCyclic ? 1.8 : 1}
                  strokeDasharray={link.isCyclic ? "5,4" : undefined}
                  opacity={opacity}
                  markerEnd={link.isCyclic ? "url(#arrow-cyclic)" : "url(#arrow)"}
                />
              );
            })}
          </g>

          {/* Nodes */}
          <g>
            {nodes.map((node) => {
              const dimmed = connectedSet && !connectedSet.has(node.id);
              const r = nodeRadius(node);
              const color = nodeColor(node);
              const isHovered = hoveredNode === node.id;
              return (
                <g
                  key={node.id}
                  data-node-id={node.id}
                  transform={`translate(${node.x},${node.y})`}
                  style={{ cursor: "pointer", opacity: dimmed ? 0.1 : 1 }}
                  role="button"
                  tabIndex={0}
                  onMouseEnter={() => setHoveredNode(node.id)}
                  onMouseLeave={() => setHoveredNode(null)}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleNodeClick(node.id);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleNodeClick(node.id);
                    }
                  }}
                  onFocus={() => setHoveredNode(node.id)}
                  onBlur={() => setHoveredNode(null)}
                >
                  <circle
                    r={isHovered ? r + 3 : r}
                    fill={color}
                    opacity={0.85}
                    stroke={isHovered ? "#edf2f7" : "none"}
                    strokeWidth={isHovered ? 2 : 0}
                  />
                  <text
                    y={r + 12}
                    textAnchor="middle"
                    fill="#a0aec0"
                    fontSize={9}
                    pointerEvents="none"
                  >
                    {node.label.length > 14 ? node.label.slice(0, 11) + "…" : node.label}
                  </text>
                  {/* Tooltip on hover via title */}
                  <title>{node.id} (fan-in: {node.fanIn}, fan-out: {node.fanOut})</title>
                </g>
              );
            })}
          </g>
        </svg>
      </div>
    </div>
  );
}
