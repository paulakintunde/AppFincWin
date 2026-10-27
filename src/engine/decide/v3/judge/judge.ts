/**
 * The one judge (05.1-24; v3 §4.5, §4.6, UP §5.3, I23, I31, I38, D-10, D-23, D-30, D-32).
 * The only place a code is decided. Notices and lines never change it: lines become facts, notices are fixed text keys.
 *
 * Ladder (one-off part, cash check first):
 *   cash payday / not covered                       -> not_yet (payday only when the ladder below would pass by then;
 *                                                      otherwise the later of payday and the ladder month; a cash
 *                                                      not_covered is also the later of the ladder month and the pay date)
 *   P <= max(0, monthLeft)                          -> fits_month
 *   P <= unspent (this month's room counted once)   -> fits_unspent
 *   unspent unknown and P above this month's room   -> needs_input
 *   marked emergency (necessity / for work) and P <= unspent + fund -> emergency_use
 *   otherwise                                       -> not_yet, ready in ceilDiv(P - max(0, unspent), typicalLeft) months
 * Monthly part: typicalLeft - M < 0 -> monthly_short; lowLeft - M < 0 -> fits with the low-month clause (I23).
 * The stricter part leads (CODE_PRECEDENCE). The funding split always sums to P (month, own envelope, earlier unspent,
 * emergency only when emergency_use). The user's confirmed (rolled) unspent figure is always the one judged against,
 * even when it has drifted (D-30); drift only adds a notice and caps confidence.
 *
 * Unspent after = unspent - (money taken from this month and from earlier unspent). Money from the purchase's own
 * envelope and the emergency fund is not unspent money, so it does not reduce it. Scenario 02 (price 120000 against
 * unspent 240000) therefore gives 120000. D-18 "return refund" is a re-run after the purchase was logged and refunded:
 * its figure is the rolled unspent, not a judge subtraction, so the two do not conflict.
 */
import type { MinorUnits } from '../../../money/types';
import { minorUnits } from '../../../money/types';
import { SIMULATION_MONTH_CAP } from '../../../payoff/constants';
import { ceilDivide } from '../../../payoff/types';
import { CODE_PRECEDENCE, LEGACY_STATE_OF_CODE } from '../constants';
import { addYearMonths, daysBetween } from '../dates';
import type { CashCheck } from '../cash/path';
import { emergencyOf, emergencyUse, mayUseEmergency } from '../funds/emergency';
import { capConfidence } from '../month/confidence';
import type {
  Code,
  Confidence,
  Fact,
  Funds,
  FundingSegment,
  MissingCode,
  MonthModel,
  Notice,
  Purchase,
  ReadyBy,
  ReasonCode,
  Result,
  V3Inputs,
  Variant,
} from '../types';
import { evaluateLines } from './lines';
import { needsInput } from './needsInput';

export interface JudgeInput {
  readonly inputs: V3Inputs;
  readonly month: MonthModel;
  readonly funds: Funds;
  readonly purchase: Purchase | null;
  readonly purchaseMissing: readonly MissingCode[];
  readonly purchaseFacts: readonly Fact[];
  readonly purchaseReasons: readonly ReasonCode[];
  readonly cash: CashCheck;
}

export interface OneOffPart {
  readonly code: Code;
  readonly variant: Variant | null;
  readonly split: readonly FundingSegment[];
  readonly readyBy: ReadyBy | null;
  readonly emergencyUsed: MinorUnits;
  readonly rebuildMonths: number | null;
}

const mu = (n: number): MinorUnits => minorUnits(n);

function rank(c: Code): number {
  return CODE_PRECEDENCE.indexOf(c);
}

function stricter(a: Code, b: Code): Code {
  return rank(a) <= rank(b) ? a : b;
}

function notYet(variant: Variant, readyBy: ReadyBy | null): OneOffPart {
  return { code: 'not_yet', variant, split: [], readyBy, emergencyUsed: mu(0), rebuildMonths: null };
}

/**
 * Months until the typical month could cover what unspent does not. null when the typical month leaves nothing.
 * M-04: beyond the simulation horizon is 'never', like buyLater.
 */
function readyMonth(month: MonthModel, price: number, unspent: number | null): Extract<ReadyBy, { kind: 'month' }> | null {
  const tl = month.typicalLeft;
  if (tl === null || tl <= 0) return null;
  const gap = Math.max(0, price - Math.max(0, unspent ?? 0));
  const n = Math.max(1, Number(ceilDivide(BigInt(gap), BigInt(tl))));
  if (n > SIMULATION_MONTH_CAP) return null;
  return { kind: 'month', month: addYearMonths(month.month, n) };
}

