import type { UnfoldData, UnfoldNode, UnfoldEdge } from "../../types";

// Pure index → public-object resolution for pointer events. The picker
// components raise INDEX-based events (instanceId / edge index / affordance
// index); this turns those back into the caller's exact UnfoldNode / UnfoldEdge.
// No React, no THREE — a function of (data, nodeIds, edgeIds) only, so it is
// rebuildable whenever any changes and unit-testable with plain arrays.

export interface PickResolverInput {
  /** Public graph — source of truth for the UnfoldNode / UnfoldEdge objects. */
  data: UnfoldData;
  /** index → node string-id, in active-set order (differs from data order
   *  after a prune/reorder). From the current build (SceneProjectionBuilt). */
  nodeIds: readonly string[];
  /** index → edge string-id, same convention. */
  edgeIds: readonly string[];
  /** Affordance slots (parallel to what the Affordance component renders).
   *  `index` is the nodeIds index of the node the ring sits on — this carries
   *  the affordance double-indirection into the resolver. */
  affordances: ReadonlyArray<{ index: number }>;
}

export interface PickResolver {
  /** built.nodeIds[i] → data node. undefined if i is out of range or the id
   *  is not in data (e.g. a stale event after a topology change). */
  nodeAt(index: number): UnfoldNode | undefined;
  /** built.edgeIds[i] → data edge. */
  edgeAt(index: number): UnfoldEdge | undefined;
  /** The raw string id at a node index. The focus default keys on the id (it
   *  resolves even if the node was pruned from `data`), not the object. */
  nodeIdAt(index: number): string | undefined;
  /** affordances[i].index → built.nodeIds[...] → data node, in one hop. */
  affordanceNodeAt(affordanceIndex: number): UnfoldNode | undefined;
}

/** Build the resolver. Pure: same (data, built, affordances) ⇒ same behavior.
 *  Indexes data.nodes / data.edges by id once so each lookup is O(1). */
export function createPickResolver(input: PickResolverInput): PickResolver {
  const { data, nodeIds, edgeIds, affordances } = input;

  const nodeById = new Map<string, UnfoldNode>();
  for (const n of data.nodes) nodeById.set(n.id, n);
  const edgeById = new Map<string, UnfoldEdge>();
  for (const e of data.edges) edgeById.set(e.id, e);

  const nodeIdAt = (i: number): string | undefined => nodeIds[i];
  const nodeAt = (i: number): UnfoldNode | undefined => {
    const id = nodeIds[i];
    return id == null ? undefined : nodeById.get(id);
  };
  const edgeAt = (i: number): UnfoldEdge | undefined => {
    const id = edgeIds[i];
    return id == null ? undefined : edgeById.get(id);
  };
  const affordanceNodeAt = (ai: number): UnfoldNode | undefined => {
    const slot = affordances[ai];
    return slot == null ? undefined : nodeAt(slot.index);
  };

  return { nodeAt, edgeAt, nodeIdAt, affordanceNodeAt };
}
