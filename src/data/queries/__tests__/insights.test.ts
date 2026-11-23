// 07-07 (D-18, ARC-22): the Household prepared holds joint accounts and shared lines only.
import { account, debt, household, row } from '@/features/decide/snapshot/__tests__/helpers/sourceFixtures';
import type { SnapshotSource } from '@/features/decide/snapshot/sourceTypes';
import { householdPreparedOf } from '../insights';

type Extra = Record<string, unknown>;

function fixture(): SnapshotSource {
  const base = household();
  const joint = account({ id: 'joint', name: 'Joint', currency: 'USD', ...({ is_shared: true } as Extra) });
  const personal = account({ id: 'mine', name: 'Mine', currency: 'USD', ...({ is_shared: false } as Extra) });
  const sharedExtra = { is_shared: true, created_by: 'u2', household_amount: -20_000, household_currency: 'USD' } as Extra;
  const shared = ['2026-06', '2026-07', '2026-08', '2026-09'].flatMap((m) => [
    row({ id: `shared-pay-${m}`, account_id: 'joint', local_date: `${m}-01`, original_amount: 300_000, category_id: 'c-inc', ...({ ...sharedExtra, household_amount: 300_000 } as Extra) }),
    row({ id: `shared-food-${m}`, account_id: 'joint', local_date: `${m}-12`, original_amount: -20_000, category_id: 'c-food', ...sharedExtra }),
  ]);
  const partner = row({
    id: 'partner-personal',
    account_id: 'chk',
    local_date: '2026-09-13',
    original_amount: -7_000,
    category_id: 'c-food',
    ...({ is_shared: false, created_by: 'u2' } as Extra),
  });
  return {
    ...base,
    accounts: [...base.accounts, joint, personal],
    balances: { ...base.balances, joint: 90_000, mine: 10_000 },
    rows: [...base.rows, ...shared, partner],
    debts: [debt({ id: 'd1' })],
  };
}

describe('householdPreparedOf', () => {
  it('holds only the joint account and no debts', () => {
    const p = householdPreparedOf(fixture(), 'USD');
    expect((p.inputs.accounts ?? []).map((a) => a.id)).toEqual(['joint']);
    expect(p.inputs.debts).toEqual([]);
  });

  it("never carries a partner's personal line (ARC-22)", () => {
    const p = householdPreparedOf(fixture(), 'USD');
    const ids = p.inputs.months.flatMap((m) => m.lines.map((l) => l.id));
    expect(ids).not.toContain('partner-personal');
    expect(ids.some((id) => id.startsWith('shared-'))).toBe(true);
  });

  it('returns the same object for the same source and currency', () => {
    const source = fixture();
    expect(householdPreparedOf(source, 'USD')).toBe(householdPreparedOf(source, 'USD'));
  });
});
