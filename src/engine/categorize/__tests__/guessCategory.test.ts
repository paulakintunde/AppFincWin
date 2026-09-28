import {
  DEFAULT_KEYWORD_RULES,
  buildLearnedMap,
  guessCategory,
  normaliseDescription,
  type GuessContext,
  type KeywordRule,
} from '../guessCategory';
import { BUILTIN_CATEGORY_KEYS, type BuiltinCategoryKey } from '../builtins';

function fullBuiltinIds(omit: readonly BuiltinCategoryKey[] = []): ReadonlyMap<BuiltinCategoryKey, string> {
  const map = new Map<BuiltinCategoryKey, string>();
  for (const key of BUILTIN_CATEGORY_KEYS) {
    if (omit.includes(key)) continue;
    map.set(key, `cat-${key.toLowerCase()}`);
  }
  return map;
}

function makeCtx(overrides: Partial<GuessContext> = {}): GuessContext {
  return {
    keywordRules: DEFAULT_KEYWORD_RULES,
    learned: new Map(),
    builtinIds: fullBuiltinIds(),
    ...overrides,
  };
}

describe('normaliseDescription', () => {
  it('NFD-normalises, strips diacritics, lowercases and collapses whitespace', () => {
    expect(normaliseDescription('  Café  NERO\t12 ')).toBe('cafe nero 12');
  });

  it('leaves an already-plain lower-cased string effectively unchanged', () => {
    expect(normaliseDescription('TESCO STORES 3021')).toBe('tesco stores 3021');
  });
});

describe('buildLearnedMap', () => {
  it('keeps the later updatedAt entry for the same normalised name', () => {
    const map = buildLearnedMap([
      { name: 'Tesco Stores 3021', categoryId: 'cat-old', updatedAt: '2026-01-01T00:00:00Z' },
      { name: 'TESCO STORES 3021', categoryId: 'cat-new', updatedAt: '2026-02-01T00:00:00Z' },
    ]);
    expect(map.get('tesco stores 3021')).toBe('cat-new');
  });

  it('keeps the earlier entry when it was processed later but has an earlier updatedAt', () => {
    const map = buildLearnedMap([
      { name: 'Shop', categoryId: 'cat-new', updatedAt: '2026-02-01T00:00:00Z' },
      { name: 'shop', categoryId: 'cat-old', updatedAt: '2026-01-01T00:00:00Z' },
    ]);
    expect(map.get('shop')).toBe('cat-new');
  });

  it('ignores entries with a null categoryId', () => {
    const map = buildLearnedMap([{ name: 'Some Shop', categoryId: null, updatedAt: '2026-01-01T00:00:00Z' }]);
    expect(map.has('some shop')).toBe(false);
  });

  it('ignores entries with a null name', () => {
    const map = buildLearnedMap([{ name: null, categoryId: 'cat-x', updatedAt: '2026-01-01T00:00:00Z' }]);
    expect(map.size).toBe(0);
  });
});

