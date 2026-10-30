/**
 * 05.3-15: the three tap figures on Decide home. Pure; a null fund gives null (the UI shows Not set).
 * 05.3-60 (D-26): each figure is a full-width row with a detail line; the detail data comes from the same Evaluation.
 */
import type { Evaluation, LocalDate } from '@/engine/decide/v3';
import type { MinorUnits } from '@/engine/money';

export interface HomeFigures {
  readonly typical: MinorUnits | null;
  /** how many months the typical month is worked out from (monthsUsed.length) */
  readonly typicalMonths: number;
  readonly unspent: MinorUnits | null;
  readonly unspentChip: 'stale' | 'drifted' | null;
  /** the date the unspent figure was confirmed (the anchor date) */
  readonly unspentAt: LocalDate | null;
  readonly emergency: MinorUnits | null;
  /** the fund has no account picked to hold it */
  readonly emergencyUnlinked: boolean;
}

export function homeFigures(ev: Pick<Evaluation, 'month' | 'funds'>): HomeFigures {
  const u = ev.funds.unspent;
  return {
    typical: ev.month.typicalLeft,
    typicalMonths: ev.month.monthsUsed.length,
    unspent: u === null ? null : (u.available ?? u.value),
    unspentChip: u === null ? null : u.stale ? 'stale' : u.drifted ? 'drifted' : null,
    unspentAt: u === null ? null : u.anchor.at,
    emergency: ev.funds.emergency,
    emergencyUnlinked: ev.funds.fundUnlinked === true,
  };
}
