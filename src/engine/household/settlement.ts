import { minorUnits, type MinorUnits } from '../money/types';
import { pairBalances, type SharedLineForBalance } from './balances';

/**
 * ARC-18: the one rule. Activity totals, category caps, insights and Decide history all call
 * this; none re-derives it.
 */
export function isSettlement(tx: { readonly isSettlement?: boolean | null }): boolean {
  return tx.isSettlement === true;
}

export function excludeSettlements<T extends { readonly isSettlement?: boolean | null }>(
  rows: readonly T[],
): T[] {
  return rows.filter((r) => !isSettlement(r));
}

/**
 * D-21: a settle-up total is exactly the ticked open lines between the pair. Pending and
 * settled lines are refused by omission. Amount is what `payerKey` owes `receiverKey`
 * (can be 0 or negative when the ticked set nets the other way).
 */
export function settleUpTotal(
  lines: readonly SharedLineForBalance[],
  payerKey: string,
  receiverKey: string,
  tickedLineIds: ReadonlySet<string>,
): { readonly amount: MinorUnits; readonly lineIds: readonly string[] } {
  const ticked = lines.filter((l) => l.status === 'open' && tickedLineIds.has(l.lineId));
  const pair = pairBalances(ticked, receiverKey).find((p) => p.otherKey === payerKey);
  if (!pair) return { amount: minorUnits(0), lineIds: [] };
  return { amount: pair.net, lineIds: pair.lineIds };
}
