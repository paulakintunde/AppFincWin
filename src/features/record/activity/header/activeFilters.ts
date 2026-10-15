// Active-filter helpers for the Activity header (D-57 badge count, D-65 chip models,
// D-67 Clear all). Pure and React-free; kept out of engine/ on purpose (coverage gate).
import type { TFunction } from 'i18next';
import { EMPTY_FILTER, type ActivityFilter } from '@/engine/activity';

export type FilterKind = 'category' | 'account' | 'amount' | 'direction';

export interface FilterChipModel {
  kind: FilterKind;
  label: string;
}

export interface ChipLabelDeps {
  /** '' when the id is unknown or deleted. */
  categoryName: (id: string) => string;
  /** '' when the id is unknown or deleted. */
  accountName: (id: string) => string;
  formatAmount: (minor: number) => string;
  t: TFunction;
}

const hasAmount = (f: ActivityFilter): boolean => f.amountMin !== null || f.amountMax !== null;

/** D-57: category, account, amount (min and/or max as one) and direction. Unpaid is never counted. */
export function countActiveFilters(f: ActivityFilter): number {
  let n = 0;
  if (f.categoryIds !== null) n += 1;
  if (f.accountIds !== null) n += 1;
  if (hasAmount(f)) n += 1;
  if (f.direction !== 'all') n += 1;
  return n;
}

/** First selected name, plus "+N" when more are selected; unknown ids fall back to a generic label. */
function firstPlus(
  ids: readonly string[],
  nameOf: (id: string) => string,
  fallbackKey: 'activity.filter.category' | 'activity.filter.account',
  t: TFunction
): string {
  const first = ids[0];
  const name = first === undefined ? '' : nameOf(first);
  if (name === '') return t(fallbackKey);
  if (ids.length > 1) return t('activity.filterChip.more', { label: name, count: ids.length - 1 });
  return name;
}

function categoryLabel(ids: readonly (string | null)[], deps: ChipLabelDeps): string {
  const { t } = deps;
  if (ids.length === 1 && ids[0] === null) return t('record.sheet.uncategorised');
  const named = ids.filter((id): id is string => id !== null);
  return firstPlus(named, deps.categoryName, 'activity.filter.category', t);
}

function amountLabel(f: ActivityFilter, deps: ChipLabelDeps): string {
  const { t, formatAmount } = deps;
  if (f.amountMin !== null && f.amountMax !== null) {
    return t('activity.filterChip.amountRange', {
      min: formatAmount(f.amountMin),
      max: formatAmount(f.amountMax),
    });
  }
  if (f.amountMin !== null) return t('activity.filterChip.amountMin', { amount: formatAmount(f.amountMin) });
  return t('activity.filterChip.amountMax', { amount: formatAmount(f.amountMax as number) });
}

/** D-65: chips in the order category, account, amount, direction. Unpaid has no chip (D-66). */
export function filterChipModels(f: ActivityFilter, deps: ChipLabelDeps): FilterChipModel[] {
  const out: FilterChipModel[] = [];
  if (f.categoryIds !== null) out.push({ kind: 'category', label: categoryLabel(f.categoryIds, deps) });
  if (f.accountIds !== null) {
    out.push({
      kind: 'account',
      label: firstPlus(f.accountIds, deps.accountName, 'activity.filter.account', deps.t),
    });
  }
  if (hasAmount(f)) out.push({ kind: 'amount', label: amountLabel(f, deps) });
  if (f.direction !== 'all') {
    out.push({ kind: 'direction', label: deps.t(`activity.filter.${f.direction}`) });
  }
  return out;
}

/** Clears one filter kind; every other field (including Unpaid) is untouched. */
export function clearOne(f: ActivityFilter, kind: FilterKind): ActivityFilter {
  switch (kind) {
    case 'category':
      return { ...f, categoryIds: null };
    case 'account':
      return { ...f, accountIds: null };
    case 'amount':
      return { ...f, amountMin: null, amountMax: null };
    case 'direction':
      return { ...f, direction: 'all' };
  }
}

/** D-67: Clear all clears every non-Unpaid filter and keeps unpaidOnly as it was. */
export function clearAllExceptUnpaid(f: ActivityFilter): ActivityFilter {
  return { ...EMPTY_FILTER, unpaidOnly: f.unpaidOnly };
}
