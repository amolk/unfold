import type { ComponentType } from "react";
import { HelloWorld } from "./hello-world/HelloWorld";
import helloWorldSource from "./hello-world/HelloWorld.tsx?raw";
import { Layouts } from "./layouts/Layouts";
import layoutsSource from "./layouts/Layouts.tsx?raw";
import { EdgeFlows } from "./edge-flows/EdgeFlows";
import edgeFlowsSource from "./edge-flows/EdgeFlows.tsx?raw";
import { Curvature } from "./curvature/Curvature";
import curvatureSource from "./curvature/Curvature.tsx?raw";
import { EdgeStyle } from "./edge-style/EdgeStyle";
import edgeStyleSource from "./edge-style/EdgeStyle.tsx?raw";
import { NodeStyle } from "./node-style/NodeStyle";
import nodeStyleSource from "./node-style/NodeStyle.tsx?raw";
import { CameraMode } from "./camera-mode/CameraMode";
import cameraModeSource from "./camera-mode/CameraMode.tsx?raw";
import { Events } from "./events/Events";
import eventsSource from "./events/Events.tsx?raw";
import { Controlled } from "./controlled/Controlled";
import controlledSource from "./controlled/Controlled.tsx?raw";
import { Expansion } from "./expansion/Expansion";
import expansionSource from "./expansion/Expansion.tsx?raw";
import { SizesWeights } from "./sizes-weights/SizesWeights";
import sizesWeightsSource from "./sizes-weights/SizesWeights.tsx?raw";
import { Tree } from "./deep-tree/DeepTree";
import deepTreeSource from "./deep-tree/DeepTree.tsx?raw";
import { Dag } from "./dag/Dag";
import dagSource from "./dag/Dag.tsx?raw";

/** What we want readers to copy-paste — the published package name, not the
 *  in-repo relative path. Demo files import from "../../lib" so the SPA
 *  doesn't depend on `npm link`, but the displayed source rewrites that to
 *  this name. Update if the published package gets a scope. */
const PACKAGE_NAME = "unfold";

/** Rewrite in-repo relative imports of the library to the published package
 *  name. Matches `from "../../lib"` and `from "../../lib/anything"`. */
