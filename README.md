# Unfold

A prime-radiant timeline prototype: an interactive 3D visualization of branching narratives, rendered with React Three Fiber and custom GLSL shaders. Nodes unfold along a tree of possible futures; the camera follows the user's focus while a particle field traces the edges between states.

**[Live demo gallery →](https://amolk.github.io/unfold/)**

## Install

```bash
npm install unfold-graph
```

React, three.js, and the react-three ecosystem are peer dependencies — install them alongside if you don't already have them:

```bash
npm install react react-dom three @react-three/fiber @react-three/drei @react-three/postprocessing postprocessing
```

## Usage

```tsx
import { Unfold, type UnfoldData } from "unfold-graph";

const data: UnfoldData = {
  nodes: [{ id: "root" }, { id: "a" }, { id: "b" }],
  edges: [
    { id: "e1", source: "root", target: "a" },
    { id: "e2", source: "root", target: "b" },
  ],
};

export function App() {
  return (
    <div style={{ width: "100%", height: "100vh" }}>
      <Unfold
        data={data}
        onSelectionChange={(nodeIds) => console.log("selected", nodeIds)}
      />
    </div>
  );
}
```

`<Unfold>` is the single entry point; positions are auto-laid-out when omitted. Focus, selection, and expansion are each controllable or uncontrolled per-prop. See `src/lib/types.ts` for the full prop surface (`theme`, `style`, `layout`, `cameraMode`, the `selected*`/`focused*` state, and the `on*` callbacks).

## Stack

- React 18 + TypeScript
- Vite
- [@react-three/fiber](https://github.com/pmndrs/react-three-fiber), [drei](https://github.com/pmndrs/drei), [postprocessing](https://github.com/pmndrs/postprocessing)
- Custom vertex/fragment shaders for nodes and the particle field

## Layout

- `src/main.tsx` — React entry; mounts the demo gallery
- `src/lib/` — the Unfold library
  - `index.ts` — public API surface (re-exports)
  - `Unfold.tsx` — top-level component (Canvas, bloom, error boundary)
  - `types.ts` — public types (`UnfoldData`, `UnfoldNode`, `UnfoldEdge`, theme/style, …)
  - `internal/` — Three.js scene, shaders, GPU mirrors, camera follow, layout (`layout/`), picking (`picking/`), and shared timeline types
- `src/demos/` — the demo gallery SPA
  - `DemoSite.tsx`, `Landing.tsx`, `DemoPage.tsx` — shell, landing page, per-demo page
  - `registry.ts` — the catalog of demos
  - one folder per demo (`hello-world/`, `deep-tree/`, `edge-flows/`, …)
  - `_data/` — shared demo fixtures (`demoData.ts`)

## Running the dev server

```bash
npm install
npm run dev
```

Vite serves the app at the URL it prints (default `http://localhost:5173`). HMR is on; edits to `src/` reload in place.

## Other scripts

- `npm run build` — typecheck (`tsc -b`) and produce a production bundle in `dist/`
- `npm run preview` — serve the built bundle locally for a final check
