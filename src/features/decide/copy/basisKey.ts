/**
 * D-107: the one place that maps a Basis to its catalogue key. 'average' and 'worst' share a sentence with a {{basis}}
 * word; 'month' has its own sentence ("This month is ... overspent"), so nothing ever reads "your this month month".
 * Each table is a Record over Basis, so a fourth basis fails to compile here rather than reading as 'average'.
 */
import type { Basis, HistoryBasis } from '@/engine/decide';

const WORD: Record<HistoryBasis, string> = {
  average: 'decide.verdict.basisAverage',
  worst: 'decide.verdict.basisWorst',
};
const MARKER: Record<Basis, string> = {
  average: 'decide.basis.average',
  worst: 'decide.basis.worst',
  month: 'decide.basis.month',
};
const CLOSES: Record<Basis, string> = {
  average: 'decide.section.monthClosesAverage',
  worst: 'decide.section.monthClosesWorst',
  month: 'decide.section.monthClosesMonth',
};

/** The {{basis}} word for the history bases. */
export const basisWordKey = (basis: HistoryBasis): string => WORD[basis];

/** The key to use for a basis: the Month-suffixed variant for 'month', the shared one otherwise. */
export const basisVariantKey = (key: string, basis: Basis): string => (basis === 'month' ? `${key}Month` : key);

/** The {{basis}} keyParams for a sentence that names the history basis; none for 'month', whose sentence names itself. */
export const basisKeyParams = (basis: Basis): Record<string, string> | undefined =>
  basis === 'month' ? undefined : { basis: WORD[basis] };

export const basisMarkerKey = (basis: Basis): string => MARKER[basis];

export const monthClosesKey = (basis: Basis): string => CLOSES[basis];
