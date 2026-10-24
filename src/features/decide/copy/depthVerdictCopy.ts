/**
 * 05-37 (part 2): depth verdict copy. Codes and numbers in, CopyRef out. Barrel types only.
 * Every key lives under `decide.depth.*` (05-31). No `t()`, no React, no float maths: half-months stay integers and the
 * rate text comes from displayRate's string maths.
 */
import type { CashPathReport, CashTightFact, Confidence, Decision, LineMargin, Steadiness } from '@/engine/decide';
import { displayRate } from '@/data/queries/fxConvert';
import type { CardLimitRateNote, ConversionNote, ProvisionalNote } from '../snapshot/types';
import { ref } from './types';
import type { CopyRef, Fmt } from './types';

const D = 'decide.depth.';

export type MonthName = (month: string) => string; // 'YYYY-MM' -> the month's display name
export type FormatDate = (date: string) => string; // 'YYYY-MM-DD' -> display date

const appliedCount = (decision: Pick<Decision, 'stacked'>): number => decision.stacked.filter((s) => s.status === 'applied').length;

/** D-24: the combined difference line, when standalone and combined verdicts differ. n = applied stacked checks. */
export function combinedLine(decision: Pick<Decision, 'combinedDiffers' | 'standalone' | 'stacked'>): CopyRef | null {
  if (!decision.combinedDiffers || !decision.standalone) return null;
  const count = appliedCount(decision);
  return ref(decision.standalone.state === 'fits' ? `${D}combined.differs` : `${D}combined.differsFromAdjust`, { count });
}

/** D-29: the worst-month line, only when the worst month differs from now and falls short. */
export function worstMonthLine(decision: Pick<Decision, 'worstMonth'>, fmt: Fmt, monthName: MonthName): CopyRef | null {
  const w = decision.worstMonth;
  if (!w || !w.differsFromNow || w.shortfall <= 0) return null;
  return ref(`${D}changes.worstMonth`, { month: monthName(w.month), amount: fmt(w.shortfall) });
}

/** The verdict body's first line: the combined line wins; the worst-month line then moves to the basis row. */
export function verdictLineOne(decision: Pick<Decision, 'combinedDiffers' | 'standalone' | 'stacked' | 'worstMonth'>, fmt: Fmt, monthName: MonthName): CopyRef | null {
  return combinedLine(decision) ?? worstMonthLine(decision, fmt, monthName);
}

/** D-37: one conversion item for one currency, a joined one for several (the earliest rate date). */
function conversionItem(conversions: readonly ConversionNote[], formatDate: FormatDate): CopyRef | null {
  const first = conversions[0];
  if (!first) return null;
  if (conversions.length === 1) {
    return ref(`${D}currency.basis`, { currency: first.currency, rate: displayRate(first.rateText), date: formatDate(first.rateDate) });
  }
  const earliest = conversions.reduce((min, c) => (c.rateDate < min ? c.rateDate : min), first.rateDate);
  return ref(`${D}currency.basisMany`, { currencies: conversions.map((c) => c.currency).join(', '), date: formatDate(earliest) });
}

/** D-69: past lines converted at the latest stored rate while their own rate is pending. */
export function provisionalItem(note: ProvisionalNote | null | undefined, formatDate: FormatDate): CopyRef | null {
  if (!note) return null;
  return ref(`${D}currency.provisional`, { count: note.rowCount, date: formatDate(note.rateDate) });
}

export interface BasisArgs {
  decision: Pick<Decision, 'combinedDiffers' | 'standalone' | 'stacked' | 'worstMonth' | 'verdict'>;
  conversions: readonly ConversionNote[];
  /** D-69: SnapshotResult.provisional; absent or null = none. */
  provisional?: ProvisionalNote | null;
  /** D-91: SnapshotResult.basisNotes; the card-limit rate note adds an item and has no confidence effect. Absent = none. */
  basisNotes?: readonly CardLimitRateNote[];
  cardsWithoutMinimum: number;
  fmt: Fmt;
  monthName: MonthName;
  formatDate: FormatDate;
}

