import { Unfold, type UnfoldData } from "../../lib";
import { DemoGrid } from "../../demo-shell";

// `cameraMode="2d"` swaps the perspective camera for an orthographic one
// (no depth foreshortening) and locks OrbitControls rotation — pan and
// zoom still work. The default 2D camera sits on +x looking at the y/z
// plane, which matches the `radial` and `hierarchical` layouts' designed
// orientation. `cameraMode` is set on mount; to switch live, remount.

const data: UnfoldData = {
  nodes: [
    { id: "root" },
    { id: "a" },
    { id: "b" },
    { id: "c" },
    { id: "d" },
    { id: "a1" },
    { id: "a2" },
    { id: "b1" },
    { id: "b2" },
    { id: "c1" },
  ],
  edges: [
    { id: "e1", source: "root", target: "a" },
    { id: "e2", source: "root", target: "b" },
    { id: "e3", source: "root", target: "c" },
    { id: "e4", source: "root", target: "d" },
    { id: "e5", source: "a", target: "a1" },
    { id: "e6", source: "a", target: "a2" },
    { id: "e7", source: "b", target: "b1" },
    { id: "e8", source: "b", target: "b2" },
    { id: "e9", source: "c", target: "c1" },
  ],
};

export function CameraMode() {
  return (
    <div style={{ display: "flex", width: "100%", height: "100%" }}>
      <Pane label='cameraMode="2d" · orthographic, no rotate'>
        <Unfold data={data} layout="radial" cameraMode="2d" />
      </Pane>
      <Pane label='cameraMode="3d" · perspective, full orbit'>
        <Unfold data={data} layout="radial" cameraMode="3d" />
      </Pane>
    </div>
  );
}

function Pane({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ position: "relative", flex: 1, height: "100%" }}>
      {children}
      <div
        style={{
          position: "absolute",
          top: 10,
          left: 12,
          color: "#d8d0c8",
          fontFamily: "ui-monospace, monospace",
          fontSize: 11,
          background: "rgba(20, 10, 14, 0.75)",
          padding: "4px 8px",
          borderRadius: 3,
          pointerEvents: "none",
        }}
      >
        {label}
      </div>
    </div>
  );
}
