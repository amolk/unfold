import { useMemo } from "react";
import { Unfold, type UnfoldLayout } from "../../lib";
import { buildDemoData } from "../_data/demoData";
import { ControlPanel, Segmented, Button, Field, useToggle, useReseed } from "../../demo-shell";

// A larger procedurally-generated tree (~100 nodes) to exercise layout and
// performance. `buildDemoData(seed, depth, { positioned: false })` returns
// topology only; the library's auto-layout places it.
const LAYOUTS: UnfoldLayout[] = ["layered", "radial", "hierarchical"];

export function DeepTree() {
  const layout = useToggle(LAYOUTS, "layered");
  const { seed, reseed } = useReseed(9143);
  const data = useMemo(
    () => buildDemoData(seed, 4, { positioned: false }),
    [seed],
  );

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