/** D-24/D-27/D-29/D-37/D-40/D-69: the one ' · '-joined basis detail row, in the UI-SPEC priority. */
export function basisDetailItems(args: BasisArgs): CopyRef[] {
  const { decision, conversions, provisional, basisNotes, cardsWithoutMinimum, fmt, monthName, formatDate } = args;
  const items: CopyRef[] = [];
  // the worst-month line moves here only when the combined line holds line one
  if (combinedLine(decision)) {
    const worst = worstMonthLine(decision, fmt, monthName);
    if (worst) items.push(worst);
  }
  const verdict = decision.verdict;
  const codes = 'basisCodes' in verdict ? verdict.basisCodes : [];
  if (codes.includes('one_offs_excluded') && 'context' in verdict) {
    items.push(ref(`${D}oneOff.basis`, { count: verdict.context.money.oneOffsExcluded.count }));
  }
  const conversion = conversionItem(conversions, formatDate);
  if (conversion) items.push(conversion);
  const provisionalLine = provisionalItem(provisional, formatDate);
  if (provisionalLine) items.push(provisionalLine);
  const limitNote = basisNotes?.find((n) => n.kind === 'card_limit_rate');
  if (limitNote) items.push(ref('decide.pay.cardLimitBasis', { date: formatDate(limitNote.date) }));
  if (codes.includes('cash_path_unavailable')) items.push(ref(`${D}cashPath.basisUnavailable`));
  if (cardsWithoutMinimum > 0) items.push(ref(`${D}cardMin.basis`));
  return items;
}

/** Half-months (integer) as '3', '4.5', '6'. */
export function monthsText(halves: number): string {
  return `${halves >> 1}${halves % 2 ? '.5' : ''}`;
}

export interface CushionContext {
  limits: { reserveHalfMonths: number | null };
  money: { steadiness: Steadiness };
}

/** D-25: why the cushion is the size it is. */
export function cushionCopy(context: CushionContext): CopyRef {
  const halves = context.limits.reserveHalfMonths;
  if (halves === null) return ref(`${D}cushion.ownLine`);
  const steadiness = context.money.steadiness;
  if (steadiness === 'insufficient') return ref(`${D}cushion.reasonInsufficient`, { months: monthsText(halves) });
  return ref(`${D}cushion.reason`, { months: monthsText(halves) }, { because: `${D}cushion.because.${steadiness}` });
}

export interface TightArgs {
  fact: CashTightFact | null;
  stackedApplied: number;
  formatDate: FormatDate;
}

/** D-59: the fact behind a tight cash path; the stacked wording when other open checks are applied. */
export function cashTightFactCopy(fact: CashTightFact | null, stackedApplied: number, fmt: Fmt, formatDate: FormatDate): CopyRef | null {
  if (!fact) return null;
  return ref(stackedApplied > 0 ? `${D}cashPath.tightFactStacked` : `${D}cashPath.tightFact`, { date: formatDate(fact.date), amount: fmt(fact.amount) });
}

const isTightEdge = (m: LineMargin): boolean => m.line === 'cash_path' && m.margin === 0 && m.flag === 'on_edge';

/** D-25/D-26: 'holds by' / 'misses by'; a cash_path margin of 0 on the edge reads as the D-59 fact when there is one. */
export function marginText(margin: LineMargin, fmt: Fmt, tight: TightArgs | null = null): CopyRef {
  if (isTightEdge(margin) && tight?.fact) {
    const fact = cashTightFactCopy(tight.fact, tight.stackedApplied, fmt, tight.formatDate);
    if (fact) return fact;
  }
  const amount = fmt(margin.margin >= 0 ? margin.margin : -margin.margin);
  return ref(margin.margin >= 0 ? `${D}edge.holdsBy` : `${D}edge.missesBy`, { amount });
}

/**
 * True when any line of the decision sits on the edge (D-43) and the verdict is not already a no. "On the edge" says a
 * passing or adjustable plan has a thin margin; beside "Doesn't fit right now" it contradicts the verdict, so the tag is
 * suppressed here, in the copy layer. The engine's margin flags are unchanged.
 */
export function edgeOn(decision: Pick<Decision, 'margins' | 'verdict'>): boolean {
  return decision.verdict.state !== 'no' && decision.margins.some((m) => m.flag === 'on_edge');
}

