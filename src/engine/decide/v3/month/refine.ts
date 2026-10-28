/**
 * Refine Decide: the check-in detector (05.2 D-12, D-20, D-21; UP §4.12). Pure: no clock, no I/O, no writes.
 *
 * refine() reads the stored setup answers and the records and reports whether the check-in is due and which cards to
 * show. It never applies anything (D-21): 05.3 writes only when the user chooses. Output is codes and integers only.
 *
 * Noise rule (owner OQ2, approved 2026-10-28): no value card is shown unless the suggested figure differs from the
 * current one by MORE than the noise, the largest of a floor, a percentage of the figure and the median absolute
 * deviation over the last REFINE_WINDOW_MONTHS months (see refineNoise).
 *
 * Known approximations, kept on purpose: the 'unspent' card compares the rolled-forward unspent figure with the sum of
 * the accounts stated as everyday or mixed (bills still due are not taken off); 'changing_income' is part of the
 * contract but is not emitted yet (D-20 lists no rule for it).
 */
import { minorUnits, type MinorUnits } from '../../../money/types';
import { minorFromBigInt } from '../../../payoff/types';
import {
  PAY_MATCH_DAYS,
  REFINE_CARD_UNPAID_STATEMENTS,
  REFINE_MIN_GAP_DAYS,
  REFINE_NOISE_MIN_MINOR,
  REFINE_NOISE_PCT,
  REFINE_OVERRIDE_MAX_DAYS,
  REFINE_OVERRIDE_MEDIAN_PCT,
  REFINE_PAY_STOPPED_MISSES,
  REFINE_REPEAT_COUNT,
  REFINE_ROUGH_MONTHS,
  REFINE_SETUP_MONTHS,
  REFINE_STEADY_ABOVE_MONTHS,
  REFINE_TYPED_OFF_MONTHS,
  REFINE_TYPED_OFF_PCT,
  REFINE_UNDERLOGGED_PCT,
  REFINE_WINDOW_MONTHS,
} from '../constants';
import { addDays, compareDates, daysBetween, yearMonthOf } from '../dates';
import { rollForward } from '../funds/unspent';
import type { LocalDate, V3Inputs, V3Line, YearMonth } from '../types';
import { liveSeriesOf, seriesDrift, seriesIndex, seriesOccurrences } from './series';
import { everydayByMonth, medianHalfUp } from './typical';

export type RefineTrigger = 'three_months' | 'rough_one_month' | 'typed_off' | 'new_repeating' | 'life_change';
export type RefineCardKind =
  | 'pay'
  | 'pay_stopped'
  | 'everyday'
  | 'everyday_override_expiring'
  | 'new_regular'
  | 'saving_bucket'
  | 'unspent'
  | 'changing_income'
  | 'steady_above_income'
  | 'series_drift'
  | 'card_not_paid_in_full'
  | 'under_logged_month';

export interface RefineCard {
  readonly kind: RefineCardKind;
  readonly ref: string | null; // series id, debt id, envelope id, candidate key or null
  readonly month: YearMonth | null; // under_logged_month only
  readonly current: MinorUnits | null; // what Decide uses now
  readonly suggested: MinorUnits | null; // what the records show
  readonly noise: MinorUnits | null; // the noise the change beat (value cards only)
}

export interface RefineInput {
  readonly inputs: V3Inputs;
  readonly setupDoneAt: LocalDate | null;
  readonly setupRough: boolean;
  readonly overrideAt: LocalDate | null;
  readonly lastAt: LocalDate | null;
  readonly snoozeUntil: LocalDate | null;
  readonly candidates: readonly { readonly key: string; readonly occurrences: number; readonly amount: MinorUnits }[];
  readonly cardStatements: readonly {
    readonly debtId: string;
    readonly statedPaysInFull: 'yes' | 'sometimes' | 'no' | null;
    readonly paidInFull: readonly boolean[];
  }[];
}

export interface RefineResult {
  readonly due: boolean;
  readonly triggers: readonly RefineTrigger[];
  readonly cards: readonly RefineCard[];
}

const FN = 'refine';
const NOT_DUE: RefineResult = { due: false, triggers: [], cards: [] };
const LIFE_CHANGE_KINDS: ReadonlySet<RefineCardKind> = new Set<RefineCardKind>([
  'pay',
  'pay_stopped',
  'everyday_override_expiring',
  'steady_above_income',
  'series_drift',
  'card_not_paid_in_full',
  'under_logged_month',
]);

const abs = (x: bigint): bigint => (x < 0n ? -x : x);
const cmp = (a: string, b: string): number => (a < b ? -1 : 1); // ids and keys are unique

/**
 * The noise a suggestion must beat (owner OQ2): the largest of the floor, REFINE_NOISE_PCT of the figure (rounded up)
 * and the median absolute deviation of the last REFINE_WINDOW_MONTHS window values (0 when fewer than 3).
 */