describe('guessCategory', () => {
  it('matches the learned map first, by exact normalised name', () => {
    const learned = new Map([['tesco stores 3021', 'cat-g']]);
    const result = guessCategory({ name: 'TESCO STORES 3021', amount: -1250 }, makeCtx({ learned }));
    expect(result).toEqual({ categoryId: 'cat-g', source: 'learned' });
  });

  it('falls back to a keyword rule when nothing is learned', () => {
    const result = guessCategory({ name: 'Monthly rent', amount: -95000 }, makeCtx());
    expect(result).toEqual({ categoryId: 'cat-housing', source: 'keyword' });
  });

  it('falls back to Income for a positive amount with no keyword match', () => {
    const result = guessCategory({ name: 'Acme Payroll', amount: 250000 }, makeCtx({ keywordRules: [] }));
    expect(result).toEqual({ categoryId: 'cat-income', source: 'income-default' });
  });

  it('does not apply the income default for a zero amount', () => {
    const result = guessCategory({ name: 'Acme Payroll', amount: 0 }, makeCtx({ keywordRules: [] }));
    expect(result).toEqual({ categoryId: null, source: 'none' });
  });

  it('matches an Income keyword directly, ahead of the income-default fallback', () => {
    const result = guessCategory({ name: 'Salary payment', amount: 250000 }, makeCtx());
    expect(result).toEqual({ categoryId: 'cat-income', source: 'keyword' });
  });

  it('returns none when nothing matches and the amount is not positive', () => {
    const result = guessCategory({ name: 'Zzz', amount: -500 }, makeCtx());
    expect(result).toEqual({ categoryId: null, source: 'none' });
  });

  it('returns none when the amount is positive but Income has no active id', () => {
    const result = guessCategory(
      { name: 'Zzz', amount: 500 },
      makeCtx({ keywordRules: [], builtinIds: fullBuiltinIds(['Income']) })
    );
    expect(result).toEqual({ categoryId: null, source: 'none' });
  });

  it('falls through to the next keyword match when the best match is archived', () => {
    const rules: readonly KeywordRule[] = [
      { keyword: 'foo', category: 'Debt' },
      { keyword: 'bar', category: 'Savings' },
    ];
    const result = guessCategory(
      { name: 'foo bar', amount: -1000 },
      makeCtx({ keywordRules: rules, builtinIds: fullBuiltinIds(['Debt']) })
    );
    expect(result).toEqual({ categoryId: 'cat-savings', source: 'keyword' });
  });

  it('returns none when every matching keyword category is archived', () => {
    const rules: readonly KeywordRule[] = [{ keyword: 'foo', category: 'Debt' }];
    const result = guessCategory(
      { name: 'foo', amount: -1000 },
      makeCtx({ keywordRules: rules, builtinIds: fullBuiltinIds(['Debt']) })
    );
    expect(result).toEqual({ categoryId: null, source: 'none' });
  });

  it('prefers a whole-word match over a longer substring-only match', () => {
    const result = guessCategory({ name: 'Cardiff coffee', amount: -800 }, makeCtx());
    expect(result).toEqual({ categoryId: 'cat-dining', source: 'keyword' });
  });

  it('prefers the longer keyword when both candidates are whole-word matches', () => {
    const result = guessCategory({ name: 'loan saving', amount: -1000 }, makeCtx());
    expect(result).toEqual({ categoryId: 'cat-savings', source: 'keyword' });
  });

  it('matches a substring-only keyword when it is the only candidate', () => {
    const result = guessCategory({ name: 'Discarded item', amount: -400 }, makeCtx());
    expect(result).toEqual({ categoryId: 'cat-debt', source: 'keyword' });
  });

  it('ports the prototype accountant rule to Tax', () => {
    const result = guessCategory({ name: 'City Accountants LLP', amount: -30000 }, makeCtx());
    expect(result).toEqual({ categoryId: 'cat-tax', source: 'keyword' });
  });
});

describe('DEFAULT_KEYWORD_RULES', () => {
  it('covers every prototype keyword verbatim (FincWin United.dc.html line 3228)', () => {
    const prototypePairs: Record<string, BuiltinCategoryKey> = {
      rent: 'Housing',
      sublet: 'Housing',
      mortgage: 'Housing',
      electric: 'Utilities',
      water: 'Utilities',
      phone: 'Utilities',
      internet: 'Utilities',
      grocer: 'Groceries',
      market: 'Groceries',
      fuel: 'Transport',
      transit: 'Transport',
      insur: 'Insurance',
      dental: 'Health',
      pharmacy: 'Health',
      adobe: 'Subscriptions',
      figma: 'Subscriptions',
      stream: 'Subscriptions',
      storage: 'Subscriptions',
      loan: 'Debt',
      card: 'Debt',
      saving: 'Savings',
      fund: 'Savings',
      cowork: 'Business',
      domain: 'Business',
      hosting: 'Business',
      accountant: 'Tax',
      tax: 'Tax',
      lunch: 'Dining',
      dinner: 'Dining',
      coffee: 'Dining',
    };
    for (const [keyword, category] of Object.entries(prototypePairs)) {
      expect(DEFAULT_KEYWORD_RULES).toContainEqual({ keyword, category });
    }
  });
});
