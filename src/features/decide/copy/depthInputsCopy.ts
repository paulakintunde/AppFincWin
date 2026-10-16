/**
 * 05-37 (part 2): depth inputs copy. Rates only from the user's list (04 D-07); projections always captioned 'not a forecast' (D-31).
 * Codes and numbers in, CopyRef out. Integer and bigint maths only; no `t()`, no React.
 */
import type {
  EstimateBias,
  ExpectedIncomeOutcome,
  IncomeAtRiskReport,
  InvestmentViews,
  LateFeeCost,
  Percent,
  PromoOutcome,
  RateFigure,
  RunningCostCategory,
  StressOutcome,
} from '@/engine/decide';
import type { LossOfValueEntry, PromoInput } from '../snapshot/types';
import { percentText } from './percentText';
import { stateChip } from './verdictCopy';
import { ref } from './types';
import type { CopyRef, Fmt } from './types';

const D = 'decide.depth.';
const MINUS = '−';

// ── Credit terms (D-30, D-42, D-53, D-54) ──

export interface PromoCopy {
  summary: CopyRef | null;
  results: CopyRef[];
  /** D-42: the deferred-interest toggle shows once the typed promotional rate parses to 0. */
  showDeferredToggle: boolean;
  /** D-42: the step 3 notice, only when the engine reports `deferred_interest_charged`. */
  notice: { title: CopyRef; body: CopyRef } | null;
}

/** True when the typed rate text is a zero (at least one digit, every digit 0). */
function isZeroRate(text: string): boolean {
  const s = text.trim().replace(',', '.');
  return /^0*\.?0*$/.test(s) && /\d/.test(s);
}

export function promoCopy(
  promo: PromoInput | null,
  afterAprText: string,
  outcome: PromoOutcome | null,
  balanceAtEnd: number | null,
  fmt: Fmt,
  fmtCents: Fmt,
): PromoCopy {
  const rate = promo?.aprText.trim() ?? '';
  const months = promo?.months ?? null;
  const summary =
    promo && rate !== '' && months !== null && months > 0 ? ref(`${D}credit.promoSummary`, { rate, months, after: afterAprText.trim() }) : null;
  const showDeferredToggle = promo !== null && isZeroRate(promo.aprText);
  if (!outcome) return { summary, results: [], showDeferredToggle, notice: null };

  const results: CopyRef[] = [ref(`${D}credit.clearInPromo`, { amount: fmtCents(outcome.paymentToClearInPromo) })];
  if (outcome.paymentAfterPromo !== null) results.push(ref(`${D}credit.afterPromo`, { amount: fmtCents(outcome.paymentAfterPromo) }));
  if (outcome.clearsBeforePromoEnd) results.push(ref(`${D}credit.clearsBefore`));
  else if (balanceAtEnd !== null) results.push(ref(`${D}credit.leftWhenEnds`, { amount: fmt(balanceAtEnd) }));
  if (outcome.interestAfterPromo !== null) results.push(ref(`${D}credit.interestAfter`, { amount: fmt(outcome.interestAfterPromo) }));
  results.push(ref(`${D}credit.highestPayment`, { amount: fmtCents(outcome.highestMonthlyPayment) }));

  let notice: PromoCopy['notice'] = null;
  if (outcome.deferredInterestCode === 'deferred_interest_charged') {
    const amount = fmt(outcome.deferredInterestCharged);
    results.push(ref(`${D}credit.deferredCharged`, { amount }));
    notice = { title: ref(`${D}credit.deferredNoticeTitle`), body: ref(`${D}credit.deferredNoticeBody`, { months: outcome.promoMonths, amount }) };
  }
  return { summary, results, showDeferredToggle, notice };
}

const STRESS_KEY: Readonly<Record<string, string>> = { '2': 'stress2', '4': 'stress4' };

/** D-49: one line per stress outcome (+2 and +4 points) with its state chip key. Unknown offsets are left out. */
export function stressCopy(stress: readonly StressOutcome[], _fmt: Fmt, fmtCents: Fmt): { line: CopyRef; stateKey: string }[] {
  const out: { line: CopyRef; stateKey: string }[] = [];
  for (const s of stress) {
    const key = STRESS_KEY[percentText(s.offset)];
    if (key) out.push({ line: ref(`${D}credit.${key}`, { amount: fmtCents(s.monthly) }), stateKey: stateChip(s.state, 'full').key });
  }
  return out;
}

/** D-50: the late-fee lines, or none. */
export function lateFeeCopy(lateFees: LateFeeCost | null, _fmt: Fmt, fmtCents: Fmt): CopyRef[] {
  if (!lateFees) return [];
  return [ref(`${D}credit.late1`, { amount: fmtCents(lateFees.oneLate) }), ref(`${D}credit.late2`, { amount: fmtCents(lateFees.twoLate) })];
}

