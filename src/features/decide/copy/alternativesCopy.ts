/**
 * Alternatives copy (05-09 Task 3): suppression reasons, the cheaper row's descriptor and the Kept header.
 * Declarative one-liners only (DCU-06, D-07).
 */
import { ZERO_PERCENT } from '@/engine/decide';
import type { AlternativeRow, Alternatives, PurchaseCheck, SuppressionCode } from '@/engine/decide';
import { percentText } from './percentText';
import { ref } from './types';
import type { CopyRef, Fmt } from './types';

export const SUPPRESSION_REASON = {
  month_short: 'decide.alt.reasonMonthShort',
  too_thin: 'decide.alt.reasonTooThin',
  nothing_freed: 'decide.alt.reasonNothingFreed',
  past_horizon: 'decide.alt.reasonPastHorizon',
  nothing_spare: 'decide.alt.reasonNothingSpare',
} as const satisfies Record<SuppressionCode, string>;

/** The one-line amber reason for a row, or null when the row shows its figures. A row never has two reasons (D-47). */
export function suppressionReason(row: AlternativeRow, alts: Pick<Alternatives, 'monthsToBuy' | 'horizonMonths'>, fmt: Fmt): CopyRef | null {
  const s = row.suppression;
  if (!s) return row.rangeCode === 'exceeds_range' ? ref('decide.alt.reasonTooLarge') : null;
  const amount = fmt(s.amount ?? 0);
  switch (s.code) {
    case 'month_short':
      return row.code === 'cheaper'
        ? ref('decide.alt.reasonMonthShortCheaper', { amount })
        : ref(SUPPRESSION_REASON.month_short, { amount });
    case 'too_thin':
      return ref(SUPPRESSION_REASON.too_thin, { amount });
    case 'nothing_freed':
      return ref(SUPPRESSION_REASON.nothing_freed);
    case 'past_horizon':
      return ref(SUPPRESSION_REASON.past_horizon, { count: alts.monthsToBuy ?? 0, horizon: alts.horizonMonths });
    case 'nothing_spare':
      return ref(SUPPRESSION_REASON.nothing_spare);
  }
}

/** The cheaper row's description: a loan scales the deposit, an instalment plan scales the instalments (04 HI-03). */
export function cheaperDescriptor(alts: Pick<Alternatives, 'cheaperPrice'>, check: PurchaseCheck, fmt: Fmt, methodName: string): CopyRef {
  const price = fmt(alts.cheaperPrice);
  if (check.payment.method === 'loan') return ref('decide.alt.descCheaper', { price });
  if (check.payment.method === 'instalment') return ref('decide.alt.descCheaperInstalments', { price });
  return ref('decide.alt.descCheaperPlain', { price, method: methodName });
}

/** The Kept column header: plain at 0%, with the first user rate otherwise (D-07). */
export function keptHeader(alts: Pick<Alternatives, 'projectionReturn'>): CopyRef {
  return alts.projectionReturn === ZERO_PERCENT
    ? ref('decide.alt.kept')
    : ref('decide.alt.keptRate', { rate: percentText(alts.projectionReturn) });
}
