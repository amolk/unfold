import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { OrbitControls } from "@react-three/drei";
import { useControls, button, levaStore } from "leva";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { ParticleField, type NodeBulgeData } from "./ParticleField";
import { Nodes } from "./Nodes";

// Hard cap for the shader's bulge loop and the height of the node-data
// textures. The shader still early-exits at uNodeCount, so cost scales with
// the actual active node count, not this number. Picked large enough that any
// realistic tree fits without re-allocating.
const NODE_TEX_HEIGHT = 4096;
import { CameraFollow } from "./CameraFollow";
import {
  createExplorer,
  withFocus,
  toggleExpanded,
  getVisibleScene,
  STUB_FROM_ID,
  type ExplorerState,
  type ExplorerNode,
  type ExplorerEdge,
  type ExplorerMode,
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
  const [
    { mode, seed, cameraEase, fadeSpeed, sphereOpacity, stableNodeColor, crisisNodeColor },
    set,
  ] = useControls("Explorer", () => ({
      mode: {
        value: "single-path" as ExplorerMode,
        options: {
          "single path": "single-path",
          "toggle expand": "toggle",
          "full tree": "full-tree",
        },
        label: "mode",
      },
      seed: { value: 7, min: 1, max: 9999, step: 1 },
      regenerate: button(() => set({ seed: Math.floor(Math.random() * 9999) })),
      "copy settings": button(() => {
        // Dump every current value across all folders to clipboard as JSON.
        // Paste it back into chat to have me apply the changes as new defaults.
        const data = levaStore.getData() as Record<string, any>;
        const flat: Record<string, unknown> = {};
        for (const [key, entry] of Object.entries(data)) {
          if (entry && "value" in entry && typeof entry.value !== "function") {
            flat[key] = entry.value;
          }
        }
        const json = JSON.stringify(flat, null, 2);
        navigator.clipboard?.writeText(json).catch(() => {});
        // Also log so the user has a fallback if clipboard write fails.
        // eslint-disable-next-line no-console
        console.log("[unfold settings]\n" + json);
      }),
      cameraEase: { value: 0.005, min: 0.005, max: 0.2, step: 0.005, label: "camera ease" },
      fadeSpeed: { value: 2.0, min: 0.3, max: 10, step: 0.1, label: "fade speed" },
      sphereOpacity: {
        value: 0,
        min: 0,
        max: 1,
        step: 0.01,
        label: "show spheres",
      },
      stableNodeColor: { value: "#a8c8b3", label: "node stable" },
      crisisNodeColor: { value: "#e0a050", label: "node crisis" },
    })) as any;

  const [explorer, setExplorer] = useState<ExplorerState>(() => createExplorer({ seed, mode }));
  // CameraFollow fights OrbitControls panning by yanking the target back to
  // the focus. Until the user has actually selected something, leave the
  // camera entirely to them — first click arms the follower.
  const [followArmed, setFollowArmed] = useState(false);

  const activeRef = useRef<{
    nodes: Map<string, NodeEntry>;
    edges: Map<string, EdgeEntry>;
  }>({ nodes: new Map(), edges: new Map() });

  // Node-bulge data: stable references repopulated each frame from the active
  // set. The Float32Arrays are mutated in place; the DataTextures wrap them
  // and just need `needsUpdate = true` after each write. We use textures
  // (instead of uniform arrays) because uniform-array data is bounded by
  // MAX_VERTEX_UNIFORM_VECTORS, which caps us at a few hundred nodes on many
  // GPUs — texture data has no such cap.
  const nodeBulge = useMemo<NodeBulgeData>(() => {
    const posFade = new Float32Array(NODE_TEX_HEIGHT * 4);
    const colorEmph = new Float32Array(NODE_TEX_HEIGHT * 4);
    const makeTex = (data: Float32Array<ArrayBuffer>) => {
      const t = new THREE.DataTexture(
        data,
        1,
        NODE_TEX_HEIGHT,
        THREE.RGBAFormat,
        THREE.FloatType,
      );
      t.minFilter = THREE.NearestFilter;
      t.magFilter = THREE.NearestFilter;
      t.wrapS = THREE.ClampToEdgeWrapping;
      t.wrapT = THREE.ClampToEdgeWrapping;
      t.needsUpdate = true;
      return t;
    };
    return {
      posFade,
      colorEmph,
      posFadeTex: makeTex(posFade),
      colorEmphTex: makeTex(colorEmph),
      count: { value: 0 },
      texHeight: NODE_TEX_HEIGHT,
    };
  }, []);
  const stableColor3 = useMemo(() => new THREE.Color(), []);
  const crisisColor3 = useMemo(() => new THREE.Color(), []);
  useEffect(() => {
    stableColor3.set(stableNodeColor);
    crisisColor3.set(crisisNodeColor);
  }, [stableColor3, crisisColor3, stableNodeColor, crisisNodeColor]);

  // Bumped when active entries are added or removed, so the timeline + fade
  // buffers are rebuilt. NOT bumped on every fade-value tick — those are
  // mutated through stable refs/typed arrays.
  const [activeKey, setActiveKey] = useState(0);

  // Reset both explorer and active set when seed or mode changes. Mode swaps
  // need a fresh state because full-tree pre-generates the whole tree at
  // create time, and toggle/single-path start with the user driving expansion.
  useEffect(() => {
    setExplorer(createExplorer({ seed, mode }));
    activeRef.current.nodes.clear();
    activeRef.current.edges.clear();
    setActiveKey((k) => k + 1);
    setFollowArmed(false);
  }, [seed, mode]);

  // Sync active set against the explorer's current visible scene.
  useEffect(() => {
    const vis = getVisibleScene(explorer);
    const visNodeIds = new Set<string>();
    for (const n of vis.pathNodes) visNodeIds.add(n.id);
    for (const n of vis.candidateNodes) visNodeIds.add(n.id);
    const visEdgeIds = new Set<string>();
    for (const e of vis.pathEdges) visEdgeIds.add(e.id);
    for (const e of vis.candidateEdges) visEdgeIds.add(e.id);

    let topologyChanged = false;

    // Prune entries that finished fading out during a previous transition.
    // Doing this here (a sync triggered by user navigation) instead of in
    // useFrame means the rebuild is paid at click time — when the user expects
    // motion — rather than as a sudden particle re-shuffle at the moment a
    // fade-out happens to finish.
    for (const [id, entry] of activeRef.current.nodes) {
      if (entry.target === 0 && entry.fade < 0.005) {
        activeRef.current.nodes.delete(id);
        topologyChanged = true;
      }
    }
    for (const [id, entry] of activeRef.current.edges) {
      if (entry.target === 0 && entry.fade < 0.005) {
        activeRef.current.edges.delete(id);
        topologyChanged = true;
      }
    }

    const upsertNode = (n: ExplorerNode) => {
      const existing = activeRef.current.nodes.get(n.id);
      if (existing) {
        existing.target = 1;
        existing.node = n;
      } else {
        activeRef.current.nodes.set(n.id, { node: n, target: 1, fade: 0, index: -1 });
        topologyChanged = true;
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
        topologyChanged = true;
      }
    };
    vis.pathEdges.forEach(upsertEdge);
    vis.candidateEdges.forEach(upsertEdge);
    for (const entry of activeRef.current.edges.values()) {
      if (!visEdgeIds.has(entry.edge.id)) entry.target = 0;
    }

    if (topologyChanged) setActiveKey((k) => k + 1);
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

    // Edge fade texture: 1×N RGBA float.
    //   R = current per-edge fade (mutated each frame).
    //   G = entry-ramp flag (1 = particle alpha ramps in along the curve from
    //       life=0 → life≈0.6, used by the root's incoming stub so its
    //       upstream end dissolves into the background).
    const edgeCount = Math.max(1, edgeEntries.length);
    const edgeFadeArray = new Float32Array(edgeCount * 4);
    edgeEntries.forEach((e, i) => {
      edgeFadeArray[i * 4] = e.fade;
      edgeFadeArray[i * 4 + 1] = e.edge.fromId === STUB_FROM_ID ? 1 : 0;
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
  // and writes values into the typed arrays.
  //
  // Faded-out entries (target=0, fade≈0) are intentionally NOT deleted here:
  // dropping them would force a Built+geometry rebuild mid-flight, which
  // visibly re-shuffles every particle's random phase and redistributes the
  // per-edge particle share — a sharp pop at the moment the fade-out finishes.
  // Instead they linger invisibly (fade is exponentially close to 0, drop
  // threshold culls every particle) and the next sync (on the user's next
  // click) prunes them, so the rebuild happens during a transition the user
  // already expects to see motion in.
  useFrame((_, dt) => {
    const k = 1 - Math.exp(-dt * fadeSpeed);

    activeRef.current.nodes.forEach((entry) => {
      entry.fade += (entry.target - entry.fade) * k;
      if (entry.index >= 0 && entry.index < built.nodeFadeArray.length) {
        built.nodeFadeArray[entry.index] = entry.fade;
      }
    });
    built.nodeFadeAttribute.needsUpdate = true;

    activeRef.current.edges.forEach((entry) => {
      entry.fade += (entry.target - entry.fade) * k;
      if (entry.index >= 0 && entry.index * 4 < built.edgeFadeArray.length) {
        built.edgeFadeArray[entry.index * 4] = entry.fade;
      }
    });
    built.edgeFadeTexture.needsUpdate = true;

    // Repopulate the bulge data textures for the shader. We push position,
    // fade, color and a 0/1 focus emphasis flag for each active node. Skip
    // lingering dead entries so they don't consume one of the NODE_TEX_HEIGHT
    // slots.
    const focusId = explorer.focusId;
    let bi = 0;
    for (const entry of activeRef.current.nodes.values()) {
      if (bi >= NODE_TEX_HEIGHT) break;
      if (entry.fade < 0.005) continue;
      const p4 = bi * 4;
      const c = entry.node.kind === "crisis" ? crisisColor3 : stableColor3;
      nodeBulge.posFade[p4 + 0] = entry.node.position.x;
      nodeBulge.posFade[p4 + 1] = entry.node.position.y;
      nodeBulge.posFade[p4 + 2] = entry.node.position.z;
      nodeBulge.posFade[p4 + 3] = entry.fade;
      nodeBulge.colorEmph[p4 + 0] = c.r;
      nodeBulge.colorEmph[p4 + 1] = c.g;
      nodeBulge.colorEmph[p4 + 2] = c.b;
      nodeBulge.colorEmph[p4 + 3] = entry.node.id === focusId ? 1 : 0;
      bi++;
    }
    nodeBulge.count.value = bi;
    nodeBulge.posFadeTex.needsUpdate = true;
    nodeBulge.colorEmphTex.needsUpdate = true;
  });

  const handleSelectNode = useCallback(
    (index: number) => {
      const id = built.nodeIds[index];
      if (!id) return;
      setExplorer((s) => {
        switch (s.mode) {
          case "single-path":
            return withFocus(s, id);
          case "toggle":
            return toggleExpanded(s, id);
          case "full-tree":
            // Tree is fully expanded; click only updates focus for the camera.
            return s.focusId === id ? s : { ...s, focusId: id };
        }
      });
      setFollowArmed(true);
    },
    [built.nodeIds],
  );

  const focusNode = built.timeline.nodes[built.focusIndex];

  return (
    <>
      <ParticleField
        timeline={built.timeline}
        edgeFadeTexture={built.edgeFadeTexture}
        nodeBulge={nodeBulge}
      />
      <Nodes
        timeline={built.timeline}
        focusedIndex={built.focusIndex}
        onSelectNode={handleSelectNode}
        fadeAttribute={built.nodeFadeAttribute}
        sphereOpacity={sphereOpacity}
      />
      {followArmed && focusNode && (
        <CameraFollow target={focusNode.position} lerp={cameraEase} />
      )}
      <OrbitControls
        enablePan
        enableRotate
        enableZoom
        zoomToCursor
        zoomSpeed={0.8}
        rotateSpeed={0.7}
        panSpeed={0.8}
        minDistance={2}
        maxDistance={60}
        // Tilt the lookat above the world origin so the root (at 0,0,0) lands
        // ~20% from the bottom of the viewport on first paint, leaving room
        // above it for branches to grow into. Camera position is unchanged
        // (App sets it to (0, 1.2, 9)); only the target moves.
        target={[0, 1.8, 0]}
        makeDefault
      />
    </>
  );
}