// ── Investing instead (D-31, D-44, D-47) ──

export interface InvestRowCopy {
  label: CopyRef;
  figure: CopyRef;
  caption: CopyRef;
}
export interface InvestSectionCopy {
  title: CopyRef;
  rows: InvestRowCopy[];
}
export interface InvestViewCopy {
  price: InvestSectionCopy;
  payments: InvestSectionCopy;
  pause: InvestSectionCopy & { none: CopyRef | null };
  netWorth: { title: CopyRef; rows: { label: CopyRef; alt: CopyRef; caption: CopyRef }[] };
}

/** D-44: net rate text from the signed scaled figure, bigint only; below 0 reads with U+2212. */
function netRateText(scaled: bigint): string {
  return scaled < 0n ? `${MINUS}${percentText(-scaled as Percent)}` : percentText(scaled as Percent);
}

export function investViewCopy(views: InvestmentViews, fmt: Fmt, rateLabel: (rate: Percent) => string = percentText): InvestViewCopy {
  const hasFee = views.holdingFee > 0n;
  const fee = percentText(views.holdingFee);
  const isZero = (i: number): boolean => (views.rates[i]?.rate ?? 0n) === 0n;

  const label = (i: number): CopyRef => {
    const rate = views.rates[i]?.rate ?? (0n as Percent);
    if (hasFee) return ref(`${D}invest.rateNet`, { rate: rateLabel(rate), net: netRateText(views.netRates[i]?.netRateScaled ?? 0n) });
    return isZero(i) ? ref(`${D}invest.zero`) : ref(`${D}invest.rateChip`, { rate: rateLabel(rate) });
  };
  const caption = (i: number): CopyRef => {
    if (hasFee) {
      if (isZero(i)) return ref(`${D}invest.captionZeroFee`, { fee });
      return ref(`${D}invest.captionFee`, { fee });
    }
    return ref(isZero(i) ? `${D}invest.captionZero` : `${D}invest.caption`);
  };
  const rows = (figures: readonly RateFigure[], pick: (f: RateFigure) => MinorOrNull, line: (value: string) => CopyRef): InvestRowCopy[] =>
    figures.map((f, i) => {
      const value = pick(f);
      return { label: label(i), figure: f.rangeCode !== null || value === null ? ref(`${D}invest.tooLarge`) : line(fmt(value)), caption: caption(i) };
    });

  const months = views.horizonMonths;
  const payments = views.paymentsInvested;
  const pause = views.pauseImpact;
  return {
    price: {
      title: ref(`${D}invest.priceTitle`),
      rows: rows(views.priceInvested.byRate, (f) => f.projected, (value) => ref(`${D}invest.priceLine`, { amount: fmt(views.priceInvested.lump), months, value })),
    },
    payments: {
      title: ref(`${D}invest.paymentsTitle`),
      rows: rows(
        payments.byRate,
        (f) => f.projected,
        (value) => ref(`${D}invest.paymentsLine`, { amount: fmt(payments.firstMonthPayment + payments.monthlyRunning), months, value }),
      ),
    },
    pause: {
      title: ref(`${D}invest.pauseTitle`),
      rows: pause ? rows(pause.byRate, (f) => f.growth, (value) => ref(`${D}invest.pauseLine`, { amount: fmt(pause.pausedMonthly), months, value })) : [],
      none: pause ? null : ref(`${D}invest.pauseNone`),
    },
    netWorth: {
      title: ref(`${D}invest.netWorthTitle`),
      rows: views.netWorth.map((path, i) => {
        const rate = rateLabel(path.rate);
        const withEnd = path.withPurchase[months] ?? null;
        const withoutEnd = path.withoutPurchase[months] ?? null;
        const tooLarge = path.rangeCode !== null || withEnd === null || withoutEnd === null;
        return {
          label: label(i),
          alt: tooLarge
            ? ref(`${D}invest.netWorthAltTooLarge`, { months, rate })
            : ref(`${D}invest.netWorthAlt`, { months, with: fmt(withEnd), without: fmt(withoutEnd), rate }),
          caption: caption(i),
        };
      }),
    },
  };
}
type MinorOrNull = number | null;

// ── Income, runway, running costs (D-32, D-33, D-36, D-44) ──

/** D-53: the 'with the expected income' line; null with no outcome. */
export function expectedIncomeCopy(outcome: ExpectedIncomeOutcome | null, fmt: Fmt): CopyRef | null {
  if (!outcome) return null;
  const params = { amount: fmt(outcome.monthlyAmount) };
  const keyParams = { likelihood: `${D}income.likelihood.${outcome.likelihood}`, state: `${D}income.state.${outcome.assessment.state}` };
  if (outcome.payback.months === null) return ref(`${D}income.lineNever`, { ...params, months: outcome.payback.horizonMonths }, keyParams);
  return ref(`${D}income.line`, { ...params, months: outcome.payback.months }, keyParams);
}

