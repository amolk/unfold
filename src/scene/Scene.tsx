import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { OrbitControls } from "@react-three/drei";
import { useControls, button } from "leva";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { ParticleField } from "./ParticleField";
import { Nodes } from "./Nodes";
import { CameraFollow } from "./CameraFollow";
import {
  createExplorer,
  withFocus,
  getVisibleScene,
  type ExplorerState,
  type ExplorerNode,
  type ExplorerEdge,
} from "../explorer/state";
import type { Timeline, TimelineEdge, TimelineNode } from "../timeline/generate";

// --- active-set entries --------------------------------------------------
// "Active" = currently visible OR mid-fade-out. We keep leaving items in the
// scene with target=0 until their fade reaches ~0, then drop them.

interface NodeEntry {
  node: ExplorerNode;
  target: 0 | 1;
  fade: number;
  index: number; // position in nodeFadeArray (= index in timeline.nodes)
}
interface EdgeEntry {
  edge: ExplorerEdge;
  target: 0 | 1;
  fade: number;
  index: number;
}

interface Built {
  timeline: Timeline;
  nodeIds: string[];
  focusIndex: number;
  nodeFadeArray: Float32Array;
  nodeFadeAttribute: THREE.InstancedBufferAttribute;
  edgeFadeArray: Float32Array;
  edgeFadeTexture: THREE.DataTexture;
}

