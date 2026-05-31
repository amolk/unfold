import { useMemo } from "react";
import { createPickResolver } from "./pick-resolver";
import { reduceSelection, type PickHit, type Selection } from "./selection";
import type { NodeId, EdgeId, UnfoldData, UnfoldNode, UnfoldEdge } from "../../types";

export interface UsePickHandlersArgs {
  data: UnfoldData;
  nodeIds: readonly string[];
  edgeIds: readonly string[];
  affordances: ReadonlyArray<{ index: number }>;
  /** Library default: clicking a node focuses it — applied on every node click,
   *  independent of whether onNodeClick is supplied. */
  onSetFocus: (next: NodeId | null) => void;
  // --- Current unified selection (both kinds) + setters, so the click reducer
  // can compute the next selection from the live truth. ---
  selectedNodeIds: readonly NodeId[];
  selectedEdgeIds: readonly EdgeId[];
  onSetSelectedNodes: (next: readonly NodeId[]) => void;
  onSetSelectedEdges: (next: readonly EdgeId[]) => void;
  /** Gate click-driven selection per kind. Node focus-on-click is unaffected. */
  nodesSelectable: boolean;
  edgesSelectable: boolean;
  onNodeClick?: (node: UnfoldNode, event: PointerEvent) => void;
  onNodeHover?: (node: UnfoldNode | null, event: PointerEvent) => void;
  onEdgeClick?: (edge: UnfoldEdge, event: PointerEvent) => void;
  onEdgeHover?: (edge: UnfoldEdge | null, event: PointerEvent) => void;
  onNodeExpand?: (node: UnfoldNode) => void;
}

/** Exactly the index-based handler bundle the picker components bind. Entries
 *  are undefined when no behavior is wired (so the pickers keep their
 *  `hasHandlers` gating). `nodeClick` is never undefined — the focus default
 *  is always live. */
export interface PickHandlers {
  nodeClick: (index: number, event: PointerEvent) => void;
  nodeHover?: (index: number | null, event: PointerEvent) => void;
  /** Undefined when edges are neither selectable nor have an onEdgeClick — the
   *  EdgePicker then renders no hit-test tubes. */
  edgeClick?: (index: number, event: PointerEvent) => void;
  edgeHover?: (index: number | null, event: PointerEvent) => void;
  affordanceClick?: (index: number, event: PointerEvent) => void;
}

/** Collapses Scene's five hand-written wired* closures (+ the nodeById/edgeById
 *  maps) into one call. The resolver is pure and rebuilds only on
 *  data/built/affordances identity; callback identities are not resolver deps,
 *  so inline parent callbacks don't churn the maps. */
export function usePickHandlers(args: UsePickHandlersArgs): PickHandlers {
  const {
    data,
    nodeIds,
    edgeIds,
    affordances,
    onSetFocus,
    selectedNodeIds,
    selectedEdgeIds,
    onSetSelectedNodes,
    onSetSelectedEdges,
    nodesSelectable,
    edgesSelectable,
    onNodeClick,
    onNodeHover,
    onEdgeClick,
    onEdgeHover,
    onNodeExpand,
  } = args;

  const resolver = useMemo(
    () => createPickResolver({ data, nodeIds, edgeIds, affordances }),
    [data, nodeIds, edgeIds, affordances],
  );

  return useMemo<PickHandlers>(() => {
    // Run one click through the shared selection rule and push only the
    // array(s) that actually changed (the reducer preserves identity for the
    // untouched kind / no-op clicks, so an unchanged setter never fires).
    const applySelection = (hit: PickHit, event: PointerEvent) => {
      const additive = event.metaKey || event.ctrlKey;
      const current: Selection = { nodes: selectedNodeIds, edges: selectedEdgeIds };
      const next = reduceSelection(current, hit, additive);
      if (next.nodes !== current.nodes) onSetSelectedNodes(next.nodes);
      if (next.edges !== current.edges) onSetSelectedEdges(next.edges);
    };

    const nodeClick = (i: number, event: PointerEvent) => {
      const id = resolver.nodeIdAt(i);
      if (id == null) return;
      // Library default: click a node → focus it (camera-follow + bulge). Focus
      // is single + node-only and always applies. Selection is gated by
      // nodesSelectable; the focus default is independent of it.
      onSetFocus(id);
      if (nodesSelectable) applySelection({ kind: "node", id }, event);
      const node = resolver.nodeAt(i);
      if (node && onNodeClick) onNodeClick(node, event);
    };

    const nodeHover = onNodeHover
      ? (i: number | null, event: PointerEvent) => {
          if (i == null) return onNodeHover(null, event);
          const node = resolver.nodeAt(i);
          if (node) onNodeHover(node, event);
        }
      : undefined;

    // Wired when edges can be selected OR the caller wants edge clicks. When
    // neither holds it stays undefined so the EdgePicker renders no tubes.
    // Edges are not a camera-focus target, so focus is untouched here.
    const edgeClick =
      edgesSelectable || onEdgeClick
        ? (i: number, event: PointerEvent) => {
            const edge = resolver.edgeAt(i);
            if (!edge) return;
            if (edgesSelectable) applySelection({ kind: "edge", id: edge.id }, event);
            if (onEdgeClick) onEdgeClick(edge, event);
          }
        : undefined;

    const edgeHover = onEdgeHover
      ? (i: number | null, event: PointerEvent) => {
          if (i == null) return onEdgeHover(null, event);
          const edge = resolver.edgeAt(i);
          if (edge) onEdgeHover(edge, event);
        }
      : undefined;

    const affordanceClick = onNodeExpand
      ? (i: number, _event: PointerEvent) => {
          const node = resolver.affordanceNodeAt(i);
          if (node) onNodeExpand(node);
        }
      : undefined;

    return { nodeClick, nodeHover, edgeClick, edgeHover, affordanceClick };
  }, [
    resolver,
    onSetFocus,
    selectedNodeIds,
    selectedEdgeIds,
    onSetSelectedNodes,
    onSetSelectedEdges,
    nodesSelectable,
    edgesSelectable,
    onNodeClick,
    onNodeHover,
    onEdgeClick,
    onEdgeHover,
    onNodeExpand,
  ]);
}
