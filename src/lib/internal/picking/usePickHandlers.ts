import { useMemo } from "react";
import { createPickResolver } from "./pick-resolver";
import type { NodeId, UnfoldData, UnfoldNode, UnfoldEdge } from "../../types";

export interface UsePickHandlersArgs {
  data: UnfoldData;
  nodeIds: readonly string[];
  edgeIds: readonly string[];
  affordances: ReadonlyArray<{ index: number }>;
  /** Library default: clicking a node focuses it — applied on every node click,
   *  independent of whether onNodeClick is supplied. */
  onSetFocus: (next: NodeId | null) => void;
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
    const nodeClick = (i: number, event: PointerEvent) => {
      const id = resolver.nodeIdAt(i);
      if (id == null) return;
      // Library default: click a node → focus it (uncontrolled mode updates
      // internal state; controlled mode just fires onFocusChange).
      onSetFocus(id);
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

    const edgeClick = onEdgeClick
      ? (i: number, event: PointerEvent) => {
          const edge = resolver.edgeAt(i);
          if (edge) onEdgeClick(edge, event);
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
  }, [resolver, onSetFocus, onNodeClick, onNodeHover, onEdgeClick, onEdgeHover, onNodeExpand]);
}
