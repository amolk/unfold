import { useState } from "react";
import {
  Unfold,
  type UnfoldData,
  type UnfoldEdge,
  type UnfoldNode,
} from "../../lib";

// Every pick event is wired here. Each node and edge carries a `data`
// payload (opaque to the library); the callbacks receive the item with
// that payload echoed back, so a real app can dispatch on it.

// A small fan-out pipeline tree: orchestrator → four stages, each with a
// couple of typed sub-tasks. The `data` payload on each node carries the
// stuff a real app would dispatch on (owner, kind, metadata); the events
// callbacks echo it back so the side panel can render it.

const data: UnfoldData = {
  nodes: [
    { id: "root", label: "orchestrator", data: { kind: "root" } },

    { id: "fetch", label: "fetch", data: { kind: "stage", owner: "alice" } },
    { id: "fetch-http", label: "http", data: { kind: "task", protocol: "http" } },
    { id: "fetch-grpc", label: "grpc", data: { kind: "task", protocol: "grpc" } },

    { id: "parse", label: "parse", data: { kind: "stage", owner: "bob" } },
    { id: "parse-json", label: "json", data: { kind: "task", format: "json" } },
    { id: "parse-csv", label: "csv", data: { kind: "task", format: "csv" } },
    { id: "parse-proto", label: "proto", data: { kind: "task", format: "proto" } },

    { id: "validate", label: "validate", data: { kind: "stage", owner: "carol" } },
    { id: "validate-schema", label: "schema", data: { kind: "task", check: "schema" } },
    { id: "validate-auth", label: "auth", data: { kind: "task", check: "auth" } },

    { id: "store", label: "store", data: { kind: "stage", owner: "dave" } },
    { id: "store-primary", label: "primary", data: { kind: "task", tier: "primary" } },
    { id: "store-replica", label: "replica", data: { kind: "task", tier: "replica" } },
  ],
  edges: [
    { id: "e1", source: "root", target: "fetch", data: { phase: "trigger" } },
    { id: "e2", source: "root", target: "parse", data: { phase: "trigger" } },
    { id: "e3", source: "root", target: "validate", data: { phase: "trigger" } },
    { id: "e4", source: "root", target: "store", data: { phase: "trigger" } },

    { id: "e5", source: "fetch", target: "fetch-http", data: { phase: "fanout" } },
    { id: "e6", source: "fetch", target: "fetch-grpc", data: { phase: "fanout" } },

    { id: "e7", source: "parse", target: "parse-json", data: { phase: "fanout" } },
    { id: "e8", source: "parse", target: "parse-csv", data: { phase: "fanout" } },
    { id: "e9", source: "parse", target: "parse-proto", data: { phase: "fanout" } },

    { id: "e10", source: "validate", target: "validate-schema", data: { phase: "fanout" } },
    { id: "e11", source: "validate", target: "validate-auth", data: { phase: "fanout" } },

    { id: "e12", source: "store", target: "store-primary", data: { phase: "fanout" } },
    { id: "e13", source: "store", target: "store-replica", data: { phase: "fanout" } },
  ],
};

type Pick =
  | { kind: "node"; node: UnfoldNode }
  | { kind: "edge"; edge: UnfoldEdge }
  | { kind: "background" }
  | null;

export function Events() {
  const [hovered, setHovered] = useState<Pick>(null);
  const [clicked, setClicked] = useState<Pick>(null);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <Unfold
        data={data}
        layout="radial"
        onNodeHover={(node) =>
          setHovered(node ? { kind: "node", node } : null)
        }
        onEdgeHover={(edge) =>
          setHovered(edge ? { kind: "edge", edge } : null)
        }
        onNodeClick={(node) => setClicked({ kind: "node", node })}
        onEdgeClick={(edge) => setClicked({ kind: "edge", edge })}
        onBackgroundClick={() => setClicked({ kind: "background" })}
      />
      <Panel>
        <Row label="hover" pick={hovered} />
        <Row label="click" pick={clicked} />
      </Panel>
    </div>
  );
}

function Row({ label, pick }: { label: string; pick: Pick }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ color: "#a89890", marginBottom: 2 }}>{label}</div>
      <div>{describe(pick)}</div>
      {pick && pick.kind !== "background" && payloadOf(pick) != null && (
        <pre style={preStyle}>
          {JSON.stringify(payloadOf(pick), null, 2)}
        </pre>
      )}
    </div>
  );
}

function describe(p: Pick): string {
  if (!p) return "—";
  if (p.kind === "background") return "background";
  if (p.kind === "node") return `node ${p.node.id}`;
  return `edge ${p.edge.source} → ${p.edge.target}`;
}

function payloadOf(p: Exclude<Pick, null | { kind: "background" }>): unknown {
  return p.kind === "node" ? p.node.data : p.edge.data;
}

const preStyle: React.CSSProperties = {
  margin: "4px 0 0",
  padding: "4px 6px",
  background: "rgba(0,0,0,0.3)",
  borderRadius: 3,
  color: "#c0b8b0",
  fontSize: 10,
  whiteSpace: "pre-wrap",
};

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        position: "absolute",
        right: 12,
        top: 12,
        width: 220,
        padding: "10px 12px",
        background: "rgba(20, 10, 14, 0.85)",
        border: "1px solid #3a2030",
        borderRadius: 4,
        color: "#d8d0c8",
        fontFamily: "ui-monospace, monospace",
        fontSize: 11,
        lineHeight: 1.4,
        pointerEvents: "none",
      }}
    >
      {children}
    </div>
  );
}
