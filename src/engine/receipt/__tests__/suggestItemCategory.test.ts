// 10.1-13 (D-16): likely category for an item.
import { DEFAULT_KEYWORD_RULES, type GuessContext } from '../../categorize/guessCategory';
import { suggestItemCategory } from '../suggestItemCategory';

const ctx = (over: Partial<GuessContext> = {}): GuessContext => ({ keywordRules: DEFAULT_KEYWORD_RULES, learned: new Map(), builtinIds: new Map(), ...over });

describe('10.1-13 suggestItemCategory', () => {
  it('uses the item first (learned)', () => {
    expect(suggestItemCategory('Oat milk', 'SAFEWAY', ctx({ learned: new Map([['oat milk', 'cat-g']]) }))).toEqual({ categoryId: 'cat-g', source: 'item' });
  });
  it('falls back to the store (personal rule)', () => {
    expect(suggestItemCategory('Mystery thing', 'SAFEWAY', ctx({ personalRules: [{ keywordNorm: 'safeway', categoryId: 'cat-s' }] }))).toEqual({ categoryId: 'cat-s', source: 'store' });
  });
  it('gives none with no store or no match', () => {
    expect(suggestItemCategory('Mystery thing', null, ctx())).toEqual({ categoryId: null, source: 'none' });
    expect(suggestItemCategory('Mystery thing', 'Nowhere', ctx())).toEqual({ categoryId: null, source: 'none' });
  });
  it('a built-in keyword counts as an item guess; the income default is never reached (amount is always negative here)', () => {
    expect(suggestItemCategory('Coffee', null, ctx({ builtinIds: new Map([['Dining', 'cat-d']]) }))).toEqual({ categoryId: 'cat-d', source: 'item' });
  });
});