export function refineNoise(current: MinorUnits, window: readonly MinorUnits[]): MinorUnits {
  const pct = (abs(BigInt(current)) * BigInt(REFINE_NOISE_PCT) + 99n) / 100n;
  let noise = BigInt(REFINE_NOISE_MIN_MINOR) > pct ? BigInt(REFINE_NOISE_MIN_MINOR) : pct;
  const recent = window.slice(-REFINE_WINDOW_MONTHS).map((v) => BigInt(v));
  if (recent.length >= 3) {
    const med = medianHalfUp(recent);
    const mad = medianHalfUp(recent.map((v) => abs(v - med)));
    if (mad > noise) noise = mad;
  }
  return minorFromBigInt(noise, FN);
}

function valueCard(kind: RefineCardKind, ref: string | null, current: MinorUnits, suggested: bigint, window: readonly MinorUnits[]): RefineCard | null {
  const noise = refineNoise(current, window);
  if (abs(suggested - BigInt(current)) <= BigInt(noise)) return null;
  return { kind, ref, month: null, current, suggested: minorFromBigInt(suggested, FN), noise };
}

const codeCard = (kind: RefineCardKind, ref: string | null, current: MinorUnits | null = null): RefineCard => ({
  kind,
  ref,
  month: null,
  current,
  suggested: null,
  noise: null,
});

const byDateThenId = (a: V3Line, b: V3Line): number => (a.date !== b.date ? cmp(a.date, b.date) : cmp(a.id, b.id));

