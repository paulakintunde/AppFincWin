// 10.1-15 (SCN-02): the receipt date. A date that reads both ways (03/04/26) is flagged, never silently picked.
import { daysInMonth } from '../time/calendar';
import type { Field } from './types';

export type DateOrder = 'MDY' | 'DMY' | 'YMD';

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const NUMERIC = /^(\d{1,4})([/.-])(\d{1,2})\2(\d{1,4})$/;
const MON_D_Y = /\b([A-Za-z]{3,9})\.? (\d{1,2}),? (\d{4})\b/;
const D_MON_Y = /\b(\d{1,2}) ([A-Za-z]{3,9})\.?,? (\d{4})\b/;

type Ymd = [number, number, number];

function iso([y, m, d]: Ymd): string | null {
  if (y < 2000 || y > 2099 || m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function month(word: string): number {
  return MONTHS.indexOf(word.slice(0, 3).toUpperCase()) + 1;
}

function numeric(token: string, order: DateOrder): Field<string | null> | null {
  const m = NUMERIC.exec(token);
  if (!m) return null;
  const [a, b, c] = [m[1] as string, m[3] as string, m[4] as string];
  const [na, nb, nc] = [parseInt(a, 10), parseInt(b, 10), parseInt(c, 10)];
  if (a.length === 4) {
    const v = c.length <= 2 ? iso([na, nb, nc]) : null;
    return v === null ? null : { value: v, unsure: false };
  }
  if (a.length > 2 || c.length === 1 || c.length === 3) return null;
  const y = c.length === 2 ? 2000 + nc : nc;
  const mdy = iso([y, na, nb]);
  const dmy = iso([y, nb, na]);
  const ymd = order === 'YMD' && c.length === 2 ? iso([2000 + na, nb, nc]) : null;
  const ranked = order === 'YMD' ? [ymd, dmy, mdy] : order === 'DMY' ? [dmy, mdy] : [mdy, dmy];
  const valid = ranked.filter((v): v is string => v !== null);
  if (valid.length === 0) return null;
  return { value: valid[0] as string, unsure: new Set(valid).size > 1 };
}

function named(text: string): Field<string | null> | null {
  const a = MON_D_Y.exec(text);
  const b = D_MON_Y.exec(text);
  const v = a ? iso([parseInt(a[3] as string, 10), month(a[1] as string), parseInt(a[2] as string, 10)]) : b ? iso([parseInt(b[3] as string, 10), month(b[2] as string), parseInt(b[1] as string, 10)]) : null;
  return v === null ? null : { value: v, unsure: false };
}

/** The first date in the texts as ISO YYYY-MM-DD; unsure when both day/month orders are real dates and differ. */
export function findDate(texts: readonly string[], order: DateOrder): Field<string | null> {
  for (const text of texts) {
    for (const token of text.split(/\s+/)) {
      const hit = numeric(token, order);
      if (hit) return hit;
    }
    const hit = named(text);
    if (hit) return hit;
  }
  return { value: null, unsure: true };
}
