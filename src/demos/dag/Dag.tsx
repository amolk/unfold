import { useMemo } from "react";
import { Unfold, type UnfoldLayout } from "../../lib";
import { buildDag } from "../_data/buildDag";
import { ControlPanel, Segmented, Button, Field, useToggle, useReseed } from "../../demo-shell";

// `buildDag` returns topology only — six bands with 1–3 parents per node
// drawn from the previous one or two bands. The layout toggle picks how
// the library places that topology in space:
//
//   - "hierarchical"  Sugiyama-style: longest-path layer assignment,
//                     barycenter crossing minimization, even per-layer
//                     coords. The right pick for actual DAGs.
//   - "layered"       Conical 3D fan, treating the DAG as a tree via
//                     primary-parent reduction (each node picks its
//                     min-depth parent). Skip-connections still render
//                     but don't influence position.
//   - "radial"        Flat sunburst on the y/z plane, same primary-parent
//                     reduction. Reads as a tree-of-DAGs.

const LAYOUTS: UnfoldLayout[] = ["hierarchical", "layered", "radial"];

export function Dag() {
  const layout = useToggle(LAYOUTS, "layered");
  const { seed, reseed } = useReseed(0xc0ffee);
  const data = useMemo(() => buildDag(seed, 6, 6), [seed]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <Unfold data={data} layout={layout.value} />
      <ControlPanel>
        <Segmented label="layout" {...layout} />
        <Field label={`seed: ${seed}`} />
        <Field label="nodes">{data.nodes.length}</Field>
        <Field label="edges">{data.edges.length}</Field>
        <Button onClick={reseed} active>
          regenerate
        </Button>
      </ControlPanel>
    </div>
  );
}