export function refine(input: RefineInput): RefineResult {
  const { inputs } = input;
  const asOf = inputs.asOf;

  // D-12: at most once a month, and "Later" hides it for a while.
  if (input.snoozeUntil !== null && compareDates(asOf, input.snoozeUntil) < 0) return NOT_DUE;
  if (input.lastAt !== null && daysBetween(input.lastAt, asOf) < REFINE_MIN_GAP_DAYS) return NOT_DUE;

  const currentMonth = yearMonthOf(asOf);
  const past = inputs.months.filter((m) => m.full && m.month < currentMonth).slice().sort((a, b) => cmp(a.month, b.month));
  const cards: RefineCard[] = [];

  // Everyday history: marked months out, then months that look under-logged (same rule as the typical month).
  const everyday = everydayByMonth(past, inputs.series);
  const unmarked = everyday.filter((m) => m.mark !== 'out' && m.mark !== 'half');
  const underLogged = (m: (typeof unmarked)[number]): boolean => {
    if (m.mark === 'normal') return false;
    const others = unmarked.filter((o) => o.month !== m.month);
    if (others.length === 0) return false;
    const med = medianHalfUp(others.map((o) => BigInt(o.everyday)));
    return BigInt(m.everyday) * 100n < med * BigInt(REFINE_UNDERLOGGED_PCT);
  };
  const kept = unmarked.filter((m) => !underLogged(m));
  const used = kept.slice(-REFINE_WINDOW_MONTHS);
  const usedValues = used.map((m) => m.everyday);
  const typical = used.length > 0 ? medianHalfUp(used.map((m) => BigInt(m.everyday))) : null;

  // Paid lines per series, oldest first.
  const paid = new Map<string, V3Line[]>();
  for (const m of inputs.months) {
    for (const l of m.lines) {
      if (l.status !== 'paid' || l.seriesId === null) continue;
      const list = paid.get(l.seriesId);
      if (list === undefined) paid.set(l.seriesId, [l]);
      else list.push(l);
    }
  }
  for (const list of paid.values()) list.sort(byDateThenId);
  const linesOf = (id: string): readonly V3Line[] => paid.get(id) ?? [];

  // pay, pay_stopped
  const pays = liveSeriesOf(inputs.series, asOf, 'pay').slice().sort((a, b) => cmp(a.id, b.id));
  const payCards: RefineCard[] = [];
  const stoppedCards: RefineCard[] = [];
  for (const s of pays) {
    const lines = linesOf(s.id);
    if (lines.length >= REFINE_REPEAT_COUNT) {
      const last = lines.slice(-REFINE_REPEAT_COUNT).map((l) => BigInt(l.amount));
      const card = valueCard('pay', s.id, s.amount, medianHalfUp(last), lines.map((l) => l.amount).slice(-REFINE_WINDOW_MONTHS));
      if (card !== null) payCards.push(card);
    }
    const due = seriesOccurrences(s, s.anchorDate, asOf, asOf).filter((d) => addDays(d, PAY_MATCH_DAYS) < asOf);
    const lastDue = due.slice(-REFINE_PAY_STOPPED_MISSES);
    if (
      lines.length > 0 &&
      lastDue.length === REFINE_PAY_STOPPED_MISSES &&
      lastDue.every((d) => !lines.some((l) => Math.abs(daysBetween(d, l.date)) <= PAY_MATCH_DAYS))
    ) {
      stoppedCards.push(codeCard('pay_stopped', s.id, s.amount));
    }
  }
  cards.push(...payCards, ...stoppedCards);

  // everyday, everyday_override_expiring
  const override = inputs.everydayOverride;
  let everydayCard: RefineCard | null = null;
  if (override !== null && typical !== null) everydayCard = valueCard('everyday', null, override, typical, usedValues);
  if (everydayCard !== null) cards.push(everydayCard);
  else if (override !== null) {
    const old = input.overrideAt !== null && daysBetween(input.overrideAt, asOf) > REFINE_OVERRIDE_MAX_DAYS;
    const moved = typical !== null && abs(typical - BigInt(override)) * 100n > BigInt(override) * BigInt(REFINE_OVERRIDE_MEDIAN_PCT);
    if (old || moved) cards.push(codeCard('everyday_override_expiring', null, override));
  }

  // unspent: the rolled figure against the accounts that hold everyday money
  const accounts = (inputs.accounts ?? []).filter((a) => a.use !== null && (a.use.kind === 'everyday' || a.use.kind === 'mixed'));
  if (inputs.unspent !== null && accounts.length > 0) {
    const rolled = rollForward({
      anchor: inputs.unspent,
      asOf,
      months: inputs.months,
      series: inputs.series,
      e: typical === null ? null : minorFromBigInt(typical, FN),
    }).value;
    const sum = accounts.reduce((t, a) => t + BigInt(a.balance), 0n);
    const card = valueCard('unspent', null, rolled, sum, []);
    if (card !== null) cards.push(card);
  }

  // steady_above_income: the typed steady amount is above recorded income in each of the last months
  const steady = inputs.profile === null ? null : inputs.profile.steady;
  if (steady !== null && past.length >= REFINE_STEADY_ABOVE_MONTHS) {
    const incomes = past.map((m) => minorUnits(m.lines.reduce((t, l) => (l.status === 'paid' && l.role === 'income' ? t + l.amount : t), 0)));
    const recent = incomes.slice(-REFINE_STEADY_ABOVE_MONTHS);
    if (recent.every((v) => v < steady)) {
      const lowest = incomes.slice(-3).reduce((lo, v) => (v < lo ? v : lo));
      const card = valueCard('steady_above_income', null, steady, BigInt(lowest), incomes);
      if (card !== null) cards.push(card);
    }
  }

  // series_drift (a pay is left to the pay card)
  const index = seriesIndex(inputs.series);
  for (const d of seriesDrift(inputs.series, inputs.months)) {
    const s = index.get(d.seriesId);
    if (s === undefined || s.role === 'pay') continue;
    const card = valueCard('series_drift', d.seriesId, d.current, BigInt(d.suggested), linesOf(d.seriesId).map((l) => l.amount));
    if (card !== null) cards.push(card);
  }

  // card_not_paid_in_full
  for (const c of input.cardStatements.slice().sort((a, b) => cmp(a.debtId, b.debtId))) {
    if (c.statedPaysInFull !== 'yes') continue;
    const tail = c.paidInFull.slice(-REFINE_CARD_UNPAID_STATEMENTS);
    if (tail.length === REFINE_CARD_UNPAID_STATEMENTS && tail.every((p) => !p)) cards.push(codeCard('card_not_paid_in_full', c.debtId));
  }

  // new_regular
  for (const c of input.candidates.slice().sort((a, b) => cmp(a.key, b.key))) {
    if (c.occurrences >= REFINE_REPEAT_COUNT) cards.push({ ...codeCard('new_regular', c.key), suggested: c.amount });
  }

  // saving_bucket
  for (const e of inputs.envelopes.slice().sort((a, b) => cmp(a.id, b.id))) {
    if (e.bucket !== true || e.monthlyAmount === null) continue;
    const card = e.target === null ? null : valueCard('saving_bucket', e.id, e.saved, BigInt(e.target), []);
    cards.push(card ?? codeCard('saving_bucket', e.id, e.saved));
  }

  // under_logged_month: the newest one, once
  const newestLow = unmarked.filter(underLogged).pop();
  if (newestLow !== undefined) cards.push({ ...codeCard('under_logged_month', null), month: newestLow.month });

  // triggers
  const triggers: RefineTrigger[] = [];
  const baseline = input.lastAt ?? input.setupDoneAt;
  if (baseline !== null) {
    const since = past.filter((m) => m.month > yearMonthOf(baseline)).length;
    if (input.setupRough) {
      if (since >= REFINE_ROUGH_MONTHS) triggers.push('rough_one_month');
    } else if (since >= REFINE_SETUP_MONTHS) triggers.push('three_months');
  }
  if (everydayCard !== null && override !== null) {
    const lastTwo = kept.slice(-REFINE_TYPED_OFF_MONTHS);
    const off = lastTwo.every((m) => abs(BigInt(m.everyday) - BigInt(override)) * 100n > BigInt(override) * BigInt(REFINE_TYPED_OFF_PCT));
    if (lastTwo.length === REFINE_TYPED_OFF_MONTHS && off) triggers.push('typed_off');
  }
  if (cards.some((c) => c.kind === 'new_regular')) triggers.push('new_repeating');
  if (cards.some((c) => LIFE_CHANGE_KINDS.has(c.kind))) triggers.push('life_change');

  if (triggers.length === 0) return NOT_DUE;
  return { due: true, triggers, cards };
}
