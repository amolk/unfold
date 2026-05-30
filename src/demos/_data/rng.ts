// Deterministic PRNG shared by the demo data generators (buildDag, buildDemoData).
// A given seed always reproduces the same stream — the property the demos'
// "reseed" buttons and the unit tests both rely on.
//
// Intentionally demo-side (not src/lib/internal): these are demo-data helpers
// with no runtime role in <Unfold>; the library must not depend on them.

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a string hash → uint32. Lets a node id seed its own sub-stream so a
 *  subtree is reproducible independent of sibling order. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
