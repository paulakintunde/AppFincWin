/**
 * A read-only region (Decide's decided checks, review WR-C06). `pointerEvents="none"` only stops touch: screen readers
 * still announce the controls as active and can activate them. Controls inside a read-only scope report themselves
 * disabled and ignore presses, while their labels and values stay readable.
 */
import { createContext, useContext } from 'react';

export const ReadOnlyScope = createContext(false);

/** True inside a read-only region: the control is shown, announced as disabled, and does nothing when activated. */
export function useReadOnlyScope(): boolean {
  return useContext(ReadOnlyScope);
}
