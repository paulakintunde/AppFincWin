// Plausibility check for fx-sync ingest (MON-11, D-11, D-12). Zero imports
// (besides the type-only FxRow import, erased at compile time) so this
// loads identically under Deno and Jest, like parse.ts.
//
// Ratios are computed with Number() on decimal rate strings -- this is rate
// comparison, not money arithmetic; amounts never pass through here.
import type { FxRow } from './parse.ts';

export const PLAUSIBILITY_THRESHOLD = 0.10; // D-11/MON-11: about 10% day-on-day
export const CONFIRM_TOLERANCE = 0.03; // D-12 "near", Assumption A2

export interface StoredRate {
  quote: string;
  rate: string;
  date: string;
}

export interface OpenHold {
  id: number;
  quote: string;
  heldRate: string;
  heldDate: string;
  source: string;
  /** 'held' (open) or 'dropped' (operator-rejected, terminal -- CR-B02). Absent means 'held'. */
  status?: 'held' | 'dropped';
}

export interface Classification {
  accept: FxRow[];
  hold: Array<FxRow & { priorRate: string; priorDate: string; changeRatio: number; source: string }>;
  confirm: Array<{ holdId: number; row: FxRow; source: string }>;
  /** Rows re-reporting a (quote, date, source) already held or dropped: never re-held, never served (CR-B02). */
  skipped: FxRow[];
}

function ratioOf(a: string, b: string): number {
  return Math.abs(Number(a) / Number(b) - 1);
}

// A boundary value like exactly 10% (110/100) does not round-trip exactly
// through IEEE 754 division and subtraction -- the result can land a few
// ULPs above 0.1 even though the inputs are "round" decimal numbers. This
// epsilon is far smaller than any real-world rate difference and exists
// only to make an exact-threshold comparison behave as the decimal math
// intends, not to loosen the ~10%/~3% policy itself.
const EPSILON = 1e-9;

// classifyRates: no history for quote -> accept. |new/prior - 1| <= 0.10 ->
// accept. Prior is the latest history row with date strictly before the
// incoming row's date (Frankfurter's per-currency dates are heterogeneous,
// Pitfall 4). An incoming row identical to an already-stored row for the
// same date always accepts, regardless of any prior-day move (idempotent
// upsert -- re-running the sync must never re-quarantine what it already
// wrote). An open hold for the same quote is checked before the historical
// comparison: a witness from a different source, or a later refresh, that
// lands within CONFIRM_TOLERANCE of the held rate confirms the hold (and
// the witness row itself is still accepted on its own merits); beyond
// tolerance it falls through to the normal historical check, which may
// hold it again under its own source/date. An incoming row whose exact
// (quote, date, source) is already held, or was dropped by the operator, is
// skipped outright: a dropped value is terminal and must never be revived
// or confirmed, and an already-held one needs no second hold or alert
// (CR-B02).
export function classifyRates(
  incoming: FxRow[],
  history: StoredRate[],
  openHolds: OpenHold[],
  source: string
): Classification {
  const accept: FxRow[] = [];
  const hold: Classification['hold'] = [];
  const confirm: Classification['confirm'] = [];
  const skipped: FxRow[] = [];
  const isOpen = (h: OpenHold) => (h.status ?? 'held') === 'held';

  for (const row of incoming) {
    if (openHolds.some((h) => h.quote === row.quote && h.heldDate === row.date && h.source === source)) {
      skipped.push(row);
      continue;
    }

    const alreadyStored = history.find((h) => h.quote === row.quote && h.date === row.date);
    if (alreadyStored && alreadyStored.rate === row.rate) {
      accept.push(row);
      continue;
    }

    const openHold = openHolds.find((h) => isOpen(h) && h.quote === row.quote);
    if (openHold) {
      const isWitness = openHold.source !== source || row.date > openHold.heldDate;
      if (isWitness && ratioOf(row.rate, openHold.heldRate) <= CONFIRM_TOLERANCE + EPSILON) {
        confirm.push({
          holdId: openHold.id,
          row: { base: row.base, quote: openHold.quote, rate: openHold.heldRate, date: openHold.heldDate },
          source: openHold.source,
        });
        accept.push(row);
        continue;
      }
    }

    const prior = history
      .filter((h) => h.quote === row.quote && h.date < row.date)
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))[0];

    if (!prior) {
      accept.push(row);
      continue;
    }

    const changeRatio = ratioOf(row.rate, prior.rate);
    if (changeRatio <= PLAUSIBILITY_THRESHOLD + EPSILON) {
      accept.push(row);
      continue;
    }

    hold.push({ ...row, priorRate: prior.rate, priorDate: prior.date, changeRatio, source });
  }

  return { accept, hold, confirm, skipped };
}
