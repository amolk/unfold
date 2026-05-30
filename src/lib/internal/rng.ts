// Injectable RNG seam. `Rng` is the contract of both Math.random and the
// mulberry32 closure: a zero-arg function returning a float in [0, 1).
// Production passes Math.random (the default); tests pass a seeded mulberry32
// for deterministic, assertable output.
export type Rng = () => number;

/** Deterministic PRNG — a given seed reproduces the same stream. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