/** The one-off ladder on its own: month, own envelope, earlier unspent, emergency, else not covered. No cash check. */
function ladder(
  j: JudgeInput,
  p: Purchase,
  available: { readonly unspent: MinorUnits | null; readonly envelope: MinorUnits }
): OneOffPart {
  const P = p.dayOne;
  const { month } = j;
  const room = Math.max(0, month.monthLeft);
  const B = Math.min(P, room);
  const A = Math.min(P - B, Math.max(0, available.envelope));
  const rest = P - B - A;

  const split: FundingSegment[] = [];
  if (B > 0) split.push({ source: 'month', amount: mu(B) });
  if (A > 0) split.push({ source: 'envelope', amount: mu(A) });

  if (rest === 0) {
    return { code: A > 0 ? 'fits_unspent' : 'fits_month', variant: null, split, readyBy: null, emergencyUsed: mu(0), rebuildMonths: null };
  }

  const unspent = available.unspent;
  if (unspent === null) {
    return { code: 'needs_input', variant: null, split: [], readyBy: null, emergencyUsed: mu(0), rebuildMonths: null };
  }
  const earlierRoom = Math.max(0, unspent - B);
  if (rest <= earlierRoom) {
    split.push({ source: 'unspent_earlier', amount: mu(rest) });
    return { code: 'fits_unspent', variant: null, split, readyBy: null, emergencyUsed: mu(0), rebuildMonths: null };
  }

  if (mayUseEmergency(p)) {
    const fund = Math.max(0, j.funds.emergency ?? 0);
    if (rest <= earlierRoom + fund) {
      if (earlierRoom > 0) split.push({ source: 'unspent_earlier', amount: mu(earlierRoom) });
      const use = emergencyUse({ need: mu(rest - earlierRoom), fund: mu(fund), typicalLeft: month.typicalLeft });
      split.push({ source: 'emergency', amount: use.used });
      return { code: 'emergency_use', variant: null, split, readyBy: null, emergencyUsed: use.used, rebuildMonths: use.rebuildMonths };
    }
  }

  return notYet('not_covered', readyMonth(month, P, unspent));
}

/**
 * Cash check first, then the ladder. A dip until payday is not_yet, but "ready on payday" is only true when the ladder
 * would pass by then. When the ladder holds the price back too, the answer is the later of the two: the ladder's
 * month (not covered), or payday when payday falls after the start of that month. Without this a dearer price that
 * dips before payday was told "payday" while a cheaper one held back by the ladder alone got a later month (I13).
 */
export function oneOffPart(
  j: JudgeInput,
  available: { readonly unspent: MinorUnits | null; readonly envelope: MinorUnits }
): OneOffPart {
  const p = j.purchase;
  if (p === null) {
    return { code: 'needs_input', variant: null, split: [], readyBy: null, emergencyUsed: mu(0), rebuildMonths: null };
  }
  if (j.cash.kind === 'not_covered') {
    // The later of the ladder month and the next payday (I13 residual): never dated before the pay that would help.
    const ready = readyMonth(j.month, p.dayOne, available.unspent);
    const pay = j.cash.payDate ?? null;
    return notYet('not_covered', ready !== null && pay !== null && pay > `${ready.month}-01` ? { kind: 'date', date: pay } : ready);
  }
  const part = ladder(j, p, available);
  if (j.cash.kind === 'ok') return part;
  const until = j.cash.until;
  const onPayday = notYet('payday', { kind: 'date', date: until });
  if (part.code !== 'not_yet') return onPayday; // the ladder passes (or cannot tell): payday is the only wait
  const ready = readyMonth(j.month, p.dayOne, available.unspent);
  return ready !== null && until > `${ready.month}-01` ? onPayday : part;
}

export function monthlyPart(
  month: MonthModel,
  M: MinorUnits
): { readonly code: 'monthly_short' | 'fits_month'; readonly lowClause: boolean } | null {
  if (M === 0) return null;
  // No typical figure is unreachable here (needsInput asks for it first); stay on the cautious side if it ever happens.
  if (month.typicalLeft === null || month.typicalLeft - M < 0) return { code: 'monthly_short', lowClause: false };
  return { code: 'fits_month', lowClause: month.low !== null && month.low.left - M < 0 };
}

function unique<T>(xs: readonly T[]): T[] {
  return [...new Set(xs)];
}

function judgeNotices(j: JudgeInput): Notice[] {
  const out: Notice[] = [...j.month.notices];
  const em = emergencyOf(j.inputs.emergency).notice;
  if (em) out.push(em);
  const u = j.funds.unspent;
  if (u !== null && u.stale) out.push({ code: 'unspent_stale', values: { days: daysBetween(u.anchor.at, j.inputs.asOf) } });
  if (u !== null && u.drifted) out.push({ code: 'unspent_drifted', values: { suggested: j.funds.suggested } });
  if (j.month.reasons.includes('rough_figures_used')) out.push({ code: 'from_your_figures', values: {} });
  return out;
}

