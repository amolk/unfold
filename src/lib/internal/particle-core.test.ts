import { describe, it, expect } from "vitest";
import * as THREE from "three";
import {
  buildParticleAttributes,
  buildCurveTexture,
  buildEdgeColorTexture,
} from "./particle-core";
import { mulberry32 } from "./rng";
import type { Timeline, TimelineEdge } from "./timeline";

// Seeded, headless tests of the distribution algorithm + texture builders.
// Each encodes WHY the invariant matters; a fixed seed makes the RNG-driven
// output reproducible (which is also the contract real rebuilds rely on).

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const edge = (
  id: number,
  weight: number,
  proportions: number[],
  colors: string[] = proportions.map(() => "#ffffff"),
): TimelineEdge => ({
  id,
  from: 0,
  to: 1,
  controls: [v(0, 0, 0), v(1, 0, 0), v(2, 0, 0), v(3, 0, 0)],
  weight,
  colors,
  proportions,
  speedMultiplier: 1,
});
const timeline = (edges: TimelineEdge[]): Timeline => ({ nodes: [], edges });

describe("buildParticleAttributes", () => {
  it("(a) distributes particles proportional to edge weight", () => {
    // WHY: trunk edges (higher weight) must read as denser than fine branches.
    const tl = timeline([edge(0, 3, [1]), edge(1, 1, [1])]); // 3:1
    const a = buildParticleAttributes(tl, { particleCount: 4000, streamsPerEdge: 30 }, mulberry32(42));
    let heavy = 0;
    for (let i = 0; i < 4000; i++) if (a.curveIndex[i] === 0) heavy++;
    const light = 4000 - heavy;
    expect(heavy / light).toBeGreaterThan(2.7);
    expect(heavy / light).toBeLessThan(3.3);
  });

  it("(b) samples colorIndex from the edge's proportions (CDF)", () => {
    // WHY: the declared color mix must appear at the requested ratio.
    const tl = timeline([edge(0, 1, [0.2, 0.3, 0.5])]);
    const N = 20000;
    const a = buildParticleAttributes(tl, { particleCount: N, streamsPerEdge: 1 }, mulberry32(7));
    const hist = [0, 0, 0];
    for (let i = 0; i < N; i++) hist[a.colorIndex[i]]++;
    expect(hist[0] / N).toBeCloseTo(0.2, 1);
    expect(hist[1] / N).toBeCloseTo(0.3, 1);
    expect(hist[2] / N).toBeCloseTo(0.5, 1);
  });

  it("(c) shares one radial anchor across each stream", () => {
    // WHY: a stream is one filament; if its particles didn't share a cross-
    // section anchor the wisp would visually fan apart.
    const tl = timeline([edge(0, 1, [1])]);
    const a = buildParticleAttributes(tl, { particleCount: 5000, streamsPerEdge: 10 }, mulberry32(99));
    const angleByStream = new Map<number, number>();
    for (let i = 0; i < 5000; i++) {
      const sid = a.streamId[i];
      if (!angleByStream.has(sid)) angleByStream.set(sid, a.radialAngle[i]);
      expect(a.radialAngle[i]).toBe(angleByStream.get(sid));
    }
    expect(angleByStream.size).toBeGreaterThan(1);
  });

  it("(d) tail-fills every slot and is deterministic under a seed", () => {
    // WHY: rounding can leave Σ round(share) < count; unfilled slots (speed 0)
    // would render as dead particles. Determinism = reproducible rebuilds.
    const tl = timeline([edge(0, 1, [1]), edge(1, 1, [1]), edge(2, 1, [1])]);
    const opts = { particleCount: 1000, streamsPerEdge: 5 };
    const a = buildParticleAttributes(tl, opts, mulberry32(3));
    for (let i = 0; i < 1000; i++) expect(a.speed[i]).toBeGreaterThan(0);
    const b = buildParticleAttributes(tl, opts, mulberry32(3));
    expect(Array.from(a.curveIndex)).toEqual(Array.from(b.curveIndex));
    expect(Array.from(a.colorIndex)).toEqual(Array.from(b.colorIndex));
  });
});

describe("texture builders", () => {
  it("buildCurveTexture: dims + endpoint samples match the bezier ends", () => {
    const tl = timeline([edge(0, 1, [1]), edge(1, 1, [1])]);
    const p = buildCurveTexture(tl, 64);
    expect(p.width).toBe(64);
    expect(p.height).toBe(2);
    expect(p.data.length).toBe(64 * 2 * 4);
    // row 0, col 0 (t=0) = controls[0] = (0,0,0); last col (t=1) = controls[3] = (3,0,0).
    expect([p.data[0], p.data[1], p.data[2]]).toEqual([0, 0, 0]);
    const last = (63) * 4;
    expect([p.data[last], p.data[last + 1], p.data[last + 2]]).toEqual([3, 0, 0]);
  });

  it("buildEdgeColorTexture: repeats slot 0 into empty slots; floors height at 1", () => {
    const p = buildEdgeColorTexture(timeline([edge(0, 1, [1], ["#ff0000"])]));
    expect(p.width).toBe(8);
    expect(p.height).toBe(1);
    expect([p.data[0], p.data[1], p.data[2]]).toEqual([1, 0, 0]); // slot 0 = red
    expect([p.data[4], p.data[5], p.data[6]]).toEqual([1, 0, 0]); // slot 1 repeats red
    // empty timeline still yields a valid 1-row texture.
    const empty = buildEdgeColorTexture(timeline([]));
    expect(empty.height).toBe(1);
    expect(empty.data.length).toBe(8 * 1 * 4);
  });
});
