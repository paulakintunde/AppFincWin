/**
 * 05-15 (UI-SPEC D-56 a11y): the visible verdict card updates on every recompute, but the live-region label only changes
 * after it has stopped changing for `ms`, or at once when the state chip changes. Keeps a screen reader from reading out
 * every keystroke of a price edit.
 */
import { useEffect, useState } from 'react';

export function useSettledLabel(label: string, chip: string, ms: number): string {
  const [prevChip, setPrevChip] = useState(chip);
  const [settled, setSettled] = useState(label);
  if (chip !== prevChip) {
    setPrevChip(chip);
    setSettled(label);
  }
  useEffect(() => {
    const timer = setTimeout(() => setSettled(label), ms);
    return () => clearTimeout(timer);
  }, [label, ms]);
  return settled;
}
