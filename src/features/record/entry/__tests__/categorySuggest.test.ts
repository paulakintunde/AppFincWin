import { applyGuess, initialOrigin, ruleOfferFor } from '../categorySuggest';
import type { EntryMode } from '../transactionForm';

const rowWith = (category_id: string | null) => ({ category_id }) as never;

describe('initialOrigin', () => {
  const prefill = (categoryId: string | null) => ({ categoryId }) as never;
  it('classifies each mode', () => {
    expect(initialOrigin({ kind: 'new', direction: 'out' })).toBe('empty');
    expect(initialOrigin({ kind: 'new', direction: 'out', prefill: prefill('c1') })).toBe('stored');
    expect(initialOrigin({ kind: 'new', direction: 'out', prefill: prefill(null) })).toBe('empty');
    expect(initialOrigin({ kind: 'edit', row: rowWith('c1') })).toBe('stored');
    expect(initialOrigin({ kind: 'edit', row: rowWith(null) })).toBe('empty');
    expect(initialOrigin({ kind: 'edit-transfer', out: rowWith(null), in: rowWith(null) } as EntryMode)).toBe('stored');
  });
});

describe('applyGuess', () => {
  it('never changes a picked or stored category', () => {
    expect(applyGuess('a', 'picked', 'g1')).toEqual({ categoryId: 'a', origin: 'picked' });
    expect(applyGuess('a', 'stored', 'g1')).toEqual({ categoryId: 'a', origin: 'stored' });
  });
  it('fills from empty or suggested', () => {
    expect(applyGuess(null, 'empty', 'g1')).toEqual({ categoryId: 'g1', origin: 'suggested' });
    expect(applyGuess('g0', 'suggested', 'g1')).toEqual({ categoryId: 'g1', origin: 'suggested' });
  });
  it('clears a suggestion that no longer matches', () => {
    expect(applyGuess('g0', 'suggested', null)).toEqual({ categoryId: null, origin: 'empty' });
  });
  it('leaves empty alone on none', () => {
    expect(applyGuess(null, 'empty', null)).toEqual({ categoryId: null, origin: 'empty' });
  });
});

describe('ruleOfferFor', () => {
  const base = {
    previousOrigin: 'suggested' as const,
    previousCategoryId: 'c1' as string | null,
    pickedCategoryId: 'c2' as string | null,
    description: '  Tesco Express ',
    direction: 'out' as const,
    personalRules: [],
    offered: new Set<string>(),
  };
  it('offers on a corrected suggestion', () => {
    expect(ruleOfferFor(base)).toEqual({ keyword: 'Tesco Express', keywordNorm: 'tesco express', categoryId: 'c2' });
  });
  it('declines in each excluded case', () => {
    expect(ruleOfferFor({ ...base, previousOrigin: 'empty' })).toBeNull();
    expect(ruleOfferFor({ ...base, previousOrigin: 'picked' })).toBeNull();
    expect(ruleOfferFor({ ...base, pickedCategoryId: 'c1' })).toBeNull();
    expect(ruleOfferFor({ ...base, pickedCategoryId: null })).toBeNull();
    expect(ruleOfferFor({ ...base, direction: 'transfer' })).toBeNull();
    expect(ruleOfferFor({ ...base, description: '   ' })).toBeNull();
    expect(ruleOfferFor({ ...base, offered: new Set(['tesco express']) })).toBeNull();
    expect(ruleOfferFor({ ...base, personalRules: [{ keywordNorm: 'tesco express' }] })).toBeNull();
  });
  it('declines when a personal rule has the keyword, whatever its category', () => {
    expect(ruleOfferFor({ ...base, personalRules: [{ keywordNorm: 'tesco express' }] })).toBeNull();
  });
  it('still offers when only other keywords have rules', () => {
    expect(ruleOfferFor({ ...base, personalRules: [{ keywordNorm: 'asda' }] })).not.toBeNull();
  });
  it('cuts the keyword to 60 characters', () => {
    const r = ruleOfferFor({ ...base, description: 'x'.repeat(80) });
    expect(r?.keyword).toHaveLength(60);
  });
});
