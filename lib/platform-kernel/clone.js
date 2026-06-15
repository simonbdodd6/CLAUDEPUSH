// Platform Kernel — structural clone.
//
// The single deep-clone used across the platform. This exact implementation was
// duplicated ~28 times; centralising it changes no behaviour.

export function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

export const deepClone = clone;
