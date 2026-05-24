import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

interface CameraFollowProps {
  target: THREE.Vector3;
  /** 0–1 per-frame lerp factor; higher = snappier. */
  lerp?: number;
}

/** Smoothly drives the active OrbitControls' target toward `target`. The
 *  camera position trails along (OrbitControls keeps the orbit offset), so the
 *  user's chosen angle and zoom are preserved across focus changes. */
export function CameraFollow({ target, lerp = 0.08 }: CameraFollowProps) {
  const controls = useThree((s) => s.controls) as
    | (THREE.EventDispatcher & {
        target: THREE.Vector3;
        update: () => void;
      })
    | null;
  const desired = useRef(target.clone());

  useEffect(() => {
    desired.current.copy(target);
  }, [target]);

  useFrame(() => {
    if (!controls) return;
    if (controls.target.distanceToSquared(desired.current) < 1e-8) return;
    controls.target.lerp(desired.current, lerp);
    controls.update();
  });

  return null;
}
