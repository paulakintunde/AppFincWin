/** 05.3-15: the three tap figures on Decide home. Pure; a null fund gives null (the UI shows Not set). */
import type { Evaluation } from '@/engine/decide/v3';
import type { MinorUnits } from '@/engine/money';

export interface HomeFigures {
  readonly typical: MinorUnits | null;
  readonly unspent: MinorUnits | null;
  readonly unspentChip: 'stale' | 'drifted' | null;
  readonly emergency: MinorUnits | null;
}

export function homeFigures(ev: Pick<Evaluation, 'month' | 'funds'>): HomeFigures {
  const u = ev.funds.unspent;
  return {
    typical: ev.month.typicalLeft,
    unspent: u === null ? null : (u.available ?? u.value),
    unspentChip: u === null ? null : u.stale ? 'stale' : u.drifted ? 'drifted' : null,
    emergency: ev.funds.emergency,
  };
}
