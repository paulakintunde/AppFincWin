import { countsForMe } from '../month/countsForMe';
import type { CountsLine } from '../month/types';
import { minorUnits, type MinorUnits } from '../money/types';
import { divideHalfUp } from '../money/rounding';
import { isViewersOwn, myShareOfLine, type MyShareLine, type StoredShare } from './myShare';

/**
 * 08-25 (HH-09, ARC-17): the adapter from stored rows to 05.5's `countsForMe`. The database decides what a member can read; this
 * builds each readable line's `CountsLine` (its amount is the viewer's share from `myShareOfLine`) and the one rule decides what
 * counts. No screen filters rows on sharing or creator itself: Home and Decide reach their figures through `mineAmountOf` (Mine)
 * and `householdAmountOf` (Household).
 */

export interface ScopeLine extends MyShareLine {
  readonly id: string;
  /** The whole line in the viewer's home currency; null when no stored rate converts it (never guessed, D-37). */
  readonly amountHome: MinorUnits | null;
  /** The whole line in the household currency, stamped once when shared (D-39); null while that rate is pending. */
  readonly householdAmount: MinorUnits | null;
  /** The household currency the line was stamped in. A personal copy has none: its copy_share is read as home currency. */
  readonly householdCurrency: string | null;
}

/**
 * A stored share (household currency) in the viewer's home currency. Same currency: as stored. Otherwise the line's own home
 * figure scaled by the share's part of the line (no second rate lookup, so the share never moves against its line); null when
 * the line has no home figure or no household amount to scale by.
 */
export function storedShareInHome(stored: MinorUnits, line: ScopeLine, homeCurrency: string): MinorUnits | null {
  if ((line.householdCurrency ?? homeCurrency) === homeCurrency) return stored;
  if (line.amountHome === null || line.householdAmount === null || line.householdAmount === 0) return null;
  const sign = line.householdAmount < 0 ? -1n : 1n;
  const scaled = divideHalfUp(BigInt(line.amountHome) * BigInt(stored) * sign, BigInt(line.householdAmount) * sign);
  return minorUnits(Number(scaled));
}

/**
 * True when the viewer's figure for the line is the line itself: the viewer's own personal line that is not a copy carrying a
 * share. Callers keep such rows untouched (same object), so a household of one sees exactly the figures it saw before Phase 8.
 */
export function asStored(line: Pick<ScopeLine, 'createdBy' | 'isShared' | 'copyShare'>, viewerKey: string): boolean {
  return !line.isShared && isViewersOwn(line, viewerKey) && (line.copyShare === undefined || line.copyShare === null);
}

/**
 * The `CountsLine` for one readable line, or null when it is not the viewer's to count at all (a partner's personal line: RLS
 * already hides it; dropped here too, T-08-90). `amount` is null-free: an unconvertible line comes back as `unconverted`.
 */
export function countsLineOf(
  line: ScopeLine,
  splits: readonly StoredShare[],
  viewerKey: string,
  homeCurrency: string,
): { readonly line: CountsLine } | { readonly unconverted: true } | null {
  const isMine = isViewersOwn(line, viewerKey);
  if (!line.isShared && !isMine) return null;
  const share = myShareOfLine(line, splits, viewerKey);
  const amount = share.source === 'stored' ? storedShareInHome(share.amount, line, homeCurrency) : line.amountHome;
  if (amount === null) return { unconverted: true };
  return {
    line: { id: line.id, amount, isShared: line.isShared, isMine, ...(line.isSettlement === true ? { isSettlement: true } : {}) },
  };
}

/**
 * Mine scope: the line's figure for the viewer, through `countsForMe`. null = leave the row out; `{ amountHome: null }` = keep the
 * row as not yet converted.
 */
export function mineAmountOf(
  line: ScopeLine,
  splits: readonly StoredShare[],
  viewerKey: string,
  homeCurrency: string,
): { readonly amountHome: MinorUnits | null } | null {
  const c = countsLineOf(line, splits, viewerKey, homeCurrency);
  if (c === null) return null;
  if ('unconverted' in c) return { amountHome: null };
  return { amountHome: countsForMe(c.line) };
}

/** Household scope: shared lines only, at their household amount in the household currency. null = not in this scope. */
export function householdAmountOf(line: Pick<ScopeLine, 'isShared' | 'householdAmount'>): { readonly amount: MinorUnits | null } | null {
  if (!line.isShared) return null;
  return { amount: line.householdAmount };
}
