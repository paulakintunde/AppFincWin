/**
 * 06.2 D-15: a fill or an entrance runs on the first view in a session only. The record is kept in memory (Claude's
 * discretion in 06.2-CONTEXT), so it lasts one app session: a cold start shows the motion again, a return to the
 * screen in the same session does not.
 */
import { useState } from 'react';

const seen = new Set<string>();

/** True for the first component that asks with this key in this JS session; false for every later mount. */
export function useOncePerSession(key: string): boolean {
  const [first] = useState(() => {
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return first;
}

/** Tests only: forget every key, as if the app had just started. */
export function resetSessionMotion(): void {
  seen.clear();
}
