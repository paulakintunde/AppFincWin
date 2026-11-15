import { minorUnits, type MinorUnits } from '../money/types';

// D-17 joint lines create no owing; D-23 no simplification (A->B and B->C never merge into A->C);
// ENG-25 owed money is a separate figure and is never added to spendable money by any caller.
// D-35: shares are the stored per-line shares, never recomputed from current weights.

export interface SharedLineForBalance {
  readonly lineId: string;
  readonly payerKey: string; // who paid (paid_by, else creator)
  readonly paidFromJoint: boolean; // D-17
  readonly status: 'open' | 'pending' | 'settled' | 'written_off';
  readonly pendingSettlementId: string | null;
  readonly shares: readonly { readonly memberKey: string; readonly amount: MinorUnits }[];
}

export interface PairBalance {
  readonly otherKey: string;
  readonly net: MinorUnits; // > 0: other owes viewer; < 0: viewer owes other
  readonly pending: MinorUnits; // part of net inside a pending settle-up
  readonly lineIds: readonly string[]; // every contributing line (traceability, D-23)
}

interface Acc {
  net: number;
  pending: number;
  lineIds: string[];
}

export function pairBalances(
  lines: readonly SharedLineForBalance[],
  viewerKey: string,
): readonly PairBalance[] {
  const map = new Map<string, Acc>();
  for (const line of lines) {
    if (line.paidFromJoint) continue;
    if (line.status !== 'open' && line.status !== 'pending') continue;
    for (const share of line.shares) {
      if (share.memberKey === line.payerKey || share.amount === 0) continue;
      let otherKey: string;
      let signed: number;
      if (line.payerKey === viewerKey) {
        otherKey = share.memberKey; // they owe me
        signed = share.amount;
      } else if (share.memberKey === viewerKey) {
        otherKey = line.payerKey; // I owe them
        signed = -share.amount;
      } else {
        continue;
      }
      let acc = map.get(otherKey);
      if (!acc) {
        acc = { net: 0, pending: 0, lineIds: [] };
        map.set(otherKey, acc);
      }
      acc.net += signed;
      if (line.status === 'pending') acc.pending += signed;
      if (!acc.lineIds.includes(line.lineId)) acc.lineIds.push(line.lineId);
    }
  }
  return [...map.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([otherKey, acc]) => ({
      otherKey,
      net: minorUnits(acc.net),
      pending: minorUnits(acc.pending),
      lineIds: acc.lineIds,
    }));
}

/** Sum of positive nets only: what others owe the viewer. Separate from spendable money (ENG-25). */
export function owedToMeTotal(pairs: readonly PairBalance[]): MinorUnits {
  return minorUnits(pairs.reduce((s, p) => (p.net > 0 ? s + p.net : s), 0));
}
