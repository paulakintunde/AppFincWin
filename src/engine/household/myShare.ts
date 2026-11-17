import { minorUnits, type MinorUnits } from '../money/types';
import { isSettlement } from './settlement';

/**
 * 08-25 (ARC-17, D-26, D-35): the one "my share" function. Every figure that asks "how much of this line is mine" reads it here.
 * Shares are always the stored ones (transaction_splits, or a personal copy's copy_share); they are never worked out again from
 * the household's current weights.
 */

/** One stored split of a shared line. `share` is signed like the line (an expense is negative), in the household currency. */
export interface StoredShare {
  /** The member's user id, or the former-member key once their account is deleted (D-29). Null when neither is known. */
  readonly memberKey: string | null;
  readonly share: MinorUnits;
}

export interface MyShareLine {
  readonly createdBy: string | null;
  readonly isShared: boolean;
  readonly isSettlement?: boolean;
  /** The line's own signed amount (its own currency). */
  readonly amount: MinorUnits;
  /** 08-14: a personal copy made at departure. Set when the copy carries the full paid amount; the person's share is this. */
  readonly copyShare?: MinorUnits | null;
}

/**
 * Where the amount came from: `line` is the line's own amount (its own currency); `stored` is a stored share in the household
 * currency (a split, or a copy's copy_share). The caller converts `stored` the way the line itself is shown.
 */
export interface MyShare {
  readonly amount: MinorUnits;
  readonly source: 'line' | 'stored';
}

const NONE: MyShare = { amount: minorUnits(0), source: 'line' };

/**
 * The viewer made the line. A line with no creator is a pre-Household row the reader can see (08-01 backfills creators and RLS
 * hides any left null), so it stays the reader's, as it was before Phase 8.
 */
export function isViewersOwn(line: Pick<MyShareLine, 'createdBy'>, viewerKey: string): boolean {
  return line.createdBy === null || line.createdBy === viewerKey;
}

export function myShareOfLine(line: MyShareLine, splits: readonly StoredShare[], viewerKey: string): MyShare {
  if (isSettlement({ isSettlement: line.isSettlement })) return NONE;
  if (line.isShared) {
    let sum = 0;
    for (const s of splits) if (s.memberKey === viewerKey) sum += s.share;
    return { amount: minorUnits(sum), source: 'stored' };
  }
  if (!isViewersOwn(line, viewerKey)) return NONE; // a partner's personal line is never mine (RLS hides it too)
  if (line.copyShare !== undefined && line.copyShare !== null) return { amount: line.copyShare, source: 'stored' };
  return { amount: line.amount, source: 'line' };
}
