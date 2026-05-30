import { useRef } from "react";

// Encapsulates the "suppress stale pointerOut" pattern shared by Nodes and
// EdgePicker. R3F fires onPointerOut on the leaving target BEFORE onPointerOver
// on the entering one within a frame; a stale out from an already-left target
// must not stomp a valid concurrent hover. Also owns the body-cursor toggle
// both pickers duplicated. Generic over the key type (instanceId / edge index;
// both number today) to keep it identity-agnostic.
export function useHoverSuppression<K>(
  onHover: ((key: K | null, event: PointerEvent) => void) | undefined,
) {
  const hoveredRef = useRef<K | null>(null);

  // Cursor is set unconditionally (a component only attaches enter/leave when
  // its mesh is interactive); onHover fires only when supplied. This matches
  // the originals: Nodes set the pointer cursor whenever the node was
  // clickable-or-hoverable, while EdgePicker only attached these handlers when
  // onEdgeHover existed.

  /** Call from onPointerOver once the target key is known. */
  const enter = (key: K, event: PointerEvent) => {
    hoveredRef.current = key;
    document.body.style.cursor = "pointer";
    onHover?.(key, event);
  };

  /** Call from onPointerOut. No-ops unless this is the most-recent enter, so a
   *  stale out during a fast drag can't stomp a valid concurrent hover. */
  const leave = (key: K, event: PointerEvent) => {
    if (hoveredRef.current !== key) return;
    hoveredRef.current = null;
    document.body.style.cursor = "";
    onHover?.(null, event);
  };

  return { enter, leave };
}
