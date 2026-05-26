import { useCallback, useRef } from "react";
import * as THREE from "three";

/** Easing curve applied to the camera-zoom parameter before lerping between
 *  anchor and target. Must be the same on the way *in* (compute) and the way
 *  *out* (onChange's inverse-lerp) — using different curves was a frequent
 *  source of jumps when the user dragged a slider mid-zoom. */
export type Ease = "linear" | "cubic-easeOut";

export interface ZoomDrivenControl {
  /** Wire as the leva control's `onChange`. Treats a panel drag as a new
   *  zoomed-in anchor: inverse-lerps from the displayed value back to the
   *  anchor at the current zoom, so the change "sticks" at the user's
   *  current camera distance instead of jumping the next frame.
   *
   *  The middle `path` arg is leva's plumbing (the control's full path) and
   *  is ignored here; kept to match leva's onChange signature. */
  onChange: (v: number, path: string, ctx: { fromPanel?: boolean }) => void;
  /** Per-frame: returns `lerp(anchor, target, ease(zoomT.current))`. The
   *  caller is expected to push this to a uniform and (if it moved enough)
   *  back to the leva slider. */
  compute(): number;
}

export interface ZoomDrivenControlOptions {
  /** Shared mutable cell holding the camera-distance lerp parameter in [0,1].
   *  Owner (the parent component) writes it once per frame from the camera
   *  state; all controls sharing the same `zoomT` stay in lockstep. */
  zoomT: { current: number };
  /** Value at zoom-in (t=0). Read ONCE on mount (stored in a useRef) and
   *  thereafter mutated only by panel drags via onChange's inverse-lerp.
   *  Later prop changes are silently ignored. */
  initialAnchor: number;
  /** Value at zoom-out (t=1). */
  target: number;
  ease: Ease;
}

const easeCurve = (t: number, kind: Ease): number => {
  if (kind === "linear") return t;
  // cubic ease-out: drops quickly off the anchor and approaches `target`
  // slowly through the middle/late zoom range.
  const inv = 1 - t;
  return 1 - inv * inv * inv;
};

export function useZoomDrivenControl(opts: ZoomDrivenControlOptions): ZoomDrivenControl {
  const anchor = useRef(opts.initialAnchor);
  const { zoomT, target, ease } = opts;

  const onChange = useCallback(
    (v: number, _path: string, ctx: { fromPanel?: boolean }) => {
      if (!ctx.fromPanel) return;
      const tCurved = easeCurve(zoomT.current, ease);
      // Near full zoom-out the inverse-lerp explodes; fall back to using the
      // value directly as the new anchor. We intentionally do NOT clamp the
      // recovered anchor to the leva slider's [min,max]: a clamp here breaks
      // the round-trip property (drag → recover anchor → recompute = same
      // value) and produces a confusing mid-zoom snap. The trade-off is that
      // a drag near zoom-out can produce an anchor outside the slider band,
      // which means at zoom-in the displayed slider gets pinned at its cap
      // until the user drags it back — acceptable, and self-recoverable.
      anchor.current = tCurved < 0.99 ? (v - target * tCurved) / (1 - tCurved) : v;
    },
    [zoomT, target, ease],
  );

  const compute = useCallback(() => {
    const tCurved = easeCurve(zoomT.current, ease);
    return THREE.MathUtils.lerp(anchor.current, target, tCurved);
  }, [zoomT, target, ease]);

  return { onChange, compute };
}
