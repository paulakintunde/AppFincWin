/**
 * D-41 as amended by D-53: builds a format profile before any conversion.
 * The target account's kind fixes what the balance column means (`k`,
 * `balanceMeans`); with `k` fixed, label evidence and then running-balance
 * reconciliation settle the sign convention (`s`, `positiveMeans`) on their
 * own (RESEARCH.md §A2). The mirror reading (flipping both `s` and `k`
 * together) is never offered -- only `k` fixed by the account, `s` decided
 * -- because a running-balance check alone cannot separate the two
 * (RESEARCH.md §A2's key finding). When neither labels nor numbers decide,
 * the result is `ambiguous` with both candidate readings, and the pipeline
 * blocks commit until the user chooses (D-42).
 */
import { markerSign, minorUnits, type MinorUnits } from '../money';
import { convertDraft } from './convert';
import { reconcile, type FileCheck, type ReconcileRow } from './reconcile';
import {
  accountFamilyOf,
  type AccountFamily,
  type AccountKind,
  type FormatProfile,
  type ProfileEvidence,
  type ProfileResult,
  type StatementDraft,
} from './types';

/** Card descriptions that are money in, whatever the raw sign says (RESEARCH.md §A2). */
export const PAYMENT_LIKE_CARD = [
  'PAYMENT - THANK YOU',
  'PAYMENT – THANK YOU',
  'PAYMENT THANK YOU',
  'PAYMENT RECEIVED',
  'DIRECT DEBIT PAYMENT',
  'THANK YOU FOR YOUR PAYMENT',
] as const;

/** Deposit-account descriptions that are money in, whatever the raw sign says. */
export const INCOME_LIKE_DEPOSIT = ['SALARY', 'PAYROLL', 'INTEREST PAID', 'WAGES'] as const;

function hasAnyBalance(draft: StatementDraft): boolean {
  return draft.rows.some((r) => r.balanceMagnitude !== null) || draft.statedOpening !== null || draft.statedClosing !== null;
}

/** Step 1 of the resolution order: the target kind fixes the balance family. */
export function balanceMeansFor(kind: AccountKind, draft: StatementDraft): FormatProfile['balanceMeans'] {
  if (!hasAnyBalance(draft)) return 'none';
  if (kind === 'credit') {
    if (draft.balanceLabel === 'available' || draft.labels.includes('available-balance-label')) return 'available';
    return 'owed';
  }
  if (kind === 'loan') return 'owed';
  return 'held';
}

/** Same balanceMeans/accountFamily, s = money-in then money-spent (statedLimit filled in later). */
export function candidateProfiles(draft: StatementDraft, kind: AccountKind): [FormatProfile, FormatProfile] {
  const accountFamily = accountFamilyOf(kind);
  const balanceMeans = balanceMeansFor(kind, draft);
  const base = {
    version: 1 as const,
    source: draft.source,
    accountFamily,
    balanceMeans,
    statedLimit: null,
    decidedBy: 'user' as const,
  };
  const moneyIn: FormatProfile = { ...base, positiveMeans: 'money-in' };
  const moneySpent: FormatProfile = { ...base, positiveMeans: 'money-spent' };
  return [moneyIn, moneySpent];
}

export function flipProfile(p: FormatProfile): FormatProfile {
  return {
    ...p,
    positiveMeans: p.positiveMeans === 'money-in' ? 'money-spent' : 'money-in',
    decidedBy: 'user',
  };
}

// A limit computed from stated statement figures could legitimately land on
// exactly 0 via a subtraction that produces IEEE-754 -0; normalise before
// handing it to minorUnits() (mirrors convert.ts's noNegativeZero).
function normalizeZero(n: number): number {
  return n === 0 ? 0 : n;
}

// Called only when balanceMeans is fixed to 'owed' (deriveStatedLimit's gate), where the
// stored-owed formula is `-(sign*magnitude)` (convert.ts's convertBalance) -- so the owed
// magnitude itself is exactly `sign*magnitude`, computed directly rather than through
// convertBalance (whose 'available'/'none' branches can never apply here).
function deriveOfxCardLimit(draft: StatementDraft): MinorUnits | null {
  if (draft.statedClosing === null || draft.available === null) return null;
  const owedMagnitude = markerSign(draft.statedClosing.marker) * draft.statedClosing.magnitude;
  const availableSigned = markerSign(draft.available.marker) * draft.available.magnitude;
  const limit = normalizeZero(owedMagnitude + availableSigned);
  return limit >= 0 ? minorUnits(limit) : null;
}

// Called only when balanceMeans is fixed to 'held', where the stored-held formula is
// `sign*magnitude` directly -- computed the same way, for the same reason.
function deriveBankOverdraftLimit(draft: StatementDraft): MinorUnits | null {
  if (draft.statedClosing === null || draft.available === null) return null;
  const ledgerSigned = markerSign(draft.statedClosing.marker) * draft.statedClosing.magnitude;
  const availableSigned = markerSign(draft.available.marker) * draft.available.magnitude;
  const diff = normalizeZero(availableSigned - ledgerSigned);
  if (diff <= 0 || diff % 10_000 !== 0) return null;
  return minorUnits(diff);
}

