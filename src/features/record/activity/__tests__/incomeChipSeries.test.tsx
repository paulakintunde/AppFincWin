// 05.2 F-10: a payment from an income series reads the series' tag when it has none of its own.
import type { IncomePayerPromptRow } from '@/db/incomePayerPrompts';
import { incomeChipState } from '../IncomeTagChip';

const row = (over: Record<string, unknown> = {}) =>
  ({ income_kind: null, counts_as: null, name: 'Acme Ltd', recurring_series_id: 'S', ...over }) as Parameters<typeof incomeChipState>[0];
const rules = new Map<string, IncomePayerPromptRow>();
const salary = new Map([['S', { income_kind: 'salary', counts_as: 'available' as const }]]);

describe('incomeChipState with a series', () => {
  it('takes the series tag', () => {
    expect(incomeChipState(row(), rules, salary)).toEqual({ state: 'tagged', kind: 'salary', countsAs: 'available', regular: true });
  });
  it('the row own tag wins', () => {
    expect(incomeChipState(row({ income_kind: 'commission', counts_as: 'kept' }), rules, salary)).toEqual({
      state: 'tagged',
      kind: 'commission',
      countsAs: 'kept',
      regular: true,
    });
  });
  it('a series with no kind falls through to new', () => {
    const m = new Map([['S', { income_kind: null, counts_as: 'available' as const }]]);
    expect(incomeChipState(row(), rules, m)).toEqual({ state: 'new' });
  });
  it('a series with no counts_as falls through to new', () => {
    const m = new Map([['S', { income_kind: 'salary', counts_as: null }]]);
    expect(incomeChipState(row(), rules, m)).toEqual({ state: 'new' });
  });
  it('a series that is not in the map falls through to new', () => {
    expect(incomeChipState(row({ recurring_series_id: 'X' }), rules, salary)).toEqual({ state: 'new' });
    expect(incomeChipState(row({ recurring_series_id: null }), rules, salary)).toEqual({ state: 'new' });
  });
});
