# Unfold

A prime-radiant timeline prototype: an interactive 3D visualization of branching narratives, rendered with React Three Fiber and custom GLSL shaders. Nodes unfold along a tree of possible futures; the camera follows the user's focus while a particle field traces the edges between states.

## Stack

- React 18 + TypeScript
- Vite
- [@react-three/fiber](https://github.com/pmndrs/react-three-fiber), [drei](https://github.com/pmndrs/drei), [postprocessing](https://github.com/pmndrs/postprocessing)
- [leva](https://github.com/pmndrs/leva) for live controls
- Custom vertex/fragment shaders for nodes and the particle field

## Layout

- `src/scene/` — Three.js scene, shaders, GPU mirrors, camera follow, theme
- `src/explorer/` — explorer state machine (single-path / toggle / full-tree modes)
- `src/timeline/` — shared timeline types
- `src/App.tsx` — Canvas, bloom, error boundary

## Running the dev server

```bash
npm install
npm run dev
```

Vite serves the app at the URL it prints (default `http://localhost:5173`). HMR is on; edits to `src/` reload in place.

## Other scripts

- `npm run build` — typecheck (`tsc -b`) and produce a production bundle in `dist/`
- `npm run preview` — serve the built bundle locally for a final check
