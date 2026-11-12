// 06-13: the typed calculators' input plumbing. Results follow the typed text 150 ms after the last keystroke (D-21).
// Amount fields are parsed by the app's amount parser inside MoneyInput; this hook only holds the state and the delay.
// It never writes to the query cache, storage or the network: nothing typed in a calculator is saved.
import { useEffect, useState } from 'react';

export const CALC_DEBOUNCE_MS = 150;

/** The value after it has held still for `delay` ms. The first render returns the value at once. */
export function useDebounced<T>(value: T, delay: number = CALC_DEBOUNCE_MS): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return settled;
}

/** A typed whole number: digits only. Null when blank or not a whole number. */
export function wholeFromText(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d{1,6}$/.test(trimmed)) return null;
  return Number(trimmed);
}

/** The first day of the month after `today` (YYYY-MM-DD): the date of the first deposit or payment in the next-month rule. */
export function firstOfNextMonth(today: string): string {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  return `${String(nextYear).padStart(4, '0')}-${String(nextMonth).padStart(2, '0')}-01`;
}

/** Route params for the growth calculator (06-18): `start` and `monthly` are digits (minor units), `rate` is percent text. A bad one is dropped. */
export function prefillMinor(text: string | undefined): number | null {
  if (text === undefined || !/^\d{1,13}$/.test(text)) return null;
  return Number(text);
}

export function prefillRate(text: string | undefined): string {
  return text !== undefined && /^\d{1,4}(\.\d{1,10})?$/.test(text) ? text : '';
}
