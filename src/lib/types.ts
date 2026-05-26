// Public type surface for the Unfold component. See the design doc at
// plans/we-want-to-turn-dynamic-robin.md for the rationale behind each field.
//
// Nothing in this file may import `three` or any other implementation
// dependency — these types cross the library boundary into consumer code, so
// positions/colors are expressed as plain primitives (tuples, hex strings).

export type NodeId = string;

/** A position or direction in world space, as a plain tuple so the public API
 *  never leaks a THREE.Vector3 to consumers. */
export type Vec3 = [number, number, number];

export interface UnfoldNode {
  id: NodeId;
  /** World position. Optional — when absent the chosen `layout` computes it. */
  position?: Vec3;
  /** Explicit color (hex). Takes precedence over `category`. */
  color?: string;
  /** Category name; resolved against `theme.categories` for a color. */
  category?: string;
  /** Visual radius multiplier. Default 1. */
  size?: number;
  label?: string;
  /** When true, the node shows an expand affordance and clicking it fires
   *  `onNodeExpand` so the caller can append children to `data`. */
  expandable?: boolean;
  /** Opaque caller payload — never read by the library, echoed back in every
   *  callback that references this node. */
  data?: unknown;
}

/** The "colored dots in proportions" spec for an edge's particle stream.
 *  Up to 8 colors are interleaved into the stream in the declared proportions
 *  (normalized internally — pass raw counts or ratios). */
export interface EdgeFlow {
  colors: string[]; // length 1..8
  proportions: number[]; // same length as `colors`
  speed?: number; // default 1.0
}

export interface UnfoldEdge {
  id: string;
  source: NodeId;
  target: NodeId;
  /** Particle density multiplier. Default 1. */
  weight?: number;
  /** 0 = straight, 1 = default bow. Default 0.4. Ignored when `controls` set. */
  curvature?: number;
  /** Exact cubic-bezier control points — escape hatch overriding `curvature`. */
  controls?: [Vec3, Vec3, Vec3, Vec3];
  flow?: EdgeFlow;
  /** Opaque caller payload — echoed back in every callback for this edge. */
  data?: unknown;
}

export interface UnfoldData {
  nodes: UnfoldNode[];
  edges: UnfoldEdge[];
}

export interface UnfoldTheme {
  background?: string;
  defaultNodeColor?: string;
  /** Used for an edge's stream when it carries no `flow` spec. */
  defaultEdgeColor?: string;
  /** category name → color. */
  categories?: Record<string, string>;
  /** Selection / hover tint. */
  highlight?: string;
}

export interface UnfoldStyle {
  node?: {
    baseRadius?: number;
    rimStrength?: number;
  };
  edge?: {
    particleSize?: number;
    wispAmplitude?: number;
    shimmer?: number;
    streakLength?: number;
    // The remaining ParticleField tunables are surfaced here in Phase 3; all
    // fields are optional and fall back to the library defaults.
  };
  camera?: {
    easeMs?: number;
  };
  fade?: {
    enterMs?: number;
    exitMs?: number;
  };
}

export type UnfoldLayout = "layered" | "radial" | "none";
export type UnfoldCameraMode = "3d" | "2d";

export interface UnfoldCameraState {
  position: Vec3;
  target: Vec3;
}

/** Camera-only imperative handle. State (focus / selection / expansion) is
 *  prop-driven and intentionally NOT controllable through this handle. */
export interface UnfoldHandle {
  fitView(options?: { paddingPx?: number; animateMs?: number }): void;
  focusNode(id: NodeId, options?: { animateMs?: number; distance?: number }): void;
  getCameraState(): UnfoldCameraState;
  setCameraState(state: UnfoldCameraState, options?: { animateMs?: number }): void;
}

export interface UnfoldProps {
  // --- Data ---
  data: UnfoldData;

  // --- Controlled state (optional; uncontrolled per-field when absent) ---
  focusedNodeId?: NodeId | null;
  expandedNodeIds?: NodeId[];
  selectedNodeIds?: NodeId[];

  // --- Layout ---
  layout?: UnfoldLayout;

  // --- Camera ---
  cameraMode?: UnfoldCameraMode;
  initialCamera?: UnfoldCameraState;

  // --- Theme / style ---
  theme?: UnfoldTheme;
  style?: UnfoldStyle;
  className?: string;

  // --- Events (item-first arg order) ---
  onNodeClick?: (node: UnfoldNode, event: PointerEvent) => void;
  onNodeHover?: (node: UnfoldNode | null, event: PointerEvent) => void;
  onEdgeClick?: (edge: UnfoldEdge, event: PointerEvent) => void;
  onEdgeHover?: (edge: UnfoldEdge | null, event: PointerEvent) => void;
  onBackgroundClick?: (event: PointerEvent) => void;
  onNodeExpand?: (node: UnfoldNode) => void;
  onFocusChange?: (nodeId: NodeId | null) => void;
  onSelectionChange?: (nodeIds: NodeId[]) => void;
}
