// REC-27, D-06, D-08: when the entry sheet may guess a category from the description, and when a
// correction becomes an offer of a personal rule. Pure; the sheet owns the state and the timer.
import { RULE_KEYWORD_MAX, normaliseRuleKeyword } from '@/engine/categorize';
import type { Direction, EntryMode } from './transactionForm';

/** Where the sheet's current category came from. Only 'empty' and 'suggested' may be re-guessed. */
export type CategoryOrigin = 'empty' | 'suggested' | 'picked' | 'stored';

export function initialOrigin(mode: EntryMode): CategoryOrigin {
  if (mode.kind === 'edit-transfer') return 'stored';
  if (mode.kind === 'edit') return mode.row.category_id ? 'stored' : 'empty';
  return mode.prefill?.categoryId ? 'stored' : 'empty';
}

export function applyGuess(
  current: string | null,
  origin: CategoryOrigin,
  guessed: string | null
): { categoryId: string | null; origin: CategoryOrigin } {
  if (origin === 'picked' || origin === 'stored') return { categoryId: current, origin };
  if (guessed !== null) return { categoryId: guessed, origin: 'suggested' };
  if (origin === 'suggested') return { categoryId: null, origin: 'empty' };
  return { categoryId: current, origin };
}

export interface RuleOffer {
  keyword: string;
  keywordNorm: string;
  categoryId: string;
}

export function ruleOfferFor(input: {
  previousOrigin: CategoryOrigin;
  previousCategoryId: string | null;
  pickedCategoryId: string | null;
  description: string;
  direction: Direction;
  /** Every live personal rule, whatever its category: one keyword can have only one personal rule. */
  personalRules: readonly { keywordNorm: string }[];
  offered: ReadonlySet<string>;
}): RuleOffer | null {
  if (input.previousOrigin !== 'suggested') return null;
  if (input.pickedCategoryId === null || input.pickedCategoryId === input.previousCategoryId) return null;
  if (input.direction === 'transfer') return null;
  const keyword = input.description.trim().slice(0, RULE_KEYWORD_MAX).trim();
  if (keyword === '') return null;
  const keywordNorm = normaliseRuleKeyword(keyword);
  if (keywordNorm === '') return null;
  if (input.offered.has(keywordNorm)) return null;
  if (input.personalRules.some((r) => r.keywordNorm === keywordNorm)) return null;
  return { keyword, keywordNorm, categoryId: input.pickedCategoryId };
}
