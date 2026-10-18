import type { StateIntervals } from "./native";

// Archive DTOs contain only plain JSON values. Interval tails can change without new samples.
function sameJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((value, i) => sameJson(value, b[i]));
  }
  const left = a as Record<string, unknown>, right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every(key => Object.hasOwn(right, key) && sameJson(left[key], right[key]));
}

/** Reuse unchanged snapshots so empty polls don't rebuild the full day's Capture and indexes. */
export function retainIntervals(previous: StateIntervals | undefined, next: StateIntervals | undefined) {
  return sameJson(previous, next) ? previous : next;
}
