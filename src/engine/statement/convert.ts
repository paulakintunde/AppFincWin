/**
 * D-44: converts a StatementDraft's raw magnitudes and notation markers into
 * the app's one stored sign rule under a decided FormatProfile. Money out is
 * negative and money in is positive; an account balance is positive when
 * money is held and negative when money is owed. This module applies the
 * profile -- it never re-reads notation itself (that is
 * parseNotatedAmount/engine/money, plan 02-32).
 *
 * A DR/CR marker (or a debit/credit column, which the adapter already turns
 * into the same marker) is a direct statement of direction and converts the
 * same way regardless of the profile: dr is always negative, cr is always
 * positive. Every other marker (none/plus/minus/parens/od) is read through
 * the profile's positiveMeans (for amounts) or balanceMeans (for balances)
 * -- see RESEARCH.md §A3's conversion table.
 *
 * A negative reading in any direction is an ordinary state (D-46, D-49),
 * never a row issue or a rejected value, so nothing in this file inspects
 * the sign of a converted amount or balance to decide anything.
 */
import { markerSign, minorUnits, type AmountMarker, type MinorUnits } from '../money';
import type { DraftRow, DraftRowIssue, FormatProfile, StatementDraft } from './types';

export interface ConvertedRow {
  index: number;
  localDate: string | null;
  description: string;
  amount: MinorUnits | null; // stored sign rule (D-44)
  balance: MinorUnits | null; // stored rule: held positive, owed negative; null when unknown
  availableDelta: MinorUnits | null; // available-credit files without a limit: held-view delta to the previous row
  rawAmount: string | null;
  rawBalance: string | null;
  currency: string;
  externalId: string | null;
  trnType: string | null;
  issues: DraftRowIssue[];
}

export interface ConvertedStatement {
  rows: ConvertedRow[];
  opening: MinorUnits | null;
  closing: MinorUnits | null;
  available: MinorUnits | null;
}

/** money-in -> +1 (a positive raw amount is money coming in); money-spent -> -1. */
export function signOfPositive(profile: FormatProfile): 1 | -1 {
  return profile.positiveMeans === 'money-in' ? 1 : -1;
}

// A zero amount or balance is never negative -- IEEE-754 negation/multiplication
// of a zero magnitude can produce -0, which is numerically equal to 0 but fails
// strict identity and has no meaning under D-44's sign rule. Normalise before
// handing a result to `minorUnits`.
function noNegativeZero(n: number): number {
  return n === 0 ? 0 : n;
}

export function convertAmount(magnitude: MinorUnits, marker: AmountMarker, profile: FormatProfile): MinorUnits {
  if (marker === 'dr') return minorUnits(noNegativeZero(-magnitude));
  if (marker === 'cr') return minorUnits(magnitude);
  const s = signOfPositive(profile);
  const rawSign = markerSign(marker);
  return minorUnits(noNegativeZero(s * rawSign * magnitude));
}

export function convertBalance(
  b: { magnitude: MinorUnits; marker: AmountMarker },
  profile: FormatProfile,
  limit: MinorUnits | null
): MinorUnits | null {
  if (profile.balanceMeans === 'available') {
    if (limit === null) return null;
    const sign = markerSign(b.marker);
    return minorUnits(noNegativeZero(-(limit - sign * b.magnitude)));
  }
  if (b.marker === 'dr') return minorUnits(noNegativeZero(-b.magnitude));
  if (b.marker === 'cr') return minorUnits(b.magnitude);
  const sign = markerSign(b.marker);
  if (profile.balanceMeans === 'held') return minorUnits(noNegativeZero(sign * b.magnitude));
  if (profile.balanceMeans === 'owed') return minorUnits(noNegativeZero(-(sign * b.magnitude)));
  return null; // balanceMeans 'none': nothing to convert
}

function heldSignedValue(magnitude: MinorUnits | null, marker: AmountMarker): MinorUnits | null {
  if (magnitude === null) return null;
  return minorUnits(noNegativeZero(markerSign(marker) * magnitude));
}

function convertRow(
  row: DraftRow,
  profile: FormatProfile,
  limit: MinorUnits | null,
  prevRow: DraftRow | undefined
): ConvertedRow {
  const amount = row.magnitude === null ? null : convertAmount(row.magnitude, row.marker, profile);

  let balance: MinorUnits | null = null;
  let availableDelta: MinorUnits | null = null;

  if (profile.balanceMeans === 'available' && limit === null) {
    const curHeld = heldSignedValue(row.balanceMagnitude, row.balanceMarker);
    const prevHeld = prevRow ? heldSignedValue(prevRow.balanceMagnitude, prevRow.balanceMarker) : null;
    availableDelta = curHeld !== null && prevHeld !== null ? minorUnits(noNegativeZero(curHeld - prevHeld)) : null;
  } else if (row.balanceMagnitude !== null) {
    balance = convertBalance({ magnitude: row.balanceMagnitude, marker: row.balanceMarker }, profile, limit);
  }

  return {
    index: row.index,
    localDate: row.localDate,
    description: row.description,
    amount,
    balance,
    availableDelta,
    rawAmount: row.rawAmount,
    rawBalance: row.rawBalance,
    currency: row.currency,
    externalId: row.externalId,
    trnType: row.trnType,
    issues: row.issues,
  };
}

export function convertDraft(
  draft: StatementDraft,
  profile: FormatProfile,
  opts: { limit: MinorUnits | null }
): ConvertedStatement {
  const rows = draft.rows.map((row, i) => convertRow(row, profile, opts.limit, draft.rows[i - 1]));

  const opening =
    draft.statedOpening === null
      ? null
      : convertBalance(
          { magnitude: draft.statedOpening.magnitude, marker: draft.statedOpening.marker },
          profile,
          opts.limit
        );
  const closing =
    draft.statedClosing === null
      ? null
      : convertBalance(
          { magnitude: draft.statedClosing.magnitude, marker: draft.statedClosing.marker },
          profile,
          opts.limit
        );
  const available =
    draft.available === null
      ? null
      : convertBalance({ magnitude: draft.available.magnitude, marker: draft.available.marker }, profile, opts.limit);

  return { rows, opening, closing, available };
}
