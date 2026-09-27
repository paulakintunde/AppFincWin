/**
 * Import transfer matching (D-52). Pairs an imported row with a stored row
 * on another of the user's accounts with the opposite sign, within a few
 * days, and an amount that matches exactly (same currency) or within a
 * tolerance (cross-currency, via `convertMinor`'s integer maths). Ranks
 * candidates by date proximity, payment-like descriptions, the other
 * account's name and the classic deposit-to-card shape, then assigns
 * one-to-one, greedily, by score. Suggestions only: nothing is linked here
 * (D-52). Never throws -- a missing rate or an overflowing conversion just
 * skips that candidate.
 */
import { convertMinor, type ScaledRate } from '../money/rates';
import { minorUnits } from '../money/types';

export const TRANSFER_WINDOW_DAYS = 3; // E5, D-52 "within a few days"
export const TRANSFER_TOLERANCE_BPS = 500; // 5% for cross-currency legs (E5)

export const PAYMENT_KEYWORDS = [
  'PAYMENT',
  'THANK YOU',
  'TRANSFER TO',
  'TRANSFER FROM',
  'TFR',
  'XFER',
  'CARD PAYMENT',
  'DIRECT DEBIT',
] as const;

export interface ImportedLeg {
  index: number;
  accountId: string;
  localDate: string;
  amount: number;
  currency: string;
  name: string;
  trnType: string | null;
}

export interface ExistingLeg {
  id: string;
  accountId: string;
  localDate: string;
  amount: number;
  currency: string;
  name: string | null;
  paymentType: string | null;
  transferId: string | null;
}

export interface TransferAccount {
  id: string;
  name: string;
  kind: string;
  currency: string;
  exponent: number;
}

export type TransferSuggestion =
  | { kind: 'pair'; importIndex: number; existingId: string; score: number }
  | { kind: 'choose'; importIndex: number; options: string[] }
  | { kind: 'orphan-transfer'; importIndex: number };

export function isPaymentLike(name: string | null, trnType: string | null, paymentType: string | null): boolean {
  if (name !== null) {
    const upper = name.toUpperCase();
    if (PAYMENT_KEYWORDS.some((keyword) => upper.includes(keyword))) {
      return true;
    }
  }
  if (trnType !== null) {
    const upperType = trnType.toUpperCase();
    if (upperType === 'XFER' || upperType === 'PAYMENT') {
      return true;
    }
  }
  if (paymentType !== null && paymentType.toUpperCase().includes('TRANSFER')) {
    return true;
  }
  return false;
}

const MS_PER_DAY = 86_400_000;

function toUtcDay(localDate: string): number {
  const [year, month, day] = localDate.split('-').map(Number);
  return Date.UTC(year!, month! - 1, day!) / MS_PER_DAY;
}

export function daysBetween(a: string, b: string): number {
  return Math.abs(toUtcDay(a) - toUtcDay(b));
}

interface LegRoles {
  outAccount: TransferAccount | undefined;
  inAccount: TransferAccount | undefined;
  outAmount: number;
  inAmount: number;
  outCurrency: string;
  inCurrency: string;
}

function legRoles(
  imported: ImportedLeg,
  existing: ExistingLeg,
  accountById: ReadonlyMap<string, TransferAccount>
): LegRoles {
  const importedIsOut = imported.amount < 0;
  return {
    outAccount: accountById.get(importedIsOut ? imported.accountId : existing.accountId),
    inAccount: accountById.get(importedIsOut ? existing.accountId : imported.accountId),
    outAmount: importedIsOut ? imported.amount : existing.amount,
    inAmount: importedIsOut ? existing.amount : imported.amount,
    outCurrency: importedIsOut ? imported.currency : existing.currency,
    inCurrency: importedIsOut ? existing.currency : imported.currency,
  };
}

interface AmountCheck {
  ok: boolean;
  amountDiff: number;
}

function checkAmount(
  imported: ImportedLeg,
  existing: ExistingLeg,
  accountById: ReadonlyMap<string, TransferAccount>,
  perEur: ReadonlyMap<string, ScaledRate>,
  toleranceBps: number
): AmountCheck {
  if (imported.currency === existing.currency) {
    return { ok: Math.abs(imported.amount) === Math.abs(existing.amount), amountDiff: 0 };
  }

  const { outAccount, inAccount, outAmount, inAmount, outCurrency, inCurrency } = legRoles(
    imported,
    existing,
    accountById
  );
  if (!outAccount || !inAccount) {
    return { ok: false, amountDiff: 0 };
  }
  const fromPerEur = perEur.get(outCurrency);
  const toPerEur = perEur.get(inCurrency);
  if (!fromPerEur || !toPerEur) {
    return { ok: false, amountDiff: 0 }; // missing rate -> skip this candidate, never throw
  }

  try {
    const converted = convertMinor(
      minorUnits(Math.abs(outAmount)),
      fromPerEur,
      outAccount.exponent,
      toPerEur,
      inAccount.exponent
    );
    const inAbs = Math.abs(inAmount);
    const diff = Math.abs(converted - inAbs);
    const withinTolerance = BigInt(diff) * 10_000n <= BigInt(toleranceBps) * BigInt(inAbs);
    return { ok: withinTolerance, amountDiff: diff };
  } catch {
    return { ok: false, amountDiff: 0 }; // overflow -> skip this candidate, never throw
  }
}

