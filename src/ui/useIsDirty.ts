/**
 * D-26: each edit sheet compares its current field values with the values it opened with;
 * cheap structural equality, no library.
 */
import { useMemo } from 'react';

export function isStructurallyEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  const aIsArray = Array.isArray(a);
  if (aIsArray !== Array.isArray(b)) return false;
  if (aIsArray) {
    const aArr = a as unknown[];
    const bArr = b as unknown[];
    return aArr.length === bArr.length && aArr.every((v, i) => isStructurallyEqual(v, bArr[i]));
  }
  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;
  const aKeys = Object.keys(aObj);
  if (aKeys.length !== Object.keys(bObj).length) return false;
  return aKeys.every((k) => Object.prototype.hasOwnProperty.call(bObj, k) && isStructurallyEqual(aObj[k], bObj[k]));
}

export function useIsDirty<T>(initial: T, current: T): boolean {
  return useMemo(() => !isStructurallyEqual(initial, current), [initial, current]);
}
