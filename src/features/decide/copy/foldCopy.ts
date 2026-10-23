/**
 * 05-64 (D-74, UI-SPEC R2 fold table): the ten step 3 folds' title keys, their ⓘ keys and one-line previews. Pure: keys
 * and params only, no t(), no React. A preview is a CopyRef or a short list joined with " · " by `joinPreview`.
 */
import type { LedgerDirection } from '@/engine/decide';
import type { InfoKey } from './infoTerms';
import { ref, type CopyRef } from './types';

export type SectionKey =
  | 'whatBreaks'
  | 'month'
  | 'cashPath'
  | 'whereItLands'
  | 'setbacks'
  | 'options'
  | 'ifInvested'
  | 'income'
  | 'whoPays'
  | 'assumptions';

/** UI-SPEC R2 order. */
export const FOLD_ORDER: readonly SectionKey[] = [
  'whatBreaks',
  'month',
  'cashPath',
  'whereItLands',
  'setbacks',
  'options',
  'ifInvested',
  'income',
  'whoPays',
  'assumptions',
];

const T = 'decide.fold.title.';
const P = 'decide.fold.preview.';

export const FOLD_TITLE: Record<SectionKey, string> = {
  whatBreaks: `${T}whatBreaks`,
  month: `${T}month`,
  cashPath: `${T}cashPath`,
  whereItLands: `${T}whereItLands`,
  setbacks: `${T}setbacks`,
  options: `${T}workIt`,
  ifInvested: `${T}invest`,
  income: `${T}income`,
  whoPays: `${T}who`,
  assumptions: `${T}assumptions`,
};

export const FOLD_INFO: Partial<Record<SectionKey, InfoKey>> = {
  whatBreaks: 'whatBreaks',
  cashPath: 'cashPath',
  whereItLands: 'whereItLands',
  setbacks: 'setbacks',
  ifInvested: 'ifInvested',
  income: 'incomeChange',
};

/** R2 fold 7 on investment checks (D-82): the title and ⓘ differ. */
export const FOLD_TITLE_INVEST: Partial<Record<SectionKey, string>> = { ifInvested: `${T}grow` };
export const FOLD_INFO_INVEST: Partial<Record<SectionKey, InfoKey>> = { ifInvested: 'expectedReturn' };

export type Preview = CopyRef | readonly CopyRef[];

const SEPARATOR = ' · ';

/** Joins a preview with " · "; a part that already opens with the separator (the edge suffix) is appended as is. */
export function joinPreview(t: (key: string, params?: Record<string, string | number>) => string, preview: Preview): string {
  const parts = Array.isArray(preview) ? (preview as readonly CopyRef[]) : [preview as CopyRef];
  let out = '';
  for (const r of parts) {
    const params: Record<string, string | number> = { ...(r.params ?? {}) };
    for (const [name, key] of Object.entries(r.keyParams ?? {})) params[name] = t(key);
    const text = t(r.key, params);
    out = out === '' ? text : text.startsWith(SEPARATOR) ? out + text : out + SEPARATOR + text;
  }
  return out;
}

/** Fold 1: lines that break, plus the edge flag. */
export function whatBreaksPreview(count: number, edge: boolean): Preview {
  if (count <= 0) return ref(`${P}${edge ? 'nothingBreaksEdge' : 'nothingBreaks'}`);
  const base = ref(`${P}whatBreaks`, { count });
  return edge ? [base, ref(`${P}edgeSuffix`)] : base;
}

/** Fold 2. */
export function monthPreview(now: string, after: string): Preview {
  return ref(`${P}month`, { now, after });
}

/** Fold 3: the lowest cash point with the purchase, or null without a recurring pay series. */
export function cashPathPreview(lowest: { amount: string; date: string } | null): Preview {
  return lowest ? ref('decide.fold.cashPath.preview', { amount: lowest.amount, date: lowest.date }) : ref('decide.fold.cashPath.unavailablePreview');
}

/** Fold 4: zero parts are left out; all same reads "No ledger moves". */
export function whereItLandsPreview(ledgers: readonly { direction: LedgerDirection }[]): Preview {
  const count = (d: LedgerDirection) => ledgers.filter((l) => l.direction === d).length;
  const parts: CopyRef[] = [];
  const better = count('better');
  const worse = count('worse');
  const same = count('same');
  if (better > 0) parts.push(ref(`${P}landsBetter`, { count: better }));
  if (worse > 0) parts.push(ref(`${P}landsWorse`, { count: worse }));
  if (better === 0 && worse === 0) return ref(`${P}noMoves`);
  if (same > 0) parts.push(ref(`${P}landsSame`, { count: same }));
  return parts;
}

/** Fold 5: runway with the purchase and the months lost; null runway is not limited. */
export function setbacksPreview(runwayWith: number | null, lost: number | null): Preview {
  if (runwayWith === null || lost === null || lost <= 0) return ref(`${P}setbacksNone`);
  return ref(`${P}setbacks`, { count: runwayWith, less: lost });
}

/** Fold 6. */
export function optionsPreview(count: number): Preview {
  return ref(`${P}options`, { count });
}

export interface ProjectionFigures {
  fv: string;
  months: number;
  /** The rate, formatted without the percent sign. */
  rate: string;
}

/** Fold 7 on purchase checks. */
export function ifInvestedPreview(projection: ProjectionFigures | null): Preview {
  return projection ? ref(`${P}investWithRate`, { fv: projection.fv, count: projection.months, rate: projection.rate }) : ref(`${P}investIdle`);
}

/** Fold 7 on investment checks (D-82): 'outOfRange' is the D-47 too-large case. */
export function investPreview(projection: ProjectionFigures | 'outOfRange' | null): Preview {
  if (projection === null) return ref('decide.fold.noReturn.preview');
  if (projection === 'outOfRange') return ref('decide.alt.reasonTooLarge');
  return ref('decide.fold.investPreview', { fv: projection.fv, count: projection.months, rate: projection.rate });
}

/** Fold 8. */
export function incomePreview(state: 'fits' | 'adjust' | 'no', amount: string): Preview {
  const word = state === 'fits' ? 'incomeFits' : state === 'adjust' ? 'incomeAdjust' : 'incomeNo';
  return ref(`${P}income`, { amount }, { state: `${P}${word}` });
}

/** Fold 9. */
export function whoPaysPreview(count: number): Preview {
  return ref(`${P}who`, { count });
}

/** Fold 10. */
export function assumptionsPreview(count: number): Preview {
  return ref(`${P}assumptions`, { count });
}
