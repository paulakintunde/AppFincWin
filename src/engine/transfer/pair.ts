/**
 * Transfer-pair construction and edit rules (D-50, D-51). A transfer is two
 * legs built together -- money out of one account (negative), money into
 * the other (positive) -- sharing one transfer id. Same-currency legs are
 * built equal and opposite; cross-currency legs carry the two amounts the
 * user or the statements give, never one derived from the other. Editing a
 * pair patches only the keys that actually changed, on whichever leg they
 * belong to, once the edited pair has been checked against the same rules.
 */
import { isValidLocalDate } from '../time/localDate';
import { minorUnits, type MinorUnits } from '../money/types';

export interface TransferLegDraft {
  id: string;
  accountId: string;
  amount: MinorUnits;
  currency: string;
  localDate: string;
  transferId: string;
}

export type BuildTransferError = 'same-account' | 'non-positive' | 'same-currency-mismatch' | 'bad-date';

export interface BuildTransferLegsInput {
  transferId: string;
  outId: string;
  inId: string;
  from: { id: string; currency: string };
  to: { id: string; currency: string };
  amountOut: MinorUnits;
  amountIn: MinorUnits;
  localDate: string;
}

export type BuildTransferLegsResult =
  | { ok: true; legs: [TransferLegDraft, TransferLegDraft] }
  | { ok: false; error: BuildTransferError };

export function buildTransferLegs(input: BuildTransferLegsInput): BuildTransferLegsResult {
  if (input.from.id === input.to.id) {
    return { ok: false, error: 'same-account' };
  }
  if (!isValidLocalDate(input.localDate)) {
    return { ok: false, error: 'bad-date' };
  }
  if (input.amountOut <= 0 || input.amountIn <= 0) {
    return { ok: false, error: 'non-positive' };
  }
  if (input.from.currency === input.to.currency && input.amountOut !== input.amountIn) {
    return { ok: false, error: 'same-currency-mismatch' };
  }

  const outLeg: TransferLegDraft = {
    id: input.outId,
    accountId: input.from.id,
    amount: minorUnits(-input.amountOut),
    currency: input.from.currency,
    localDate: input.localDate,
    transferId: input.transferId,
  };
  const inLeg: TransferLegDraft = {
    id: input.inId,
    accountId: input.to.id,
    amount: minorUnits(input.amountIn),
    currency: input.to.currency,
    localDate: input.localDate,
    transferId: input.transferId,
  };

  return { ok: true, legs: [outLeg, inLeg] };
}

export interface TransferPairState {
  out: { accountId: string; currency: string; amount: number; localDate: string };
  in: { accountId: string; currency: string; amount: number; localDate: string };
}

export interface TransferEditPatches {
  out: Record<string, string | number>;
  in: Record<string, string | number>;
}

function legPatch(
  before: TransferPairState['out'],
  after: TransferPairState['out']
): Record<string, string | number> {
  const patch: Record<string, string | number> = {};
  if (before.localDate !== after.localDate) {
    patch.local_date = after.localDate;
  }
  if (before.accountId !== after.accountId) {
    patch.account_id = after.accountId;
    patch.original_currency = after.currency;
  }
  if (before.amount !== after.amount) {
    patch.original_amount = after.amount;
  }
  return patch;
}

export type TransferEditError = BuildTransferError | 'date-mismatch';

export type TransferEditResult = { ok: true; patches: TransferEditPatches } | { ok: false; error: TransferEditError };

/**
 * The per-leg patches for an edit, after checking the edited pair keeps every
 * invariant `buildTransferLegs` enforces (review E-WR-11): out negative and in
 * positive, two distinct accounts, equal magnitudes in one currency, and one
 * shared valid date (D-51: editing the date edits both legs).
 */
export function transferEditPatches(before: TransferPairState, after: TransferPairState): TransferEditResult {
  if (after.out.accountId === after.in.accountId) return { ok: false, error: 'same-account' };
  if (after.out.localDate !== after.in.localDate) return { ok: false, error: 'date-mismatch' };
  if (!isValidLocalDate(after.out.localDate)) return { ok: false, error: 'bad-date' };
  if (after.out.amount >= 0 || after.in.amount <= 0) return { ok: false, error: 'non-positive' };
  if (after.out.currency === after.in.currency && -after.out.amount !== after.in.amount) {
    return { ok: false, error: 'same-currency-mismatch' };
  }
  return {
    ok: true,
    patches: {
      out: legPatch(before.out, after.out),
      in: legPatch(before.in, after.in),
    },
  };
}