export function Scene() {
  const [{ seed, cameraEase, fadeSpeed }, set] = useControls("Explorer", () => ({
    seed: { value: 7, min: 1, max: 9999, step: 1 },
    regenerate: button(() => set({ seed: Math.floor(Math.random() * 9999) })),
    cameraEase: { value: 0.025, min: 0.005, max: 0.2, step: 0.005, label: "camera ease" },
    fadeSpeed: { value: 2.0, min: 0.3, max: 10, step: 0.1, label: "fade speed" },
  })) as any;

  const [explorer, setExplorer] = useState<ExplorerState>(() => createExplorer({ seed }));

  const activeRef = useRef<{
    nodes: Map<string, NodeEntry>;
    edges: Map<string, EdgeEntry>;
  }>({ nodes: new Map(), edges: new Map() });

  // Bumped when active entries are added or removed, so the timeline + fade
  // buffers are rebuilt. NOT bumped on every fade-value tick — those are
  // mutated through stable refs/typed arrays.
  const [activeKey, setActiveKey] = useState(0);

  // Reset both explorer and active set when seed changes (or regenerate fires).
  useEffect(() => {
    setExplorer(createExplorer({ seed }));
    activeRef.current.nodes.clear();
    activeRef.current.edges.clear();
    setActiveKey((k) => k + 1);
  }, [seed]);

  // Sync active set against the explorer's current visible scene.
  useEffect(() => {
    const vis = getVisibleScene(explorer);
    const visNodeIds = new Set<string>();
    for (const n of vis.pathNodes) visNodeIds.add(n.id);
    for (const n of vis.candidateNodes) visNodeIds.add(n.id);
    const visEdgeIds = new Set<string>();
    for (const e of vis.pathEdges) visEdgeIds.add(e.id);
    for (const e of vis.candidateEdges) visEdgeIds.add(e.id);

    let entriesAdded = false;

    const upsertNode = (n: ExplorerNode) => {
      const existing = activeRef.current.nodes.get(n.id);
      if (existing) {
        existing.target = 1;
        existing.node = n;
      } else {
        activeRef.current.nodes.set(n.id, { node: n, target: 1, fade: 0, index: -1 });
        entriesAdded = true;
      }
    };
    vis.pathNodes.forEach(upsertNode);
    vis.candidateNodes.forEach(upsertNode);
    for (const entry of activeRef.current.nodes.values()) {
      if (!visNodeIds.has(entry.node.id)) entry.target = 0;
    }

    const upsertEdge = (e: ExplorerEdge) => {
      const existing = activeRef.current.edges.get(e.id);
      if (existing) {
        existing.target = 1;
        existing.edge = e;
      } else {
        activeRef.current.edges.set(e.id, { edge: e, target: 1, fade: 0, index: -1 });
        entriesAdded = true;
      }
    };
    vis.pathEdges.forEach(upsertEdge);
    vis.candidateEdges.forEach(upsertEdge);
    for (const entry of activeRef.current.edges.values()) {
      if (!visEdgeIds.has(entry.edge.id)) entry.target = 0;
    }

    if (entriesAdded) setActiveKey((k) => k + 1);
  }, [explorer]);

  // Build the renderable timeline + fade buffers/attributes from the active
  // set. Recomputes on entry add/remove (activeKey) and when the focused id
  // changes (so the focus emphasis tracks). Pure except for assigning .index
  // back onto the entries so useFrame knows where to write each fade.
  const built = useMemo((): Built => {
    const nodeEntries = Array.from(activeRef.current.nodes.values());
    const edgeEntries = Array.from(activeRef.current.edges.values());

    const nodeIndex = new Map<string, number>();
    const tlNodes: TimelineNode[] = nodeEntries.map((entry, i) => {
      entry.index = i;
      nodeIndex.set(entry.node.id, i);
      return {
        id: i,
        position: entry.node.position,
        kind: entry.node.kind,
        depth: entry.node.depth,
      };
    });

    const tlEdges: TimelineEdge[] = edgeEntries.map((entry, i) => {
      entry.index = i;
      const from = nodeIndex.get(entry.edge.fromId) ?? 0;
      const to = nodeIndex.get(entry.edge.toId) ?? 0;
      return {
        id: i,
        from,
        to,
        controls: entry.edge.controls,
        weight: 1.0,
        fromKind: entry.edge.fromKind,
        toKind: entry.edge.toKind,
      };
    });

    // Node fade attribute: one float per node instance, seeded from the
    // entry's current fade value so re-mounts/swaps don't pop.
    const nodeFadeArray = new Float32Array(Math.max(1, nodeEntries.length));
    nodeEntries.forEach((e, i) => {
      nodeFadeArray[i] = e.fade;
    });
    const nodeFadeAttribute = new THREE.InstancedBufferAttribute(nodeFadeArray, 1);
    nodeFadeAttribute.setUsage(THREE.DynamicDrawUsage);

    // Edge fade texture: 1×N RGBA float; R holds the fade.
    const edgeCount = Math.max(1, edgeEntries.length);
    const edgeFadeArray = new Float32Array(edgeCount * 4);
    edgeEntries.forEach((e, i) => {
      edgeFadeArray[i * 4] = e.fade;
      edgeFadeArray[i * 4 + 3] = 1;
    });
    const edgeFadeTexture = new THREE.DataTexture(
      edgeFadeArray,
      1,
      edgeCount,
      THREE.RGBAFormat,
      THREE.FloatType,
    );
    edgeFadeTexture.minFilter = THREE.NearestFilter;
    edgeFadeTexture.magFilter = THREE.NearestFilter;
    edgeFadeTexture.wrapS = THREE.ClampToEdgeWrapping;
    edgeFadeTexture.wrapT = THREE.ClampToEdgeWrapping;
    edgeFadeTexture.needsUpdate = true;

    const nodeIds = nodeEntries.map((e) => e.node.id);
    const focusIndex = nodeIndex.get(explorer.focusId) ?? 0;

    return {
      timeline: { nodes: tlNodes, edges: tlEdges },
      nodeIds,
      focusIndex,
      nodeFadeArray,
      nodeFadeAttribute,
      edgeFadeArray,
      edgeFadeTexture,
    };
  }, [activeKey, explorer.focusId]);

  // Drive the fade animation each frame. Animates entries toward their target
  // and writes values into the typed arrays. When a leaving entry reaches ~0
  // we drop it and bump activeKey so the timeline rebuilds without it.
  const pendingRemoval = useRef(false);
  useFrame((_, dt) => {
    const k = 1 - Math.exp(-dt * fadeSpeed);
    let removed = false;

    activeRef.current.nodes.forEach((entry, id) => {
      entry.fade += (entry.target - entry.fade) * k;
      if (entry.index >= 0 && entry.index < built.nodeFadeArray.length) {
        built.nodeFadeArray[entry.index] = entry.fade;
      }
      if (entry.target === 0 && entry.fade < 0.005) {
        activeRef.current.nodes.delete(id);
        removed = true;
      }
    });
    built.nodeFadeAttribute.needsUpdate = true;

    activeRef.current.edges.forEach((entry, id) => {
      entry.fade += (entry.target - entry.fade) * k;
      if (entry.index >= 0 && entry.index * 4 < built.edgeFadeArray.length) {
        built.edgeFadeArray[entry.index * 4] = entry.fade;
      }
      if (entry.target === 0 && entry.fade < 0.005) {
        activeRef.current.edges.delete(id);
        removed = true;
      }
    });
    built.edgeFadeTexture.needsUpdate = true;

    if (removed && !pendingRemoval.current) {
      pendingRemoval.current = true;
      setActiveKey((k) => k + 1);
    }
  });
  useEffect(() => {
    pendingRemoval.current = false;
  }, [activeKey]);

  const handleSelectNode = useCallback(
    (index: number) => {
      const id = built.nodeIds[index];
      if (!id) return;
      setExplorer((s) => withFocus(s, id));
    },
    [built.nodeIds],
  );

  const focusNode = built.timeline.nodes[built.focusIndex];

  return (
    <>
      <ParticleField timeline={built.timeline} edgeFadeTexture={built.edgeFadeTexture} />
      <Nodes
        timeline={built.timeline}
        focusedIndex={built.focusIndex}
        onSelectNode={handleSelectNode}
        fadeAttribute={built.nodeFadeAttribute}
      />
      {focusNode && <CameraFollow target={focusNode.position} lerp={cameraEase} />}
      <OrbitControls
        enablePan
        enableRotate
        enableZoom
        zoomSpeed={0.8}
        rotateSpeed={0.7}
        panSpeed={0.8}
        minDistance={2}
        maxDistance={60}
        makeDefault
      />
    </>
  );
}
