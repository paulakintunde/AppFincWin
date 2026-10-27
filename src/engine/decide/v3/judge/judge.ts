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
import { ceilDivide, minorFromBigInt } from '../../../payoff/types';
import { CODE_PRECEDENCE, LEGACY_STATE_OF_CODE, MISSING_PRIORITY, RECONFIRM_MIN_MONTHS } from '../constants';
import { addYearMonths, daysBetween, yearMonthOf } from '../dates';
import type { CashCheck } from '../cash/path';
import { emergencyOf, emergencyUse, mayUseEmergency } from '../funds/emergency';
import { capConfidence } from '../month/confidence';
import { dependsOnMonths, expectedFor, isLeanMonth, leanRun, seasonEveryday } from '../month/incomePattern';
import { seasonalReadyMonth } from '../month/seasonWalk';
import type {
  Code,
  ExpectedMonthIncome,
  IncomePicture,
  LowMonth,
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
 * Months until the month could cover what unspent does not. null when it never could. M-04: beyond the simulation horizon
 * is 'never', like buyLater. A seasonal earner's date is walked from last year's pattern, month by month (D-60); anyone
 * else's is the gap over the typical month.
 */
function readyMonth(month: MonthModel, price: number, unspent: number | null): Extract<ReadyBy, { kind: 'month' }> | null {
  const gap = Math.max(0, price - Math.max(0, unspent ?? 0));
  const pic = month.incomePicture;
  if (pic !== undefined && pic.treated === 'seasonal') {
    const walked = seasonalReadyMonth(pic, month.month, BigInt(gap));
    return walked === null ? null : { kind: 'month', month: walked.month };
  }
  const tl = month.typicalLeft;
  if (tl === null || tl <= 0) return null;
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

/** What the monthly part of a purchase needs beyond the month model (D-36, D-37). */
export interface MonthlyCtx {
  readonly asOf: string;
  readonly purchase: Purchase;
  readonly available: MinorUnits | null;
  readonly takenByOneOff: MinorUnits;
  readonly expected: readonly ExpectedMonthIncome[];
}

export type MonthlyCode = 'monthly_short' | 'fits_month' | 'fits_unspent' | 'not_yet' | 'needs_input';

export interface MonthlyPart {
  readonly code: MonthlyCode;
  readonly lowClause: boolean;
  /** lean_bridge: set when unspent money carries the monthly gap (D-37, D-46). */
  readonly bridge: Fact | null;
  /** lean_months_judged (seasonal) or low_month_judged (gig): which months were judged (D-46). */
  readonly why: Fact | null;
  readonly readyBy: ReadyBy | null;
  readonly reasons: readonly ReasonCode[];
}

const monthly = (code: MonthlyCode, over: Partial<MonthlyPart> = {}): MonthlyPart => ({
  code,
  lowClause: false,
  bridge: null,
  why: null,
  readyBy: null,
  reasons: [],
  ...over,
});

/** The steady rule, and the rule for any earner with no pattern information (I23). */
function steadyMonthly(month: MonthModel, M: MinorUnits): MonthlyPart {
  // No typical figure is unreachable here (needsInput asks for it first); stay on the cautious side if it ever happens.
  if (month.typicalLeft === null || month.typicalLeft - M < 0) return monthly('monthly_short');
  return monthly('fits_month', { lowClause: month.low !== null && month.low.left - M < 0 });
}

/** D-37: the months the payment touches, from the first payment's month when there is a schedule. */
function planMonthsOf(ctx: MonthlyCtx): readonly string[] {
  const all = dependsOnMonths(ctx.asOf, ctx.purchase.schedule, ctx.purchase.runningMonthly);
  if (ctx.purchase.schedule === null) return all;
  const first = yearMonthOf(ctx.purchase.schedule.firstDate);
  const kept = all.filter((ym) => ym >= first);
  return kept.length > 0 ? kept : all;
}

/**
 * D-36, D-37. A seasonal earner's monthly part is judged against what is left in every lean month it touches; a gig or
 * other variable earner's against the low month. When that falls short, the shortfall for each lean month to carry is a
 * bridge: unspent money (after the one-off part and money held back) covers it, or the answer is not yet. The fund is
 * never used here (D-43a, D-63).
 * Branch point for D-48 (the volatile income question, 05.1-50): between step 1 and step 2 below.
 */
function leanMonthly(month: MonthModel, M: MinorUnits, pic: IncomePicture, ctx: MonthlyCtx): MonthlyPart {
  const planMonths = planMonthsOf(ctx);
  const seasonal = pic.treated === 'seasonal';
  const Mb = BigInt(M);
  const leftBy = new Map<string, bigint>();
  if (seasonal) {
    for (const ym of planMonths) {
      const expected = expectedFor(pic, ctx.expected, ym);
      const everyday = seasonEveryday(pic, ym) ?? month.e;
      if (expected === null || everyday === null) return monthly('needs_input');
      leftBy.set(ym, BigInt(expected.amount) - BigInt(month.recurringBills) - BigInt(everyday) - BigInt(month.setAside));
    }
  } else if (month.low === null) {
    return steadyMonthly(month, M);
  }
  const leftOf = (ym: string): bigint => leftBy.get(ym) as bigint;

  let leanLeft: bigint;
  let carried: readonly string[];
  let why: Fact;
  if (seasonal) {
    const records = pic.fullMonths >= RECONFIRM_MIN_MONTHS;
    const picked = planMonths.filter((ym) => (records ? isLeanMonth(pic, ym) : leftOf(ym) < Mb));
    const lean = picked.length > 0 ? picked : planMonths;
    leanLeft = lean.map(leftOf).reduce((a, b) => (b < a ? b : a));
    if (records) {
      const run = leanRun(pic, planMonths);
      const start = planMonths.findIndex((ym) => isLeanMonth(pic, ym));
      carried = run > 0 ? planMonths.slice(start, start + run) : planMonths.filter((ym) => leftOf(ym) < Mb);
    } else {
      carried = lean;
    }
    why = {
      code: 'lean_months_judged',
      values: { from: lean[0] as string, to: lean[lean.length - 1] as string, leanLeft: minorFromBigInt(leanLeft, 'monthlyPart') },
    };
  } else {
    const low = month.low as LowMonth;
    leanLeft = BigInt(low.left);
    const count = pic.months.filter((m) => BigInt(m.left) < Mb).length;
    const toCarry = Math.max(1, Math.min(planMonths.length, count));
    carried = Array.from({ length: toCarry }, (_, i) => addYearMonths(planMonths[0] as string, i));
    why = { code: 'low_month_judged', values: { month: low.month, left: low.left } };
  }

  // Step 1 (D-36): what is left in the lean months covers the payment.
  if (leanLeft - Mb >= 0n) return monthly('fits_month', { why, reasons: seasonal ? ['lean_months_used'] : [] });

  // Step 2 (D-37): the shortfall in every lean month to carry is a bridge paid from unspent money.
  const shortfall = Mb - leanLeft;
  const toCarry = carried.length;
  const bridge = shortfall * BigInt(toCarry);
  if (ctx.available === null) return monthly('needs_input');
  const used = BigInt(ctx.takenByOneOff);
  const afterOneOff = BigInt(ctx.available) - used;
  if (afterOneOff >= bridge) {
    return monthly('fits_unspent', {
      why,
      bridge: {
        code: 'lean_bridge',
        values: {
          monthly: M,
          leanLeft: minorFromBigInt(leanLeft, 'monthlyPart'),
          shortfall: minorFromBigInt(shortfall, 'monthlyPart'),
          months: toCarry,
          until: carried[toCarry - 1] as string,
          bridge: minorFromBigInt(bridge, 'monthlyPart'),
          after: minorFromBigInt(afterOneOff - bridge, 'monthlyPart'),
        },
      },
    });
  }
  // Step 3: not covered. Ready when unspent plus the months ahead reach the one-off part and the bridge.
  return monthly('not_yet', { why, readyBy: readyMonth(month, minorFromBigInt(used + bridge, 'monthlyPart'), ctx.available) });
}

/**
 * The monthly part (I23, D-36, D-37). Without `ctx`, or for a steady earner, the typical month decides: typicalLeft - M < 0
 * is monthly_short; lowLeft - M < 0 fits with the low-month clause.
 */
export function monthlyPart(month: MonthModel, M: MinorUnits, ctx?: MonthlyCtx): MonthlyPart | null {
  if (M === 0) return null;
  const pic = month.incomePicture;
  if (ctx === undefined || pic === undefined || pic.treated === 'steady') return steadyMonthly(month, M);
  return leanMonthly(month, M, pic, ctx);
}

function unique<T>(xs: readonly T[]): T[] {
  return [...new Set(xs)];
}

/** D-59: the one place a missing list is ordered. */
function inPriority(codes: readonly MissingCode[]): MissingCode[] {
  return [...codes].sort((a, b) => MISSING_PRIORITY.indexOf(a) - MISSING_PRIORITY.indexOf(b));
}

function judgeNotices(j: JudgeInput, missing: readonly MissingCode[]): Notice[] {
  const out: Notice[] = [...j.month.notices];
  const em = emergencyOf(j.inputs.emergency).notice;
  if (em) out.push(em);
  const u = j.funds.unspent;
  if (u !== null && u.stale) out.push({ code: 'unspent_stale', values: { days: daysBetween(u.anchor.at, j.inputs.asOf) } });
  if (u !== null && u.drifted) out.push({ code: 'unspent_drifted', values: { suggested: j.funds.suggested } });
  if (j.month.reasons.includes('rough_figures_used')) out.push({ code: 'from_your_figures', values: {} });
  const f = j.funds;
  // D-49, D-54: an envelope linked to no account is taken to sit inside the spending money.
  if ((f.envelopesAssumedInside ?? 0) > 0) out.push({ code: 'envelope_location_assumed', values: { count: f.envelopesAssumedInside as number } });
  // D-50: money above what the records explain.
  if (missing.includes('unexplained_money_question')) out.push({ code: 'unexplained_money', values: { amount: f.unexplained as number } });
  // D-54, D-62: the account question first; the fund question only once every account has a stated use.
  const unstated = f.unstatedAccounts ?? [];
  if (unstated.length > 0) {
    out.push({ code: 'account_use_unknown', values: { accountId: unstated[0] as string, count: unstated.length } });
  } else if (unstated.length === 0 && f.fundUnlinked === true) {
    out.push({ code: 'fund_account_unknown', values: { amount: f.emergency ?? 0 } });
  }
  // D-58: a past pay with no matching line. The first unanswered one is asked; each one answered "not yet" is counted missed.
  const unseen = j.month.unseenPay ?? [];
  const unanswered = unseen.find((p) => p.arrived === null);
  if (unanswered !== undefined) {
    out.push({ code: 'pay_not_seen', values: { amount: unanswered.amount, date: unanswered.date } });
  }
  for (const p of unseen) if (p.arrived === false) out.push({ code: 'pay_counted_missed', values: { amount: p.amount, date: p.date } });
  return out;
}

function judgeConfidence(j: JudgeInput): Confidence {
  let c = j.month.confidence;
  const u = j.funds.unspent;
  if (u !== null && u.stale) c = capConfidence(c, 'unspent_stale');
  if (u !== null && u.drifted) c = capConfidence(c, 'unspent_drifted', 'rough');
  if (j.month.reasons.includes('rough_figures_used')) c = capConfidence(c, 'rough_figures', 'rough');
  // D-58: a pay counted as missed is a careful answer that still works, so the figure is a rough one.
  if ((j.month.unseenPay ?? []).some((p) => p.arrived === false)) c = capConfidence(c, 'pay_missed', 'rough');
  return c;
}

/** A comparable key: a date, or the first of a month. null (never) sorts last. */
function readyKey(r: ReadyBy | null): string {
  if (r === null) return '9999-99-99';
  return r.kind === 'date' ? r.date : `${r.month}-01`;
}

export function judge(j: JudgeInput): Result {
  const { month, funds } = j;
  const p = j.purchase;
  const confidence = judgeConfidence(j);
  const reasons = unique([...month.reasons, ...j.purchaseReasons]);
  const band = p?.band ?? null;
  const layers = p?.layers ?? [];

  const missing = [...needsInput({ inputs: j.inputs, month, funds, purchase: p, purchaseMissing: j.purchaseMissing })];
  if (p === null && missing.length === 0) missing.push('no_price');
  const notices = judgeNotices(j, missing);

  // D-38: every check judges against available unspent money, the confirmed figure less money held back for earlier
  // plans. Drift and staleness (judgeNotices, judgeConfidence) stay on the confirmed figure (D-30).
  const unspentValue = funds.unspent === null ? null : (funds.unspent.available ?? funds.unspent.value);
  const one = missing.length > 0 || p === null ? null : oneOffPart(j, { unspent: unspentValue, envelope: funds.ownEnvelope });

  const asking = (parts: Result['parts'], ask: readonly MissingCode[]): Result => ({
    code: 'needs_input',
    variant: null,
    legacyState: LEGACY_STATE_OF_CODE.needs_input,
    split: [],
    facts: j.purchaseFacts,
    notices,
    missing: inPriority(ask.length > 0 ? ask : ['unspent_not_confirmed']), // D-59
    reasons,
    readyBy: null,
    band,
    layers,
    confidence,
    parts,
  });

  if (one === null || one.code === 'needs_input') return asking({ oneOff: 'needs_input', monthly: null }, missing);

  const purchase = p as Purchase;
  const fromMonth = one.split.find((s) => s.source === 'month')?.amount ?? 0;
  const fromEarlier = one.split.find((s) => s.source === 'unspent_earlier')?.amount ?? 0;
  const fromEnvelope = one.split.find((s) => s.source === 'envelope')?.amount ?? 0;
  const mon = monthlyPart(month, purchase.monthly, {
    asOf: j.inputs.asOf,
    purchase,
    available: unspentValue === null ? null : mu(unspentValue),
    takenByOneOff: mu(fromMonth + fromEarlier),
    expected: j.inputs.expectedIncome ?? [],
  });
  if (mon !== null && mon.code === 'needs_input') return asking({ oneOff: one.code, monthly: 'needs_input' }, []);

  const code = mon === null ? one.code : stricter(one.code, mon.code);
  const lowClause = mon !== null && mon.lowClause;
  const variant: Variant | null = code === 'not_yet' ? null : (code === 'fits_month' || code === 'fits_unspent') && lowClause ? 'low_month' : null;
  // When both parts are not yet, the later ready-by leads; ties go to the one-off part (D-36).
  let notYetVariant: Variant | null = null;
  let readyBy: ReadyBy | null = null;
  if (code === 'not_yet') {
    const monthlyLeads = mon !== null && mon.code === 'not_yet' && (one.code !== 'not_yet' || readyKey(mon.readyBy) > readyKey(one.readyBy));
    notYetVariant = monthlyLeads ? 'not_covered' : one.variant;
    readyBy = monthlyLeads ? (mon as MonthlyPart).readyBy : one.readyBy;
  }

  // Facts (fixed order): month, unspent, held back, emergency, envelope, plan, low month, why months, bridge, lines.
  const facts: Fact[] = [];
  if (one.split.length > 0) {
    facts.push({ code: 'month_left_after', values: { month: month.month, left: month.monthLeft - fromMonth } });
  }
  // What would leave unspent if it were bought: this month and earlier money, never the envelope or the fund.
  const unspentAfter = unspentValue === null ? null : mu(unspentValue - (purchase.dayOne - fromEnvelope - one.emergencyUsed));
  if (one.split.length > 0 && unspentValue !== null) {
    facts.push({ code: 'unspent_before_after', values: { before: unspentValue, after: mu(unspentValue - fromMonth - fromEarlier) } });
  }
  // D-38, D-46: money held back for an earlier plan is said once, next to the unspent figure it reduced.
  const heldBack = funds.unspent?.breakdown.heldBack ?? 0;
  if (heldBack > 0) facts.push({ code: 'unspent_held_back', values: { amount: heldBack } });
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
  if (mon !== null && mon.why !== null) facts.push(mon.why); // D-46
  if (mon !== null && mon.bridge !== null) facts.push(mon.bridge); // D-46
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
    variant: code === 'not_yet' ? notYetVariant : variant,
    legacyState: LEGACY_STATE_OF_CODE[code],
    split: keepSplit ? one.split : [],
    facts,
    notices,
    missing: [],
    reasons: mon === null ? reasons : unique([...reasons, ...mon.reasons]),
    readyBy,
    band,
    layers,
    confidence,
    parts: { oneOff: one.code, monthly: mon === null ? null : mon.code },
  };
}
