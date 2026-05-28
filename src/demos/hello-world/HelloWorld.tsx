import { Unfold, type UnfoldData } from "../../lib";

const data: UnfoldData = {
  nodes: [
    { id: "root", label: "root" },
    { id: "a", label: "a" },
    { id: "b", label: "b" },
    { id: "a1", label: "a1" },
    { id: "a2", label: "a2" },
  ],
  edges: [
    { id: "e1", source: "root", target: "a" },
    { id: "e2", source: "root", target: "b" },
    { id: "e3", source: "a", target: "a1" },
    { id: "e4", source: "a", target: "a2" },
  ],
};

export function HelloWorld() {
  return <Unfold data={data} />;
}
