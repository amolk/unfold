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
    /** Sphere radius in world units. Default 0.2. */
    baseRadius?: number;
    /** Rim-light strength on the node spheres. Default 3. */
    rimStrength?: number;
    /** Sphere body opacity; 0 = invisible spheres (still pickable). Default 0.07. */
    opacity?: number;
  };
  edge?: {
    /** Particles emitted per visible edge — overall stream density. Default 4000. */
    density?: number;
    /** Distinct smoke filaments per edge. Fewer = fatter wisps. Default 30. */
    streams?: number;
    /** Sideways wisp displacement amplitude. Default 0.15. */
    wispAmplitude?: number;
    /** How fast wisp paths evolve over time. 0 = frozen pattern; default 0.15
     *  gives a slow, lava-lamp-like drift. */
    wispMorphSpeed?: number;
    /** Wisp stretch along the curve tangent. Default 0.7. */
    wispStretch?: number;
    /** Per-thread noise detail in [0,1]. Default 0.96. */
    threadDetail?: number;
    /** Motion-blur streak length. 0 = round grains. Default 0.6. */
    streakLength?: number;
    /** Particle travel-speed multiplier. Default 0.32. */
    speed?: number;
    /** Slow shimmer amplitude in [0,1]. Default 0.1. */
    shimmer?: number;
    /** Fraction of particles rendered as bright glints in [0,1]. Default 0.03. */
    glintRatio?: number;
    /** Glint brightness multiplier. Default 1. */
    glintIntensity?: number;
    // The long tail of fine-tuning ParticleField uniforms (wind, palette weave,
    // node-bulge, burst gating, grain, the zoom-driven point-size/intensity
    // anchors, ~40 in total) is intentionally NOT exposed here: those were
    // authoring-time knobs used to dial in the look, which is now baked as the
    // default. They stay at their tuned values in ParticleField's uniforms
    // object. Promote one to a field here if a real consumer need appears.
  };
  camera?: {
    /** Focus-follow lerp factor applied per frame, in [0,1]. Default 0.005. */
    ease?: number;
  };
  fade?: {
    /** Per-second rate at which nodes/edges fade in and out. Default 2.0. */
    speed?: number;
  };
}

export type UnfoldLayout = "layered" | "radial" | "hierarchical" | "none";
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
