import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { TimelineEngine } from "./timeline-engine";
import type { ResolvedStyle, ResolvedTheme } from "./defaults";
import type { UnfoldData, UnfoldLayout } from "../types";
import type { Timeline } from "./timeline";
import type { MirroredAttribute, MirroredTexture } from "./gpu-mirror";
import type { NodeBulgeData } from "./scene-projection";

export interface UseTimelineEngineArgs {
  data: UnfoldData;
  layout: UnfoldLayout;
  theme: ResolvedTheme;
  style: ResolvedStyle;
  /** "" === no focus (Scene's existing sentinel convention). */
  focusId: string;
}

/** Exactly what Scene's children bind to. */
export interface TimelineEngineHandle {
  timeline: Timeline;
  nodeIds: string[];
  edgeIds: string[];
  focusIndex: number;
  nodeFade: MirroredAttribute;
  edgeFade: MirroredTexture;
  nodeBulge: NodeBulgeData;
}

/** Thin React skin over the headless TimelineEngine. The only file in the
 *  pipeline that imports React + fiber: it owns construction, disposal, the
 *  topology clock (a render-time memo, mirroring Scene's prior build memo),
 *  and the per-frame clock (useFrame). All engine logic stays testable
 *  without React. */
export function useTimelineEngine({
  data,
  layout,
  theme,
  style,
  focusId,
}: UseTimelineEngineArgs): TimelineEngineHandle {
  const engine = useMemo(() => new TimelineEngine(), []);
  useEffect(() => () => engine.dispose(), [engine]);

  // Topology clock. Keyed on the same identities Scene used for normalizeData,
  // so the engine rebuilds on exactly the same changes (data/layout/theme).
  const snapshot = useMemo(
    () => engine.update({ data, layout, theme }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      engine,
      data,
      layout,
      theme.defaultEdgeFlow,
      theme.categories,
      theme.defaultNodeColor,
    ],
  );

  // Per-frame clock. focusId "" → null so the bulge writer reads no emphasis.
  useFrame((_, dt) => {
    engine.frame({
      focusId: focusId ? focusId : null,
      dt,
      fadeSpeed: style.fade.speed,
    });
  });

  const focusIndex = useMemo(
    () => engine.focusIndex(focusId),
    [engine, snapshot, focusId],
  );

  return {
    timeline: snapshot.built.timeline,
    nodeIds: snapshot.built.nodeIds,
    edgeIds: snapshot.built.edgeIds,
    focusIndex,
    nodeFade: engine.nodeFade,
    edgeFade: engine.edgeFade,
    nodeBulge: engine.nodeBulge,
  };
}