export interface RunwayCopy {
  summary: CopyRef | null;
  lostLine: CopyRef | null;
  perSetback: { code: string; line: CopyRef }[];
}

export function runwayCopy(report: IncomeAtRiskReport): RunwayCopy {
  const lost = report.runwayLost;
  const showLost = lost !== null && lost > 0;
  return {
    summary: showLost && report.runwayWith !== null ? ref(`${D}runway.summary`, { months: report.runwayWith, lost }) : null,
    lostLine: showLost ? ref(`${D}runway.lost`, { months: lost }) : null,
    perSetback: report.setbacks.map((s) => ({ code: s.code, line: ref(s.paymentsMet ? `${D}runway.met` : `${D}runway.notMet`) })),
  };
}

/** D-33/D-44: a running-cost prompt row; loss of value is a non-cash entry. */
export function runningPromptCopy(category: RunningCostCategory): { label: CopyRef; note: CopyRef | null; entry: 'cash' | 'loss_of_value' } {
  const lossOfValue = category === 'loss_of_value';
  return { label: ref(`${D}running.${category}`), note: lossOfValue ? ref(`${D}running.notCash`) : null, entry: lossOfValue ? 'loss_of_value' : 'cash' };
}

/** D-44 (04 D-63): the loss-of-value row. `nonCash` is the engine's `running.nonCash`. */
export function lossOfValueCopy(
  entry: LossOfValueEntry | null,
  nonCash: number | null,
  fmt: Fmt,
): { modes: CopyRef[]; placeholder: CopyRef; note: CopyRef; about: CopyRef | null } {
  return {
    modes: [ref(`${D}running.lossMonth`), ref(`${D}running.lossPercent`)],
    placeholder: ref(entry?.kind === 'percent_per_year' ? `${D}running.lossPercentPlaceholder` : `${D}running.addAmount`),
    note: ref(`${D}running.notCash`),
    about: entry !== null && nonCash !== null && nonCash !== 0 ? ref(`${D}running.lossAbout`, { amount: fmt(nonCash) }) : null,
  };
}

const GAP_KEY = { running_costs: 'running', monthly_payment: 'payment', day_one: 'dayOne' } as const;

/** D-36: 'about N% higher / lower', whole percent half-up from basis points with integer maths; absent at null or 0. */
export function estimateGapCopy(bias: EstimateBias): CopyRef | null {
  const bp = bias.biasBasisPoints;
  if (bp === null) return null;
  const pct = Math.floor((Math.abs(bp) + 50) / 100);
  if (pct === 0) return null;
  return ref(`${D}estimateGap.${GAP_KEY[bias.figure]}`, { pct }, { direction: `${D}estimateGap.${bp > 0 ? 'higher' : 'lower'}` });
}

// ── Savings goal and dated changes (D-34, D-27) ──

export interface GoalLike {
  target: number | null;
  monthly_amount: number | null;
  ready_by: string | null;
}

export function goalCopy(
  goal: GoalLike,
  saved: number | null,
  fmt: Fmt,
  formatDate: (date: string) => string,
): { caption: CopyRef; preview: CopyRef; written: CopyRef } {
  const target = fmt(goal.target ?? 0);
  const amount = fmt(goal.monthly_amount ?? 0);
  const dated = goal.ready_by !== null;
  const params: Record<string, string> = dated ? { target, amount, date: formatDate(goal.ready_by as string) } : { target, amount };
  return {
    caption: saved === null ? ref(`${D}goal.waitingRate`) : ref(`${D}goal.caption`, { saved: fmt(saved), target }),
    preview: ref(dated ? `${D}goal.preview` : `${D}goal.previewNoDate`, params),
    written: ref(dated ? `${D}goal.written` : `${D}goal.writtenNoDate`, params),
  };
}

export interface ChangeLike {
  kind: 'income' | 'spending';
  name: string | null;
  monthly_amount: number;
  start_month: string;
  end_month: string | null;
}

/** D-27: a dated change row. The name is the user's own text, or a catalogue ref when nameless. */
export function changeRowCopy(
  change: ChangeLike,
  fmt: Fmt,
  monthLabel: (month: string) => string,
): { name: string | CopyRef; from: CopyRef; until: CopyRef | null } {
  const name = change.name?.trim();
  const amount = change.monthly_amount;
  return {
    name: name ? name : ref(change.kind === 'income' ? `${D}changes.unnamedIncome` : `${D}changes.unnamedSpending`),
    from: ref(`${D}changes.rowFrom`, { sign: amount < 0 ? MINUS : '+', amount: fmt(amount < 0 ? -amount : amount), month: monthLabel(change.start_month) }),
    until: change.end_month !== null ? ref(`${D}changes.rowUntil`, { month: monthLabel(change.end_month) }) : null,
  };
}
