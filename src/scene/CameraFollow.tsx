import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

interface CameraFollowProps {
  target: THREE.Vector3;
  /** 0–1 per-frame lerp factor; higher = snappier. */
  lerp?: number;
}

/** Smoothly drives the active OrbitControls' target toward `target` after a
 *  focus change. The camera position trails along (OrbitControls keeps the
 *  orbit offset), so the user's chosen angle and zoom are preserved.
 *
 *  The animation latches on two conditions:
 *    1. We've reached the desired target (natural convergence), or
 *    2. The user grabbed OrbitControls — any orbit/pan/zoom interaction
 *       cancels the follow so we don't fight the user (e.g. zoom-to-cursor
 *       should leave the cursor where it is, not snap back to focus).
 *  The latch is cleared each time `target` changes — a new focus re-arms. */
export function CameraFollow({ target, lerp = 0.08 }: CameraFollowProps) {
  const controls = useThree((s) => s.controls) as
    | (THREE.EventDispatcher & {
        target: THREE.Vector3;
        update: () => void;
        addEventListener: (type: string, listener: () => void) => void;
        removeEventListener: (type: string, listener: () => void) => void;
      })
    | null;
  const desired = useRef(target.clone());
  const latched = useRef(false);

  useEffect(() => {
    desired.current.copy(target);
    latched.current = false;
  }, [target]);

  useEffect(() => {
    if (!controls) return;
    const onStart = () => {
      latched.current = true;
    };
    controls.addEventListener("start", onStart);
    return () => controls.removeEventListener("start", onStart);
  }, [controls]);

  useFrame(() => {
    if (!controls || latched.current) return;
    if (controls.target.distanceToSquared(desired.current) < 1e-6) {
      latched.current = true;
      return;
    }
    controls.target.lerp(desired.current, lerp);
    controls.update();
  });

  return null;
}
