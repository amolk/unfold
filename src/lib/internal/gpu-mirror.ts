import * as THREE from "three";

/** A Float32Array paired with the GPU object that mirrors it. Mutate `data`
 *  in place each frame, then call `markDirty()` so Three.js re-uploads.
 *
 *  Solves the recurring "mutable typed-array + DataTexture (or
 *  InstancedBufferAttribute) + remember to set needsUpdate" pattern that
 *  used to be re-implemented for `nodeBulge`, `edgeFadeTexture`, and
 *  `nodeFadeAttribute`. Producer (the simulation) writes into `data`;
 *  consumer (the shader) reads through `texture` / `attribute`. The
 *  shared-memory contract is now one named thing instead of three
 *  JSDoc-paragraph footguns.
 *
 *  `texture`/`attribute` are `readonly` so a field reassign can't silently
 *  desync `markDirty()` (which closes over the original reference). */
export interface MirroredTexture {
  readonly data: Float32Array;
  readonly texture: THREE.DataTexture;
  markDirty(): void;
  /** Release the underlying GPU buffer. Call before dropping the reference
   *  — re-allocating mirrors per topology change without dispose() leaks
   *  GPU memory steadily. */
  dispose(): void;
}

export interface MirroredAttribute {
  readonly data: Float32Array;
  readonly attribute: THREE.InstancedBufferAttribute;
  markDirty(): void;
  /** Symmetric with MirroredTexture.dispose(). InstancedBufferAttribute has
   *  no GPU-side dispose of its own (the GL buffer lives on the parent
   *  BufferGeometry); this is a no-op kept for interface parity so callers
   *  can release both mirror kinds uniformly. */
  dispose(): void;
}

/** Single-column RGBA float DataTexture of size 1×`height`. Nearest filtering
 *  + clamp-to-edge — appropriate for index-as-row sampling. `height` is
 *  clamped to at least 1 (a 1×0 texture would be invalid). */
export function createMirroredTexture(height: number): MirroredTexture {
  const h = Math.max(1, height);
  const data = new Float32Array(h * 4);
  const texture = new THREE.DataTexture(
    data,
    1,
    h,
    THREE.RGBAFormat,
    THREE.FloatType,
  );
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return {
    data,
    texture,
    markDirty() {
      texture.needsUpdate = true;
    },
    dispose() {
      texture.dispose();
    },
  };
}

/** Dynamic-draw InstancedBufferAttribute with `itemSize` floats per instance.
 *  `length` is the instance count (NOT the Float32Array length). */
export function createMirroredAttribute(
  length: number,
  itemSize: number,
): MirroredAttribute {
  const data = new Float32Array(Math.max(1, length) * itemSize);
  const attribute = new THREE.InstancedBufferAttribute(data, itemSize);
  attribute.setUsage(THREE.DynamicDrawUsage);
  return {
    data,
    attribute,
    markDirty() {
      attribute.needsUpdate = true;
    },
    dispose() {
      // Intentional no-op; see interface JSDoc.
    },
  };
}
