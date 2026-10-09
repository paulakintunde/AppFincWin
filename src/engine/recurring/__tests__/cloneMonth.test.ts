import fc from 'fast-check';
import { cloneCandidates, type CloneSourceRow } from '../cloneMonth';
import { daysInMonth } from '../schedule';

function src(over: Partial<CloneSourceRow> & { id: string }): CloneSourceRow {
  return {
    local_date: '2026-01-15',
    name: 'Rent',
    original_amount: -50000,
    original_currency: 'GBP',
    category_id: 'c1',
    account_id: 'a1',
    payment_type: 'card',
    recurring_series_id: null,
    transfer_id: null,
    status: 'paid',
    ...over,
  };
}

describe('cloneCandidates', () => {
  it('clamps the day to month end, including leap years', () => {
    const prevRows = [src({ id: '1', local_date: '2026-01-31' })];
    expect(cloneCandidates({ prevRows, currentRows: [], targetMonth: '2026-02' })[0]!.localDate).toBe('2026-02-28');
    expect(cloneCandidates({ prevRows, currentRows: [], targetMonth: '2028-02' })[0]!.localDate).toBe('2028-02-29');
  });

  it('excludes series, transfer and skipped rows', () => {
    const prevRows = [
      src({ id: '1', recurring_series_id: 's', name: 'A' }),
      src({ id: '2', transfer_id: 't', name: 'B' }),
      src({ id: '3', status: 'skipped', name: 'C' }),
    ];
    expect(cloneCandidates({ prevRows, currentRows: [], targetMonth: '2026-02' })).toEqual([]);
  });

  it('skips names already present, dedupes within the source, keeps nameless rows', () => {
    const prevRows = [
      src({ id: '1', name: 'Rent' }),
      src({ id: '2', name: 'Gym', local_date: '2026-01-10' }),
      src({ id: '3', name: 'gym', local_date: '2026-01-20' }),
      src({ id: '4', name: null }),
      src({ id: '5', name: null }),
    ];
    const out = cloneCandidates({ prevRows, currentRows: [{ name: 'Rent' }, { name: null }], targetMonth: '2026-02' });
    expect(out.map((c) => c.sourceId)).toEqual(['2', '4', '5']);
  });

  it('breaks date ties by id', () => {
    const prevRows = [src({ id: 'b', name: 'B' }), src({ id: 'a', name: 'A' })];
    const out = cloneCandidates({ prevRows, currentRows: [], targetMonth: '2026-02' });
    expect(out.map((c) => c.sourceId)).toEqual(['a', 'b']);
  });

  it('keeps fields and flags', () => {
    const [c] = cloneCandidates({
      prevRows: [src({ id: '1', is_refund: true })],
      currentRows: [],
      targetMonth: '2026-02',
    });
    expect(c).toEqual({
      sourceId: '1',
      localDate: '2026-02-15',
      name: 'Rent',
      amount: -50000,
      currency: 'GBP',
      categoryId: 'c1',
      accountId: 'a1',
      paymentType: 'card',
      isRefund: true,
    });
  });

  it('is idempotent', () => {
    const prevRows = [src({ id: '1' }), src({ id: '2', name: 'Gym' })];
    const first = cloneCandidates({ prevRows, currentRows: [], targetMonth: '2026-02' });
    expect(cloneCandidates({ prevRows, currentRows: first, targetMonth: '2026-02' })).toEqual([]);
  });

  it('throws on a bad month', () => {
    expect(() => cloneCandidates({ prevRows: [], currentRows: [], targetMonth: '2026-13' })).toThrow(RangeError);
  });

  it('property: day clamp', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1900, max: 2100 }),
        fc.integer({ min: 1, max: 12 }),
        fc.integer({ min: 1, max: 31 }),
        (y, mo, d) => {
          const month = `${y}-${String(mo).padStart(2, '0')}`;
          const [c] = cloneCandidates({
            prevRows: [src({ id: '1', local_date: `2025-01-${String(d).padStart(2, '0')}` })],
            currentRows: [],
            targetMonth: month,
          });
          const day = Number(c!.localDate.slice(8));
          const dim = daysInMonth(y, mo);
          return day <= dim && (d <= dim ? day === d : day === dim);
        }
      )
    );
  });
});
