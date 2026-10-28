// 05.2-48: a debt marked paid off stops counting from its date (owner addition 2026-10-28). Today is 2026-10-15.
import { buildDecideSnapshot, type DebtSource, type SnapshotSource } from '../buildSnapshot';
import type { SnapshotResult } from '../types';
import { buildV3Inputs } from '../v3/buildV3Inputs';
import { account, debt, household, row, series } from './helpers/sourceFixtures';

function logged(source: SnapshotSource): Extract<SnapshotResult, { kind: 'logged' }> {
  const result = buildDecideSnapshot(source);
  if (result.kind !== 'logged') throw new Error(`expected a logged snapshot, got ${result.kind}`);
  return result;
}

const loanSource = (over: Partial<DebtSource> = {}): SnapshotSource => ({
  ...household(),
  debts: [debt({ id: 'loan-1', balance: 1_000_000, minimum_payment: 25_000, ...over })],
});

describe('a paid-off loan', () => {
  it('counts exactly as before while paid_off_on is null, absent or still ahead', () => {
    for (const over of [{ paid_off_on: null }, {}, { paid_off_on: '2026-10-16' }]) {
      const r = logged(loanSource(over));
      expect(r.snapshot.debts).toMatchObject([{ id: 'loan-1', minimumPayment: 25_000 }]);
      expect(buildV3Inputs(loanSource(over), null).debts).toHaveLength(1);
    }
  });

  it('adds nothing from its date: today and yesterday, in the snapshot and in the v3 inputs', () => {
    for (const day of ['2026-10-15', '2026-10-14']) {
      const src = loanSource({ paid_off_on: day });
      expect(logged(src).snapshot.debts).toEqual([]);
      expect(buildV3Inputs(src, null).debts).toEqual([]);
    }
  });

  it('adds nothing to the housing share', () => {
    const live = logged(loanSource({ is_housing: true }));
    const gone = logged(loanSource({ is_housing: true, paid_off_on: '2026-10-01' }));
    expect(live.snapshot.debts).toHaveLength(1);
    expect(gone.snapshot.debts).toEqual([]);
    expect(gone.snapshot.housingMonthly).toBeLessThan(live.snapshot.housingMonthly);
  });

  it('keeps its linked series covered, so the series is not counted as a bill, and keeps past payments', () => {
    const src: SnapshotSource = {
      ...household(),
      debts: [debt({ id: 'loan-1', minimum_payment: 26_000, series_id: 's-pay2', paid_off_on: '2026-10-01' })],
      series: [...household().series, series({ id: 's-pay2', amount: -26_000, category_id: 'c-debt' })],
      rows: [
        ...household().rows,
        ...['2026-08', '2026-09'].map((m) => row({ id: `lp-${m}`, local_date: `${m}-20`, original_amount: -26_000, category_id: 'c-debt', recurring_series_id: 's-pay2' })),
      ],
    };
    const r = logged(src);
    expect(r.snapshot.debts).toEqual([]);
    expect(r.snapshot.bills.map((b) => b.seriesId)).not.toContain('s-pay2');
    const past = r.snapshot.months.flatMap((m) => m.lines).filter((l) => l.seriesId === 's-pay2');
    expect(past).toEqual(logged({ ...src, debts: [debt({ id: 'loan-1', minimum_payment: 26_000, series_id: 's-pay2' })] }).snapshot.months.flatMap((m) => m.lines).filter((l) => l.seriesId === 's-pay2'));
  });

  it('Undo (paid_off_on back to null) gives exactly the original snapshot', () => {
    const original = logged(loanSource());
    const undone = logged(loanSource({ paid_off_on: null }));
    expect(undone.snapshot).toEqual(original.snapshot);
    expect(logged(loanSource({ paid_off_on: '2026-10-01' })).snapshot).not.toEqual(original.snapshot);
  });

  it('a deleted debt counts for nothing, whatever paid_off_on holds', () => {
    for (const over of [{ paid_off_on: null }, { paid_off_on: '2026-10-01' }, { paid_off_on: '2026-12-01' }]) {
      expect(logged(loanSource({ ...over, deleted_at: '2026-01-01T00:00:00Z' })).snapshot.debts).toEqual([]);
    }
  });
});

describe('a paid-off card row', () => {
  const cardSource = (over: Partial<DebtSource> = {}): SnapshotSource => ({
    ...household({ region: 'US' }),
    accounts: [...household().accounts, account({ id: 'card', kind: 'credit' })],
    balances: { ...household().balances, card: -180_000 },
    debts: [debt({ id: 'card-row', kind: 'card', account_id: 'card', min_percent: '2', min_interest_added: false, min_floor: 2_500, ...over })],
  });

  it('counts its minimum while owed', () => {
    const r = logged(cardSource());
    expect(r.snapshot.debts).toMatchObject([{ id: 'card' }]);
    expect(r.snapshot.debts[0]?.minimumPayment).toBeGreaterThan(0);
  });

  it('adds a minimum of 0 once paid off, and Undo restores it', () => {
    const paid = logged(cardSource({ paid_off_on: '2026-10-15' }));
    expect(paid.snapshot.debts[0]?.minimumPayment).toBe(0);
    expect(logged(cardSource({ paid_off_on: null })).snapshot).toEqual(logged(cardSource()).snapshot);
  });
});
