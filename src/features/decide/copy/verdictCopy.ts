/**
 * Verdict copy (05-09 Task 2): state chip, title, body and basis marker from engine codes. Declarative voice only,
 * never prescriptive (DCU-09). Returns catalogue keys and formatted params; the screen calls `t()`.
 */
import type { Assessment, MissingReason, MoneyBasis, Verdict, VerdictState, Warning, WarningCode } from '@/engine/decide';
import type { UnconvertedNote } from '../snapshot/types';
import { MISSING_TITLE, UNEXPLAINED } from './codeMaps';
import { percentText } from './percentText';
import { ref } from './types';
import type { CopyRef, Fmt } from './types';

export type ChipTone = 'fits' | 'adjust' | 'no' | 'missing' | 'draft' | 'bought' | 'waiting' | 'passed';
export type ChipSurface = 'full' | 'quickCash' | 'quickCredit';

export function stateChip(
  state: VerdictState | 'draft' | 'bought' | 'waiting' | 'passed',
  surface: ChipSurface,
  reasons?: readonly MissingReason[],
): { key: string; tone: ChipTone } {
  switch (state) {
    case 'fits':
      return { key: 'decide.state.fits', tone: 'fits' };
    case 'adjust':
      return { key: 'decide.state.adjust', tone: 'adjust' };
    case 'no':
      return { key: surface === 'quickCash' ? 'decide.state.noCash' : surface === 'quickCredit' ? 'decide.state.noCredit' : 'decide.state.no', tone: 'no' };
    case 'missing':
      return { key: reasons?.some((r) => r.startsWith('card_')) ? 'decide.state.cardLimits' : 'decide.state.missing', tone: 'missing' };
    case 'draft':
      return { key: 'decide.state.draft', tone: 'draft' };
    case 'bought':
      return { key: 'decide.state.bought', tone: 'bought' };
    case 'waiting':
      return { key: 'decide.state.waiting', tone: 'waiting' };
    case 'passed':
      return { key: 'decide.state.passed', tone: 'passed' };
  }
}

export function findWarning(a: Pick<Assessment, 'warnings'>, code: WarningCode): Warning | undefined {
  return a.warnings.find((w) => w.code === code);
}

/** The cause behind a `no`, in assess.ts's precedence: empty cash, then the month, then a hard cash dip alone. */
export function noLead(a: Assessment): 'cash_empty' | 'month' | 'cash_dip' {
  if (a.cashAfter < 0) return 'cash_empty';
  if (findWarning(a, 'month')) return 'month';
  return 'cash_dip';
}

export const basisWordKey = (basis: 'average' | 'worst'): string => (basis === 'worst' ? 'decide.verdict.basisWorst' : 'decide.verdict.basisAverage');

/** Which of investing / saving the inv warning pauses. */
export function invKind(a: Pick<Assessment, 'investingAtRisk' | 'savingAtRisk'>): 'Investing' | 'Saving' | 'Both' {
  if (a.investingAtRisk > 0 && a.savingAtRisk > 0) return 'Both';
  return a.savingAtRisk > 0 ? 'Saving' : 'Investing';
}

type TitleFn = (a: Assessment, w: Warning, fmt: Fmt) => CopyRef;

// assess.ts sorts warnings by shortfall, so any code can lead an adjust verdict
export const ADJUST_TITLE = {
  month: (_a, w, fmt) => ref('decide.verdict.titleNoMonthShort', { short: fmt(w.shortfall) }), // unreachable for adjust, mapped for exhaustiveness
  cash: (_a, w, fmt) => ref('decide.verdict.titleCash', { amount: fmt(w.shortfall) }),
  cash_dip: (_a, w, fmt) => ref('decide.verdict.titleCashDip', { amount: fmt(w.shortfall) }),
  dsr: (a) =>
    a.debtServiceRatioAfter === null
      ? ref('decide.verdict.titleDsrNoIncome')
      : ref('decide.verdict.titleDsr', { pct: percentText(a.debtServiceRatioAfter) }),
  owe: () => ref('decide.verdict.titleOwe'),
  inv: (a, _w, fmt) => ref(`decide.verdict.titleInv${invKind(a)}`, { amount: fmt(a.pauseNeeded) }),
} as const satisfies Record<WarningCode, TitleFn>;

export function verdictTitle(verdict: Verdict, fmt: Fmt): CopyRef {
  if (verdict.state === 'missing') return ref(MISSING_TITLE[verdict.reasons[0] ?? 'no_full_month']);
  const a = verdict;
  if (a.state === 'fits') return ref('decide.verdict.titleFits', { left: fmt(a.left) });
  if (a.state === 'no') {
    const lead = noLead(a);
    if (lead === 'cash_empty') return ref('decide.verdict.titleNoEmptyCash');
    if (lead === 'month') {
      const month = findWarning(a, 'month');
      // IN-B07: never a zero-amount shortfall claim when the warning is unexpectedly missing.
      if (!month) return ref(UNEXPLAINED);
      const short = fmt(month.shortfall);
      if (a.context.leftBefore < 0) {
        return ref('decide.verdict.titleNoAlreadyShort', { already: fmt(-a.context.leftBefore), short }, { basis: basisWordKey(a.context.money.basis) });
      }
      return ref('decide.verdict.titleNoMonthShort', { short });
    }
    return ref('decide.verdict.titleNoCashDip');
  }
  const lead = a.warnings[0];
  // adjust always carries a warning; an empty list falls back to a plain line rather than throwing (IN-B07: no zero claim)
  if (!lead) return ref(UNEXPLAINED);
  return ADJUST_TITLE[lead.code](a, lead, fmt);
}

export function verdictBody(a: Assessment, fmt: Fmt): CopyRef {
  const income = fmt(a.context.money.incomeBasis);
  const out = fmt(a.monthTable.after.outgoings);
  if (a.state === 'fits') return ref('decide.verdict.bodyFits', { in: income, out });
  return ref('decide.verdict.bodyOther', { in: income, out }, { basis: basisWordKey(a.context.money.basis) });
}

export function basisMarker(
  args: { kind: 'logged' | 'first_read'; money: MoneyBasis | null; lastSeenBasis: 'logged_months' | 'first_read_rough_figures' | null },
  fmt: Fmt,
): CopyRef {
  if (args.kind === 'first_read' || args.money === null) return ref('decide.basis.firstRead');
  if (args.lastSeenBasis === 'first_read_rough_figures') return ref('decide.basis.nowLogged'); // D-04
  return ref(args.money.basis === 'worst' ? 'decide.basis.worst' : 'decide.basis.average', { amount: fmt(args.money.incomeBasis) });
}

/** D-37: an unconverted computation names the currency and shows no figure. */
export function missingRateCopy(note: UnconvertedNote): { chip: CopyRef; title: CopyRef; body: CopyRef; link: CopyRef } {
  const currency = note.currencies.join(', ');
  return {
    chip: ref('decide.missingRate.chip'),
    title: ref('decide.missingRate.title', { currency }),
    body: ref('decide.missingRate.body', { currency }),
    link: ref('decide.missingRate.link'),
  };
}
