import type { FxLatestRow, TransactionRow } from '@/db/rows';
import type { SavingsGoalRow } from '@/db/savingsGoals';
import { savedSoFar } from '../goalProgress';

const goal = (p: Partial<SavingsGoalRow> = {}): SavingsGoalRow =>
  ({ id: 'g1', currency: 'USD', target: 100000, opening_saved: 5000, deleted_at: null, ...p }) as SavingsGoalRow;

const line = (p: Partial<TransactionRow> = {}): TransactionRow =>
  ({
    id: 'l',
    goal_id: 'g1',
    status: 'paid',
    deleted_at: null,
    home_currency: 'USD',
    home_amount: -2000,
    original_amount: -2000,
    original_currency: 'USD',
    orig_per_eur: null,
    ...p,
  }) as TransactionRow;

const rates: FxLatestRow[] = [{ quote: 'USD', rate: '1.10', rate_date: '2026-03-01', source: 'frankfurter-v2' }];

describe('savedSoFar', () => {
  it('is the opening amount plus tagged, paid, live lines', () => {
    const r = savedSoFar({
      goal: goal(),
      home: 'USD',
      rates,
      lines: [
        line({ home_amount: -2000 }),
        line({ home_amount: 3000 }),
        line({ goal_id: 'other' }),
        line({ goal_id: null }),
        line({ status: 'pending' }),
        line({ deleted_at: '2026-02-01T00:00:00Z' }),
      ],
    });
    expect(r).toEqual({ saved: 10000, target: 100000 });
  });

  it('with no lines the opening amount stands, and an open target is null', () => {
    expect(savedSoFar({ goal: goal({ target: null }), home: 'USD', rates, lines: [] })).toEqual({
      saved: 5000,
      target: null,
    });
  });

  it('a line waiting for a rate makes saved-so-far wait', () => {
    const waiting = line({ home_currency: 'EUR', home_amount: null, original_currency: 'EUR' });
    expect(savedSoFar({ goal: goal(), home: 'USD', rates, lines: [line(), waiting] })).toEqual({
      saved: null,
      target: 100000,
    });
  });

  it('a goal in a foreign currency waits when it has tagged lines', () => {
    expect(savedSoFar({ goal: goal({ currency: 'GBP' }), home: 'USD', rates, lines: [line()] }).saved).toBeNull();
  });
});
