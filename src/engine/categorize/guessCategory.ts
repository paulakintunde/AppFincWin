/**
 * Category guessing for statement import (D-14, REC-10). Combines the
 * user's own past categorisation (learned) with a fixed keyword list (the
 * prototype's guessCat, FincWin United.dc.html line 3228, ported verbatim
 * plus additions), then an Income default for a positive amount, then
 * uncategorised. No LLM is involved anywhere in this module.
 */
import type { BuiltinCategoryKey } from './builtins';

export interface KeywordRule {
  keyword: string;
  category: BuiltinCategoryKey;
}

// The prototype's Component.KEYS (line 3228), verbatim, then the additions
// listed in the plan's <action> block. Order matters only as a stable
// tie-break when two candidates share both whole-word status and length.
export const DEFAULT_KEYWORD_RULES: readonly KeywordRule[] = [
  // Prototype (verbatim)
  { keyword: 'rent', category: 'Housing' },
  { keyword: 'sublet', category: 'Housing' },
  { keyword: 'mortgage', category: 'Housing' },
  { keyword: 'electric', category: 'Utilities' },
  { keyword: 'water', category: 'Utilities' },
  { keyword: 'phone', category: 'Utilities' },
  { keyword: 'internet', category: 'Utilities' },
  { keyword: 'grocer', category: 'Groceries' },
  { keyword: 'market', category: 'Groceries' },
  { keyword: 'fuel', category: 'Transport' },
  { keyword: 'transit', category: 'Transport' },
  { keyword: 'insur', category: 'Insurance' },
  { keyword: 'dental', category: 'Health' },
  { keyword: 'pharmacy', category: 'Health' },
  { keyword: 'adobe', category: 'Subscriptions' },
  { keyword: 'figma', category: 'Subscriptions' },
  { keyword: 'stream', category: 'Subscriptions' },
  { keyword: 'storage', category: 'Subscriptions' },
  { keyword: 'loan', category: 'Debt' },
  { keyword: 'card', category: 'Debt' },
  { keyword: 'saving', category: 'Savings' },
  { keyword: 'fund', category: 'Savings' },
  { keyword: 'cowork', category: 'Business' },
  { keyword: 'domain', category: 'Business' },
  { keyword: 'hosting', category: 'Business' },
  { keyword: 'accountant', category: 'Tax' },
  { keyword: 'tax', category: 'Tax' },
  { keyword: 'lunch', category: 'Dining' },
  { keyword: 'dinner', category: 'Dining' },
  { keyword: 'coffee', category: 'Dining' },
  // Additions
  { keyword: 'netflix', category: 'Subscriptions' },
  { keyword: 'spotify', category: 'Subscriptions' },
  { keyword: 'disney', category: 'Subscriptions' },
  { keyword: 'prime video', category: 'Subscriptions' },
  { keyword: 'apple.com', category: 'Subscriptions' },
  { keyword: 'icloud', category: 'Subscriptions' },
  { keyword: 'youtube', category: 'Subscriptions' },
  { keyword: 'tesco', category: 'Groceries' },
  { keyword: 'sainsbury', category: 'Groceries' },
  { keyword: 'asda', category: 'Groceries' },
  { keyword: 'aldi', category: 'Groceries' },
  { keyword: 'lidl', category: 'Groceries' },
  { keyword: 'waitrose', category: 'Groceries' },
  { keyword: 'morrisons', category: 'Groceries' },
  { keyword: 'whole foods', category: 'Groceries' },
  { keyword: 'safeway', category: 'Groceries' },
  { keyword: 'kroger', category: 'Groceries' },
  { keyword: 'uber', category: 'Transport' },
  { keyword: 'lyft', category: 'Transport' },
  { keyword: 'train', category: 'Transport' },
  { keyword: 'rail', category: 'Transport' },
  { keyword: 'bus', category: 'Transport' },
  { keyword: 'parking', category: 'Transport' },
  { keyword: 'petrol', category: 'Transport' },
  { keyword: 'shell', category: 'Transport' },
  { keyword: 'bp', category: 'Transport' },
  { keyword: 'restaurant', category: 'Dining' },
  { keyword: 'cafe', category: 'Dining' },
  { keyword: 'pizza', category: 'Dining' },
  { keyword: 'deliveroo', category: 'Dining' },
  { keyword: 'just eat', category: 'Dining' },
  { keyword: 'doordash', category: 'Dining' },
  { keyword: 'starbucks', category: 'Dining' },
  { keyword: 'pret', category: 'Dining' },
  { keyword: 'energy', category: 'Utilities' },
  { keyword: 'gas', category: 'Utilities' },
  { keyword: 'broadband', category: 'Utilities' },
  { keyword: 'mobile', category: 'Utilities' },
  { keyword: 'council', category: 'Utilities' },
  { keyword: 'clinic', category: 'Health' },
  { keyword: 'doctor', category: 'Health' },
  { keyword: 'optician', category: 'Health' },
  { keyword: 'salary', category: 'Income' },
  { keyword: 'payroll', category: 'Income' },
  { keyword: 'wages', category: 'Income' },
];

