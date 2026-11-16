import { isSettlement } from '@/engine/household/settlement';

/**
 * 08-30 (ARC-18, 05.5 D-06): the v3 builder skips a row flagged isSettlement, so month lines and the month picture never count a
 * settle-up as the user's own money in or out. Set from the one engine rule. Rows come back untouched (same array) when none is
 * a settlement, so the memoised source keeps its identity (06.1-46).
 */
export function withSettlementFlag<T extends { is_settlement?: boolean }>(rows: readonly T[]): readonly T[] {
  if (!rows.some((r) => isSettlement({ isSettlement: r.is_settlement === true }))) return rows;
  return rows.map((r) => ({ ...r, isSettlement: isSettlement({ isSettlement: r.is_settlement === true }) }));
}
