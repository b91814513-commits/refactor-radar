import { useEffect, useRef, useState } from "react";
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

import type { GraphLink, GraphNode } from "./graphUtils";

export interface PositionedNode extends GraphNode {
  x: number;
  y: number;
  fx?: number | null;
  fy?: number | null;
}

export interface PositionedLink extends GraphLink {
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
}

interface SimulationState {
  nodes: PositionedNode[];
  links: PositionedLink[];
}

interface SimNode extends SimulationNodeDatum {
  id: string;
  graphNode: GraphNode;
}

interface SimLink extends SimulationLinkDatum<SimNode> {
  isCyclic: boolean;
}

export function useForceSimulation(
  graphNodes: GraphNode[],
  graphLinks: GraphLink[],
  width: number,
  height: number,
): SimulationState {
  const simulationRef = useRef<Simulation<SimNode, SimLink> | null>(null);
  const [state, setState] = useState<SimulationState>({
    nodes: [],
    links: [],
  });

  useEffect(() => {
    if (width === 0 || height === 0 || graphNodes.length === 0) return;

    // Create sim nodes with initial positions spread in a circle
    const simNodes: SimNode[] = graphNodes.map((node, i) => {
      const angle = (2 * Math.PI * i) / graphNodes.length;
      const radius = Math.min(width, height) * 0.3;
      return {
        id: node.id,
        graphNode: node,
        x: width / 2 + radius * Math.cos(angle),
        y: height / 2 + radius * Math.sin(angle),
      };
    });

    const nodeById = new Map(simNodes.map((n) => [n.id, n]));

    const simLinks: SimLink[] = graphLinks
      .filter((link) => nodeById.has(link.source) && nodeById.has(link.target))
      .map((link) => ({
        source: nodeById.get(link.source)!,
        target: nodeById.get(link.target)!,
        isCyclic: link.isCyclic,
      }));

    const sim = forceSimulation<SimNode, SimLink>(simNodes)
      .force(
        "link",
        forceLink<SimNode, SimLink>(simLinks)
          .id((d) => d.id)
          .distance(80),
      )
      .force("charge", forceManyBody<SimNode>().strength(-120))
      .force("center", forceCenter(width / 2, height / 2))
      .force("collide", forceCollide<SimNode>(18))
      .alphaDecay(0.035)
      .velocityDecay(0.4);

    sim.on("tick", () => {
      const nodes: PositionedNode[] = simNodes.map((sn) => ({
        ...sn.graphNode,
        x: sn.x ?? 0,
        y: sn.y ?? 0,
        fx: sn.fx,
        fy: sn.fy,
      }));

      const links: PositionedLink[] = simLinks.map((sl) => {
        const src = sl.source as SimNode;
        const tgt = sl.target as SimNode;
        return {
          source: src.id,
          target: tgt.id,
          isCyclic: sl.isCyclic,
          sourceX: src.x ?? 0,
          sourceY: src.y ?? 0,
          targetX: tgt.x ?? 0,
          targetY: tgt.y ?? 0,
        };
      });

      setState({ nodes, links });
    });

    simulationRef.current = sim;

    return () => {
      sim.stop();
      simulationRef.current = null;
    };
  }, [graphNodes, graphLinks, width, height]);

  return state;
}

/**
 * Fix a node's position (used for dragging).
 * Returns an updater function compatible with the simulation.
 */
export function useDragCallbacks(
  simulationRef: React.RefObject<Simulation<SimNode, SimLink> | null>,
) {
  const draggedRef = useRef<string | null>(null);

  function onDragStart(nodeId: string) {
    draggedRef.current = nodeId;
  }

  function onDragMove(nodeId: string, x: number, y: number) {
    if (!simulationRef.current) return;
    const node = (simulationRef.current.nodes() as SimNode[]).find(
      (n) => n.id === nodeId,
    );
    if (node) {
      node.fx = x;
      node.fy = y;
      simulationRef.current.alpha(0.3).restart();
    }
  }

  function onDragEnd(nodeId: string) {
    if (!simulationRef.current) return;
    const node = (simulationRef.current.nodes() as SimNode[]).find(
      (n) => n.id === nodeId,
    );
    if (node) {
      node.fx = null;
      node.fy = null;
      simulationRef.current.alpha(0.1).restart();
    }
    draggedRef.current = null;
  }

  return { onDragStart, onDragMove, onDragEnd, draggedRef };
}
