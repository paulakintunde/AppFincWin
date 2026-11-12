// P3-CR-01: the one place a holding's entries become the engine's LotEntry list. A sale with no units takes out
// put-in in proportion to the holding's value just before the sale, so that value must be the value AT THE SALE, not the
// holding's latest value: otherwise every later "Update value" rewrites past gains. Pure, no React, no I/O.
//
// The value before an entry is the latest 'value' entry dated before it. A 'value' entry on the same date counts when it
// was written first (created_at), or when the entry being checked has no created_at yet (a form's unsaved entry). With
// no 'value' entry that early, the earliest 'value' entry stands in, and the holding's own value only when there are none.
import type { HoldingLotRow } from '@/db/holdingLots';
import type { HoldingRow } from '@/db/holdings';
import type { LotEntry } from '@/engine/grow';
import { minorUnits } from '@/engine/money';

/** The opening put-in counts as the first buy; this date sorts before any real entry. */
export const OPENING_DATE = '0000-01-01';

export type LotLike = Pick<HoldingLotRow, 'kind' | 'amount' | 'units' | 'local_date'> &
  Partial<Pick<HoldingLotRow, 'created_at' | 'deleted_at'>>;

function isBefore(v: LotLike, entry: LotLike): boolean {
  if (v.local_date !== entry.local_date) return v.local_date < entry.local_date;
  if (entry.created_at === undefined) return true;
  return v.created_at !== undefined && v.created_at < entry.created_at;
}

function later(a: LotLike, b: LotLike): boolean {
  if (a.local_date !== b.local_date) return a.local_date > b.local_date;
  return (a.created_at ?? '') > (b.created_at ?? '');
}

/** The holding's value just before `entry`, in its own minor units. */
export function valueBeforeEntry(holding: Pick<HoldingRow, 'value'>, lots: readonly LotLike[], entry: LotLike): number {
  let best: LotLike | null = null;
  let earliest: LotLike | null = null;
  for (const v of lots) {
    if (v.kind !== 'value' || (v.deleted_at ?? null) !== null) continue;
    if (earliest === null || later(earliest, v)) earliest = v;
    if (isBefore(v, entry) && (best === null || later(v, best))) best = v;
  }
  return (best ?? earliest)?.amount ?? holding.value;
}

/** The entries the engine replays: the opening put-in as a buy, then every non-value entry with its own value-before. */
export function holdingLotEntries(holding: Pick<HoldingRow, 'opening_put_in' | 'value'>, lots: readonly LotLike[]): LotEntry[] {
  const out: LotEntry[] = [];
  if (holding.opening_put_in > 0) out.push({ kind: 'buy', amount: minorUnits(holding.opening_put_in), units: null, localDate: OPENING_DATE });
  for (const l of lots) {
    if (l.kind === 'value' || (l.deleted_at ?? null) !== null) continue;
    out.push({
      kind: l.kind,
      amount: minorUnits(l.amount),
      units: l.units,
      localDate: l.local_date,
      valueBefore: minorUnits(valueBeforeEntry(holding, lots, l)),
    });
  }
  return out;
}
