# Unfold

A prime-radiant timeline prototype: an interactive 3D visualization of branching narratives, rendered with React Three Fiber and custom GLSL shaders. Nodes unfold along a tree of possible futures; the camera follows the user's focus while a particle field traces the edges between states.

**[Live demo gallery →](https://amolk.github.io/unfold/)**

## Stack

- React 18 + TypeScript
- Vite
- [@react-three/fiber](https://github.com/pmndrs/react-three-fiber), [drei](https://github.com/pmndrs/drei), [postprocessing](https://github.com/pmndrs/postprocessing)
- [leva](https://github.com/pmndrs/leva) for live controls
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
