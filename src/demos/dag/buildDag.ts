import type { UnfoldData, UnfoldEdge, UnfoldNode } from "../../lib";

// Deterministic PRNG so a seed reproduces the same DAG.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Build a layered DAG topology only — no positions. Each non-source node
 *  takes 1–3 parents from the previous one or two depth-bands, which makes
 *  the result a DAG and not a tree. The library's `hierarchical` layout
 *  decides where everything ends up. */
export function buildDag(
  seed: number,
  layers = 6,
  width = 6,
): UnfoldData {
  const rng = mulberry32(seed);
  const nodes: UnfoldNode[] = [];
  const edges: UnfoldEdge[] = [];
  const bands: string[][] = [];

  for (let li = 0; li < layers; li++) {
    // First and last bands are narrower for a pinched silhouette.
    const w =
      li === 0 || li === layers - 1
        ? Math.max(1, Math.round(width / 3))
        : width;
    const ids: string[] = [];
    for (let i = 0; i < w; i++) {
      const id = `n${li}-${i}`;
      nodes.push({ id });
      ids.push(id);
    }
    bands.push(ids);
  }

  for (let li = 1; li < layers; li++) {
    for (const id of bands[li]) {
      const prevBand = bands[li - 1];
      const grandBand = li >= 2 ? bands[li - 2] : null;
      const parentCount = 1 + Math.floor(rng() * 3);

      const picks = new Set<string>();
      for (let k = 0; k < parentCount; k++) {
        const pool =
          grandBand && rng() < 0.2 ? grandBand : prevBand;
        picks.add(pool[Math.floor(rng() * pool.length)]);
      }
      for (const parentId of picks) {
        edges.push({
          id: `${parentId}->${id}`,
          source: parentId,
          target: id,
        });
      }
    }
  }

  return { nodes, edges };
}