function rewriteForDisplay(source: string): string {
  return source.replace(
    /from\s+(["'])\.\.\/\.\.\/lib(\/[^"']*)?\1/g,
    (_m, q, sub) => `from ${q}${PACKAGE_NAME}${sub ?? ""}${q}`,
  );
}

export interface Demo {
  slug: string;
  title: string;
  blurb: string;
  Component: ComponentType;
  source: string;
  sourcePath: string;
}

export const demos: Demo[] = [
  {
    slug: "hello-world",
    title: "Hello World",
    blurb:
      "The smallest possible <Unfold>: 5 nodes, 4 edges, no theme, no callbacks. " +
      "Shows the default layered layout and out-of-the-box look.",
    Component: HelloWorld,
    source: rewriteForDisplay(helloWorldSource),
    sourcePath: "src/demos/hello-world/HelloWorld.tsx",
  },
  {
    slug: "tree",
    title: "Tree",
    blurb:
      "Procedurally-generated tree topology (~100 nodes) run through the library's layout system. " +
      "Toggle between the 3D conical-fan `layered` layout and the flat sunburst `radial` layout. Reseed for a new topology.",
    Component: Tree,
    source: rewriteForDisplay(deepTreeSource),
    sourcePath: "src/demos/deep-tree/DeepTree.tsx",
  },
  {
    slug: "dag",
    title: "DAG",
    blurb:
      "A directed acyclic graph laid out with the library's `hierarchical` layout: longest-path layer assignment, " +
      "barycenter crossing minimization, and even per-layer coordinate assignment. Reseed for a new topology.",
    Component: Dag,
    source: rewriteForDisplay(dagSource),
    sourcePath: "src/demos/dag/Dag.tsx",
  },
  {
    slug: "layouts",
    title: "Layouts",
    blurb:
      "One topology rendered four ways: the three built-in layouts " +
      "(`layered`, `radial`, `hierarchical`) plus `layout=\"none\"` with " +
      "hand-authored `position` tuples. Only the `layout` prop changes between panes.",
    Component: Layouts,
    source: rewriteForDisplay(layoutsSource),
    sourcePath: "src/demos/layouts/Layouts.tsx",
  },
  {
    slug: "edge-flows",
    title: "Edge flows",
    blurb:
      "Each edge can carry a multi-color particle stream with per-color proportions and a speed multiplier. " +
      "Up to 8 colors per edge; proportions are auto-normalized.",
    Component: EdgeFlows,
    source: rewriteForDisplay(edgeFlowsSource),
    sourcePath: "src/demos/edge-flows/EdgeFlows.tsx",
  },
  {
    slug: "curvature",
    title: "Curvature & control points",
    blurb:
      "`curvature` (0–1) auto-bends edges in a perpendicular plane. " +
      "For arbitrary paths — S-curves, custom routing — set `controls` to an explicit four-point cubic bezier.",
    Component: Curvature,
    source: rewriteForDisplay(curvatureSource),
    sourcePath: "src/demos/curvature/Curvature.tsx",
  },
  {
    slug: "edge-style",
    title: "Edge style",
    blurb:
      "Global `style.edge` knobs — density, streams, wisp amplitude / stretch / morph, streak length, " +
      "speed, glints. Same data, four presets: smoke, lightning, data-wire, default.",
    Component: EdgeStyle,
    source: rewriteForDisplay(edgeStyleSource),
    sourcePath: "src/demos/edge-style/EdgeStyle.tsx",
  },
  {
    slug: "node-style",
    title: "Node style",
    blurb:
      "Six panes covering node visuals end-to-end: the `style.node` knobs (baseRadius / opacity / rimStrength), " +
      "category-based coloring via `theme.categories`, and the selection rim via `theme.highlight`.",
    Component: NodeStyle,
    source: rewriteForDisplay(nodeStyleSource),
    sourcePath: "src/demos/node-style/NodeStyle.tsx",
  },
  {
    slug: "camera-mode",
    title: "2D / 3D camera",
    blurb:
      "`cameraMode=\"2d\"` switches to an orthographic camera (no perspective foreshortening) and locks orbit rotation — " +
      "pan and zoom still work. Pair with the `radial` or `hierarchical` layout, which are designed flat on the y/z plane.",
    Component: CameraMode,
    source: rewriteForDisplay(cameraModeSource),
    sourcePath: "src/demos/camera-mode/CameraMode.tsx",
  },
  {
    slug: "events",
    title: "Events",
    blurb:
      "Every pick callback wired up — node/edge click and hover, plus background click. " +
      "Each item's `data` payload is echoed back, so a real app dispatches on it.",
    Component: Events,
    source: rewriteForDisplay(eventsSource),
    sourcePath: "src/demos/events/Events.tsx",
  },
  {
    slug: "controlled",
    title: "Controlled state",
    blurb:
      "`focusedNodeId` and `selectedNodeIds` are dual-mode: pass them and you own the state, omit them and the library does. " +
      "Here both are controlled — buttons drive them directly, callbacks keep them in sync with scene clicks.",
    Component: Controlled,
    source: rewriteForDisplay(controlledSource),
    sourcePath: "src/demos/controlled/Controlled.tsx",
  },
  {
    slug: "expansion",
    title: "Lazy expansion",
    blurb:
      "Mark a leaf `expandable: true` to render an affordance ring. " +
      "Clicking it fires `onNodeExpand` — your handler returns a new `data` with fresh children. The library never mutates your data.",
    Component: Expansion,
    source: rewriteForDisplay(expansionSource),
    sourcePath: "src/demos/expansion/Expansion.tsx",
  },
  {
    slug: "sizes-weights",
    title: "Sizes & weights",
    blurb:
      "Per-item visual scalars: `node.size` controls sphere radius (importance); " +
      "`edge.weight` controls particle density (traffic / throughput / confidence).",
    Component: SizesWeights,
    source: rewriteForDisplay(sizesWeightsSource),
    sourcePath: "src/demos/sizes-weights/SizesWeights.tsx",
  },
];

export function findDemo(slug: string): Demo | undefined {
  return demos.find((d) => d.slug === slug);
}
