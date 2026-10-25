/**
 * 05-30 (05 D-56): a value that follows its input 150 ms after the input stops changing. It starts equal to the input on
 * the first render, and its timer is cleared on every change and on unmount, so nothing fires after the screen is gone.
 */
import { useEffect, useState } from 'react';

export const DETAILS_DEBOUNCE_MS = 150;

export function useDebouncedValue<T>(value: T, ms: number = DETAILS_DEBOUNCE_MS): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return settled;
}