function scoreCandidate(
  imported: ImportedLeg,
  existing: ExistingLeg,
  deltaDays: number,
  accountById: ReadonlyMap<string, TransferAccount>
): number {
  let score = deltaDays === 0 ? 3 : deltaDays === 1 ? 2 : 1;

  if (
    isPaymentLike(imported.name, imported.trnType, null) ||
    isPaymentLike(existing.name, null, existing.paymentType)
  ) {
    score += 2;
  }

  const otherAccount = accountById.get(existing.accountId);
  if (otherAccount && otherAccount.name.length > 0 && imported.name.toUpperCase().includes(otherAccount.name.toUpperCase())) {
    score += 2;
  }

  const { outAccount, inAccount, inAmount } = legRoles(imported, existing, accountById);
  if (outAccount && inAccount && outAccount.kind !== 'credit' && inAccount.kind === 'credit' && inAmount > 0) {
    score += 1;
  }

  return score;
}

interface Candidate {
  importIndex: number;
  existingId: string;
  score: number;
  deltaDays: number;
  amountDiff: number;
}

function compareCandidates(a: Candidate, b: Candidate): number {
  if (a.score !== b.score) return b.score - a.score;
  if (a.deltaDays !== b.deltaDays) return a.deltaDays - b.deltaDays;
  if (a.amountDiff !== b.amountDiff) return a.amountDiff - b.amountDiff;
  if (a.existingId !== b.existingId) return a.existingId < b.existingId ? -1 : 1;
  return a.importIndex - b.importIndex;
}

function sameRank(a: Candidate, b: Candidate): boolean {
  return a.score === b.score && a.deltaDays === b.deltaDays && a.amountDiff === b.amountDiff;
}

export function matchTransfers(input: {
  imported: readonly ImportedLeg[];
  existing: readonly ExistingLeg[];
  accounts: readonly TransferAccount[];
  perEur: ReadonlyMap<string, ScaledRate>;
  windowDays?: number;
  toleranceBps?: number;
}): TransferSuggestion[] {
  const windowDays = input.windowDays ?? TRANSFER_WINDOW_DAYS;
  const toleranceBps = input.toleranceBps ?? TRANSFER_TOLERANCE_BPS;
  const accountById = new Map(input.accounts.map((a) => [a.id, a] as const));

  const candidates: Candidate[] = [];
  for (const imp of input.imported) {
    for (const ex of input.existing) {
      if (ex.transferId !== null) continue;
      if (ex.accountId === imp.accountId) continue;
      const impSign = Math.sign(imp.amount);
      const exSign = Math.sign(ex.amount);
      if (impSign === 0 || exSign === 0 || impSign === exSign) continue;

      const deltaDays = daysBetween(imp.localDate, ex.localDate);
      if (deltaDays > windowDays) continue;

      const amountCheck = checkAmount(imp, ex, accountById, input.perEur, toleranceBps);
      if (!amountCheck.ok) continue;

      const score = scoreCandidate(imp, ex, deltaDays, accountById);
      candidates.push({
        importIndex: imp.index,
        existingId: ex.id,
        score,
        deltaDays,
        amountDiff: amountCheck.amountDiff,
      });
    }
  }

  candidates.sort(compareCandidates);

  const byImport = new Map<number, Candidate[]>();
  for (const c of candidates) {
    const list = byImport.get(c.importIndex);
    if (list) {
      list.push(c);
    } else {
      byImport.set(c.importIndex, [c]);
    }
  }

  const resolved = new Map<number, TransferSuggestion>();
  const assignedExisting = new Set<string>();

  let progress = true;
  while (progress) {
    progress = false;
    let bestImport: number | null = null;
    let bestCandidate: Candidate | null = null;

    for (const [imp, list] of byImport) {
      if (resolved.has(imp)) continue;
      const top = list.find((c) => !assignedExisting.has(c.existingId));
      if (!top) continue;
      if (bestCandidate === null || compareCandidates(top, bestCandidate) < 0) {
        bestCandidate = top;
        bestImport = imp;
      }
    }

    if (bestImport === null || bestCandidate === null) break;

    const list = byImport.get(bestImport)!;
    const available = list.filter((c) => !assignedExisting.has(c.existingId));
    const top = available[0]!;
    const second = available[1];

    if (second && sameRank(top, second)) {
      resolved.set(bestImport, {
        kind: 'choose',
        importIndex: bestImport,
        options: [top.existingId, second.existingId].sort(),
      });
    } else {
      resolved.set(bestImport, { kind: 'pair', importIndex: bestImport, existingId: top.existingId, score: top.score });
      assignedExisting.add(top.existingId);
    }
    progress = true;
  }

  const suggestions: TransferSuggestion[] = [];
  for (const imp of input.imported) {
    const r = resolved.get(imp.index);
    if (r) {
      suggestions.push(r);
    } else if (isPaymentLike(imp.name, imp.trnType, null)) {
      suggestions.push({ kind: 'orphan-transfer', importIndex: imp.index });
    }
  }

  suggestions.sort((a, b) => a.importIndex - b.importIndex);
  return suggestions;
}
