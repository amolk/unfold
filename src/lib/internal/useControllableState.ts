import { useCallback, useRef, useState } from "react";

// A controlled/uncontrolled-dual hook in the RadixUI / React-Aria mold.
// If `value` is provided (defined or null/empty), the prop owns the state and
// the hook just forwards it; the setter only fires the `onChange` callback.
// If `value` is undefined, the hook owns the state internally; the setter
// updates internal state and ALSO fires `onChange` for observability — so the
// caller can log / mirror without owning the truth.
//
// Matches the React idiom for `<input value>` (controlled) vs
// `<input defaultValue>` (uncontrolled) — except we accept a real undefined
// to mean "uncontrolled" rather than requiring a separate `defaultValue`
// prop. That's intentional: the public Unfold props don't expose default*
// variants and the design doc explicitly committed to per-field dual mode
// with a single `value`-style prop.

export function useControllableState<T>(opts: {
  /** Controlled value. `undefined` = caller is NOT controlling this field;
   *  the hook owns internal state. Any other value (including null / [])
   *  means controlled. */
  value: T | undefined;
  /** Fallback used as the internal initial state when `value` is undefined. */
  defaultValue: T;
  /** Always fired on a setter call. Lets uncontrolled callers observe
   *  changes for logging / analytics. */
  onChange?: (next: T) => void;
}): [T, (next: T) => void] {
  const { value, defaultValue, onChange } = opts;
  const [internal, setInternal] = useState<T>(defaultValue);
  // Track the latest onChange in a ref so the returned setter has a stable
  // identity across renders (matching useEvent semantics). Without this, a
  // parent that re-creates its callback on every render would invalidate
  // every effect downstream that lists the setter as a dep.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const isControlled = value !== undefined;
  const current = isControlled ? (value as T) : internal;

  const set = useCallback(
    (next: T) => {
      if (!isControlled) setInternal(next);
      onChangeRef.current?.(next);
    },
    [isControlled],
  );

  return [current, set];
}