/** statedLimit never depends on which s candidate is chosen -- only on balanceMeans. */
function deriveStatedLimit(draft: StatementDraft, profile: FormatProfile): MinorUnits | null {
  if (draft.statedLimit !== null) return draft.statedLimit;
  if (profile.balanceMeans === 'owed') return deriveOfxCardLimit(draft);
  if (profile.balanceMeans === 'held') return deriveBankOverdraftLimit(draft);
  return null;
}

function reconcileVerifiedLinks(
  draft: StatementDraft,
  profile: FormatProfile,
  limit: MinorUnits | null
): { verifiedLinks: number; file: FileCheck } {
  const converted = convertDraft(draft, profile, { limit });
  const rows: ReconcileRow[] = converted.rows.map((r) => ({
    amount: r.amount,
    balance: r.balance,
    localDate: r.localDate,
    availableDelta: r.availableDelta,
  }));
  const result = reconcile(rows, { opening: converted.opening, closing: converted.closing });
  return { verifiedLinks: result.verifiedLinks, file: result.file };
}

function tryRemembered(
  draft: StatementDraft,
  accountFamily: AccountFamily,
  limit: MinorUnits | null,
  remembered: FormatProfile | null
): ProfileResult | null {
  if (remembered === null) return null;
  if (remembered.source !== draft.source) return null;
  if (remembered.accountFamily !== accountFamily) return null;

  if (!hasAnyBalance(draft)) {
    const profile: FormatProfile = { ...remembered, statedLimit: deriveStatedLimit(draft, remembered), decidedBy: 'remembered' };
    return { kind: 'decided', profile, evidence: ['remembered'] };
  }

  const own = reconcileVerifiedLinks(draft, remembered, limit);
  const flipped = flipProfile(remembered);
  const flippedResult = reconcileVerifiedLinks(draft, flipped, limit);
  if (own.verifiedLinks >= flippedResult.verifiedLinks) {
    const profile: FormatProfile = { ...remembered, statedLimit: deriveStatedLimit(draft, remembered), decidedBy: 'remembered' };
    return { kind: 'decided', profile, evidence: ['remembered', 'running-balance'] };
  }
  return null; // never silently reapplied -- falls through to normal inference
}

const STRUCTURAL_LABELS = ['debit-credit-columns', 'direction-column', 'dr-cr-markers'] as const;

/**
 * Review E-CR-03: a structural label (DR/CR markers, a direction column,
 * debit/credit columns) only says that *some* rows state their direction.
 * Rows that do are converted by their marker whatever the profile says; the
 * rest still go through positiveMeans, so the label alone must not pick it.
 *  - every non-zero row carries dr or cr: positiveMeans never applies, so
 *    money-in is returned as the canonical choice;
 *  - only cr appears and the unmarked rows are bare numbers: bare means the
 *    opposite of cr (a UK card CSV marking only payments 'CR'), money-spent;
 *  - only dr appears and the unmarked rows are bare: money-in;
 *  - anything else (both markers alongside unmarked rows, or unmarked rows
 *    with their own sign) is not decided here and falls through.
 */
function decideFromStructural(draft: StatementDraft): 'money-in' | 'money-spent' | null {
  let dr = 0;
  let cr = 0;
  let bare = 0;
  let signed = 0;
  for (const row of draft.rows) {
    if (row.magnitude === null || row.magnitude === 0) continue;
    if (row.marker === 'dr') dr += 1;
    else if (row.marker === 'cr') cr += 1;
    else if (row.marker === 'none' || row.marker === 'plus') bare += 1;
    else signed += 1;
  }
  if (bare === 0 && signed === 0) return 'money-in';
  if (signed > 0) return null;
  if (dr === 0 && cr > 0) return 'money-spent';
  if (cr === 0 && dr > 0) return 'money-in';
  return null;
}

function decideFromRowSign(
  draft: StatementDraft,
  accountFamily: AccountFamily
): { s: 1 | -1; evidence: ProfileEvidence } | null {
  const patterns: readonly string[] | null =
    accountFamily === 'card' ? PAYMENT_LIKE_CARD : accountFamily === 'deposit' ? INCOME_LIKE_DEPOSIT : null;
  if (patterns === null) return null;
  for (const row of draft.rows) {
    if (row.magnitude === null || row.magnitude === 0) continue;
    const upper = row.description.toUpperCase();
    if (patterns.some((p) => upper.includes(p))) {
      return { s: markerSign(row.marker), evidence: accountFamily === 'card' ? 'payment-row-sign' : 'income-row-sign' };
    }
  }
  return null;
}