function judgeConfidence(j: JudgeInput): Confidence {
  let c = j.month.confidence;
  const u = j.funds.unspent;
  if (u !== null && u.stale) c = capConfidence(c, 'unspent_stale');
  if (u !== null && u.drifted) c = capConfidence(c, 'unspent_drifted', 'rough');
  if (j.month.reasons.includes('rough_figures_used')) c = capConfidence(c, 'rough_figures', 'rough');
  return c;
}

export function judge(j: JudgeInput): Result {
  const { month, funds } = j;
  const p = j.purchase;
  const notices = judgeNotices(j);
  const confidence = judgeConfidence(j);
  const reasons = unique([...month.reasons, ...j.purchaseReasons]);
  const band = p?.band ?? null;
  const layers = p?.layers ?? [];

  const missing = [...needsInput({ inputs: j.inputs, month, funds, purchase: p, purchaseMissing: j.purchaseMissing })];
  if (p === null && missing.length === 0) missing.push('no_price');

  const unspentValue = funds.unspent?.value ?? null; // always the user's confirmed (rolled) figure (D-30)
  const one = missing.length > 0 || p === null ? null : oneOffPart(j, { unspent: unspentValue, envelope: funds.ownEnvelope });

  if (one === null || one.code === 'needs_input') {
    return {
      code: 'needs_input',
      variant: null,
      legacyState: LEGACY_STATE_OF_CODE.needs_input,
      split: [],
      facts: j.purchaseFacts,
      notices,
      missing: missing.length > 0 ? missing : ['unspent_not_confirmed'],
      reasons,
      readyBy: null,
      band,
      layers,
      confidence,
      parts: { oneOff: 'needs_input', monthly: null },
    };
  }

  const purchase = p as Purchase;
  const mon = monthlyPart(month, purchase.monthly);
  const code = mon === null ? one.code : stricter(one.code, mon.code);
  const variant: Variant | null =
    one.code === 'not_yet' && code === 'not_yet'
      ? one.variant
      : (code === 'fits_month' || code === 'fits_unspent') && mon !== null && mon.lowClause
        ? 'low_month'
        : null;
  const readyBy = code === 'not_yet' ? one.readyBy : null;

  // Facts (fixed order): month, unspent, emergency, envelope, plan, low month, lines.
  const fromMonth = one.split.find((s) => s.source === 'month')?.amount ?? 0;
  const fromEarlier = one.split.find((s) => s.source === 'unspent_earlier')?.amount ?? 0;
  const fromEnvelope = one.split.find((s) => s.source === 'envelope')?.amount ?? 0;
  const facts: Fact[] = [];
  if (one.split.length > 0) {
    facts.push({ code: 'month_left_after', values: { month: month.month, left: month.monthLeft - fromMonth } });
  }
  // What would leave unspent if it were bought: this month and earlier money, never the envelope or the fund.
  const unspentAfter = unspentValue === null ? null : mu(unspentValue - (purchase.dayOne - fromEnvelope - one.emergencyUsed));
  if (one.split.length > 0 && unspentValue !== null) {
    facts.push({ code: 'unspent_before_after', values: { before: unspentValue, after: mu(unspentValue - fromMonth - fromEarlier) } });
  }
  if (one.emergencyUsed > 0) {
    facts.push({ code: 'emergency_used', values: one.rebuildMonths === null ? { used: one.emergencyUsed } : { used: one.emergencyUsed, months: one.rebuildMonths } });
  } else if (funds.emergency !== null) {
    facts.push({ code: 'emergency_untouched', values: { amount: funds.emergency } });
  }
  if (fromEnvelope > 0) facts.push({ code: 'envelope_used', values: { used: fromEnvelope, envelopeId: purchase.envelopeId } });
  facts.push(...j.purchaseFacts);
  if (variant === 'low_month' && month.low !== null) {
    // The low-month clause as a fact (v3 §12 #7, #22): the tight month, its leftover, and the monthly cost it cannot carry.
    facts.push({ code: 'low_month', values: { month: month.low.month, left: month.low.left, monthly: purchase.monthly } });
  }
  facts.push(
    ...evaluateLines(j.inputs.limits, {
      month,
      purchase,
      debts: j.inputs.debts,
      unspentAfter,
      isHousing: purchase.itemType === 'rent_bill' || purchase.itemType === 'property',
    })
  );

  const keepSplit = code === 'fits_month' || code === 'fits_unspent' || code === 'emergency_use' || (code === 'monthly_short' && one.code !== 'not_yet');

  return {
    code,
    variant,
    legacyState: LEGACY_STATE_OF_CODE[code],
    split: keepSplit ? one.split : [],
    facts,
    notices,
    missing: [],
    reasons,
    readyBy,
    band,
    layers,
    confidence,
    parts: { oneOff: one.code, monthly: mon === null ? null : mon.code },
  };
}
