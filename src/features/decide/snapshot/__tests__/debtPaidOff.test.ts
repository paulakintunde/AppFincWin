// 05.2-48: a debt marked paid off stops counting from its date (owner addition 2026-10-28). Today is 2026-10-15.
import type { DebtSource, SnapshotSource } from '../sourceTypes';
import { buildInputs } from '../v3/buildInputs';
import { debt, household } from './helpers/sourceFixtures';

const loanSource = (over: Partial<DebtSource> = {}): SnapshotSource => ({
  ...household(),
  debts: [debt({ id: 'loan-1', balance: 1_000_000, minimum_payment: 25_000, ...over })],
});

describe('a paid-off loan', () => {
  it('counts while paid_off_on is null, absent or still ahead', () => {
    for (const over of [{ paid_off_on: null }, {}, { paid_off_on: '2026-10-16' }]) {
      expect(buildInputs(loanSource(over), null).debts).toMatchObject([{ id: 'loan-1', minimum: 25_000 }]);
    }
  });

  it('adds nothing from its date: today and yesterday', () => {
    for (const day of ['2026-10-15', '2026-10-14']) {
      expect(buildInputs(loanSource({ paid_off_on: day }), null).debts).toEqual([]);
    }
  });

  it('a deleted debt counts for nothing, whatever paid_off_on holds', () => {
    for (const over of [{ paid_off_on: null }, { paid_off_on: '2026-10-01' }, { paid_off_on: '2026-12-01' }]) {
      expect(buildInputs(loanSource({ ...over, deleted_at: '2026-01-01T00:00:00Z' }), null).debts).toEqual([]);
    }
  });
});