function decideFromTrntype(draft: StatementDraft): { s: 1 | -1 } | null {
  let agreeUnderMoneyIn = 0;
  let total = 0;
  for (const row of draft.rows) {
    if (row.trnType === null || row.magnitude === null || row.magnitude === 0) continue;
    const t = row.trnType.toUpperCase();
    if (t !== 'CREDIT' && t !== 'DEBIT') continue;
    total += 1;
    const storedSignUnderMoneyIn = markerSign(row.marker); // s = +1: stored sign equals raw sign
    const expectPositive = t === 'CREDIT';
    if ((storedSignUnderMoneyIn > 0) === expectPositive) agreeUnderMoneyIn += 1;
  }
  if (total === 0) return null;
  if (agreeUnderMoneyIn * 2 > total) return { s: 1 };
  if (agreeUnderMoneyIn * 2 < total) return { s: -1 };
  return null;
}

function decideByReconciliation(
  draft: StatementDraft,
  limit: MinorUnits | null,
  candidates: readonly [FormatProfile, FormatProfile]
): { profile: FormatProfile; evidence: ProfileEvidence[] } | null {
  const [moneyIn, moneySpent] = candidates;
  const a = reconcileVerifiedLinks(draft, moneyIn, limit);
  const b = reconcileVerifiedLinks(draft, moneySpent, limit);
  const aAll = a.file === 'all-verified';
  const bAll = b.file === 'all-verified';
  if (aAll !== bAll) {
    const winner = aAll ? moneyIn : moneySpent;
    return { profile: { ...winner, decidedBy: 'reconciliation' }, evidence: ['account-kind', 'running-balance'] };
  }
  if (a.verifiedLinks !== b.verifiedLinks) {
    const winner = a.verifiedLinks > b.verifiedLinks ? moneyIn : moneySpent;
    return { profile: { ...winner, decidedBy: 'reconciliation' }, evidence: ['account-kind', 'running-balance'] };
  }
  return null;
}

/** Weak prior (step 4): majority raw sign, ordering only, never deciding. */
function orderByPrior(
  draft: StatementDraft,
  candidates: readonly [FormatProfile, FormatProfile]
): [FormatProfile, FormatProfile] {
  const [moneyIn, moneySpent] = candidates;
  let posCount = 0;
  let negCount = 0;
  for (const row of draft.rows) {
    if (row.magnitude === null || row.magnitude === 0) continue;
    if (markerSign(row.marker) === 1) posCount += 1;
    else negCount += 1;
  }
  if (negCount > posCount) return [moneyIn, moneySpent];
  return [moneySpent, moneyIn];
}

export function inferProfile(
  draft: StatementDraft,
  target: { kind: AccountKind; limit: MinorUnits | null },
  remembered: FormatProfile | null
): ProfileResult {
  const accountFamily = accountFamilyOf(target.kind);

  const rememberedResult = tryRemembered(draft, accountFamily, target.limit, remembered);
  if (rememberedResult !== null) return rememberedResult;

  const hasBalances = hasAnyBalance(draft);
  const candidates = candidateProfiles(draft, target.kind);
  const [moneyIn, moneySpent] = candidates;

  function decideByLabel(chosen: FormatProfile, evidenceCode: ProfileEvidence): ProfileResult {
    const profile: FormatProfile = { ...chosen, statedLimit: deriveStatedLimit(draft, chosen), decidedBy: 'labels' };
    const evidence: ProfileEvidence[] = ['account-kind', evidenceCode];
    if (hasBalances) {
      const r = reconcileVerifiedLinks(draft, profile, target.limit);
      if (r.verifiedLinks > 0 || r.file === 'all-verified') evidence.push('running-balance');
    }
    return { kind: 'decided', profile, evidence };
  }

  const structural = STRUCTURAL_LABELS.find((code) => draft.labels.includes(code));
  if (structural !== undefined) {
    const structuralDecision = decideFromStructural(draft);
    if (structuralDecision !== null) {
      return decideByLabel(structuralDecision === 'money-in' ? moneyIn : moneySpent, structural);
    }
  }

  const rowSignDecision = decideFromRowSign(draft, accountFamily);
  if (rowSignDecision !== null) {
    return decideByLabel(rowSignDecision.s === 1 ? moneyIn : moneySpent, rowSignDecision.evidence);
  }

  const trntypeDecision = decideFromTrntype(draft);
  if (trntypeDecision !== null) {
    return decideByLabel(trntypeDecision.s === 1 ? moneyIn : moneySpent, 'trntype-agrees');
  }

  if (hasBalances) {
    const decision = decideByReconciliation(draft, target.limit, [moneyIn, moneySpent]);
    if (decision !== null) {
      const profile: FormatProfile = { ...decision.profile, statedLimit: deriveStatedLimit(draft, decision.profile) };
      return { kind: 'decided', profile, evidence: decision.evidence };
    }
  }

  const [first, second] = orderByPrior(draft, [moneyIn, moneySpent]);
  const statedLimit = deriveStatedLimit(draft, first);
  const finalFirst: FormatProfile = { ...first, statedLimit, decidedBy: 'user' };
  const finalSecond: FormatProfile = { ...second, statedLimit, decidedBy: 'user' };
  return { kind: 'ambiguous', candidates: [finalFirst, finalSecond], evidence: ['account-kind'] };
}