export interface GuessContext {
  keywordRules: readonly KeywordRule[];
  learned: ReadonlyMap<string, string>; // normalised name -> category id
  builtinIds: ReadonlyMap<BuiltinCategoryKey, string>; // active (non-archived) builtin -> id
}

export type GuessSource = 'learned' | 'keyword' | 'income-default' | 'none';

/**
 * NFD-normalises, strips combining marks (diacritics), lowercases, collapses
 * internal whitespace runs to a single space and trims. Used both to key the
 * learned map and to match keywords, so 'Café' and 'cafe' are the same name.
 */
export function normaliseDescription(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The user's own past categorisation, keyed by normalised name. When two
 * entries share a normalised name, the one with the later `updatedAt` wins.
 * Entries with a null name or a null categoryId are ignored (no name to key
 * on, or the row was never categorised).
 */
export function buildLearnedMap(
  entries: readonly { name: string | null; categoryId: string | null; updatedAt: string }[]
): Map<string, string> {
  const result = new Map<string, string>();
  const wonAt = new Map<string, string>();
  for (const entry of entries) {
    if (entry.name === null || entry.categoryId === null) continue;
    const key = normaliseDescription(entry.name);
    const prevAt = wonAt.get(key);
    if (prevAt === undefined || entry.updatedAt >= prevAt) {
      result.set(key, entry.categoryId);
      wonAt.set(key, entry.updatedAt);
    }
  }
  return result;
}

function isWordChar(ch: string | undefined): boolean {
  return ch !== undefined && /[a-z0-9]/.test(ch);
}

interface KeywordMatch {
  category: BuiltinCategoryKey;
  wholeWord: boolean;
  length: number;
}

/** Every rule whose keyword occurs in `normalised`, ranked whole-word first then longest. */
function matchKeywords(normalised: string, rules: readonly KeywordRule[]): KeywordMatch[] {
  const matches: KeywordMatch[] = [];
  for (const rule of rules) {
    const idx = normalised.indexOf(rule.keyword);
    if (idx === -1) continue;
    const before = idx > 0 ? normalised[idx - 1] : undefined;
    const afterIdx = idx + rule.keyword.length;
    const after = afterIdx < normalised.length ? normalised[afterIdx] : undefined;
    const wholeWord = !isWordChar(before) && !isWordChar(after);
    matches.push({ category: rule.category, wholeWord, length: rule.keyword.length });
  }
  matches.sort((a, b) => {
    if (a.wholeWord !== b.wholeWord) return a.wholeWord ? -1 : 1;
    return b.length - a.length;
  });
  return matches;
}

/**
 * learned exact match first; then keyword rules (whole-word, then longest,
 * skipping any candidate whose category has no active builtin id); then
 * Income for a positive amount when Income has an id; else uncategorised.
 */
export function guessCategory(
  input: { name: string; amount: number },
  ctx: GuessContext
): { categoryId: string | null; source: GuessSource } {
  const normalised = normaliseDescription(input.name);

  const learnedId = ctx.learned.get(normalised);
  if (learnedId !== undefined) {
    return { categoryId: learnedId, source: 'learned' };
  }

  for (const match of matchKeywords(normalised, ctx.keywordRules)) {
    const id = ctx.builtinIds.get(match.category);
    if (id !== undefined) {
      return { categoryId: id, source: 'keyword' };
    }
  }

  if (input.amount > 0) {
    const incomeId = ctx.builtinIds.get('Income');
    if (incomeId !== undefined) {
      return { categoryId: incomeId, source: 'income-default' };
    }
  }

  return { categoryId: null, source: 'none' };
}
