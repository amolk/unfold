import { useThree } from "@react-three/fiber";
import * as THREE from "three";

/** Narrowed view of the OrbitControls object stashed on r3f's `state.controls`.
 *  drei exposes the full OrbitControls class but we only touch a few members,
 *  and r3f types `state.controls` as `EventDispatcher | null`, so consumers
 *  have to narrow on every read site. One accessor, one cast. */
export type OrbitControlsLike = THREE.EventDispatcher & {
  target: THREE.Vector3;
  update: () => void;
  addEventListener: (type: string, listener: () => void) => void;
  removeEventListener: (type: string, listener: () => void) => void;
};

/** Returns the active OrbitControls (or `null` until drei mounts them).
 *  Only the members listed in {@link OrbitControlsLike} are surfaced. */
export function useOrbitControls(): OrbitControlsLike | null {
  return useThree((s) => s.controls) as OrbitControlsLike | null;
}