export interface EdgeA11y {
  /** `edge.chipA11y`, or `edge.chipA11yFact` when `fact` is set. */
  label: CopyRef;
  /** The D-59 fact wording; the screen translates it and passes the text as the label's `fact` param. */
  fact: CopyRef | null;
}

/** The edge chip's spoken label: the first on-edge line and its margin, or the tight fact for the cash path case. */
export function edgeChipA11y(stateWord: string, decision: Pick<Decision, 'margins' | 'stacked' | 'verdict'>, fmt: Fmt, formatDate: FormatDate): EdgeA11y {
  const margin = decision.margins.find((m) => m.flag === 'on_edge');
  // IN-B07: with no on-edge margin there is no amount to name, so none is claimed.
  if (!margin) return { label: ref(`${D}edge.chipA11yPlain`, { state: stateWord }), fact: null };
  const verdict = decision.verdict;
  const tightFact = 'cashPath' in verdict && verdict.cashPath.status === 'available' ? verdict.cashPath.tightBeforePayday : null;
  if (isTightEdge(margin) && tightFact) {
    const fact = cashTightFactCopy(tightFact, appliedCount(decision), fmt, formatDate);
    if (fact) return { label: ref(`${D}edge.chipA11yFact`, { state: stateWord }), fact };
  }
  const amount = fmt(margin.margin >= 0 ? margin.margin : -margin.margin);
  return { label: ref(`${D}edge.chipA11y`, { state: stateWord, amount }, { line: `${D}edge.line.${margin.line}` }), fact: null };
}

/** D-28: the chip label key for a confidence level. */
export function confidenceCopy(level: Confidence['level']): CopyRef {
  return ref(`${D}confidence.${level}`);
}

export interface ConfidenceFacts {
  fullMonths: number;
  steadiness: Steadiness | null;
  oneOffs: number;
  conversions: readonly Pick<ConversionNote, 'currency'>[];
}

/** D-28: the reasons sheet rows, from engine reason codes plus builder facts. */
export function confidenceReasons(confidence: Confidence, facts: ConfidenceFacts): CopyRef[] {
  const rows: CopyRef[] = [ref(`${D}confidence.fullMonths`, { count: facts.fullMonths })];
  if (facts.steadiness && facts.steadiness !== 'insufficient') rows.push(ref(`${D}confidence.${facts.steadiness}`));
  if (confidence.reasons.includes('first_read')) rows.push(ref(`${D}confidence.firstRead`));
  if (confidence.reasons.includes('under_3_full_months')) rows.push(ref(`${D}confidence.under3`));
  if (confidence.reasons.includes('under_6_full_months')) rows.push(ref(`${D}confidence.under6`));
  if (facts.oneOffs > 0) rows.push(ref(`${D}oneOff.basis`, { count: facts.oneOffs }));
  for (const c of facts.conversions) rows.push(ref(`${D}confidence.converted`, { currency: c.currency }));
  if (confidence.reasons.includes('provisional_rates')) rows.push(ref(`${D}confidence.provisional`));
  return rows;
}

export type CashPathCopy =
  | { available: true; summary: CopyRef; textAlt: CopyRef }
  | { available: false };

/** D-44: the day-by-day section's summary line and text alternative, or the unavailable prompt. */
export function cashPathCopy(report: CashPathReport, fmt: Fmt, formatDate: FormatDate): CashPathCopy {
  if (report.status === 'unavailable') {
    // D-74: the section renders its own unavailable preview, body and link (decide.fold.cashPath.*)
    return { available: false };
  }
  const { lowestWith, lowestWithout } = report;
  return {
    available: true,
    summary: ref(`${D}cashPath.summary`, { amount: fmt(lowestWith.amount), date: formatDate(lowestWith.date) }),
    textAlt: ref(`${D}cashPath.textAlt`, {
      amount: fmt(lowestWith.amount),
      date: formatDate(lowestWith.date),
      amountWithout: fmt(lowestWithout.amount),
      dateWithout: formatDate(lowestWithout.date),
    }),
  };
}

/** D-37: one Assumptions row per converted currency. */
export function conversionBasisCopy(notes: readonly ConversionNote[], formatDate: FormatDate): CopyRef[] {
  return notes.map((n) => ref(`${D}currency.assumption`, { currency: n.currency, rate: displayRate(n.rateText), date: formatDate(n.rateDate) }));
}
