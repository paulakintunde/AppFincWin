// 08-25 (HH-09): rows into the Mine and Household scopes through the engine adapter, and the Household small line from 05.5's
// own builder and month picture over a shared-lines-only source.
import { prepare } from '@/engine/decide/v3';
import { monthPicture } from '@/engine/month';
import { buildInputs } from '@/features/decide/snapshot/v3/buildInputs';
import { household, row } from '@/features/decide/snapshot/__tests__/helpers/sourceFixtures';
import type { SnapshotSource } from '@/features/decide/snapshot/sourceTypes';
import {
  figureTotalsOf,
  householdLeftAfterPlans,
  householdMonthRows,
  householdSnapshotSource,
  mineMonthRows,
  mineSnapshotRows,
  rowsNeedSplits,
  splitsByLineOf,
} from '../figureScope';

const ME = 'u1';
const monthRow = (over: Record<string, unknown>) =>
  ({ id: 'x', status: 'paid', transfer_id: null, is_refund: false, rate_pending: false, original_amount: 0, amountHome: 0, ...over }) as {
    id: string;
    status: 'paid';
    transfer_id: null;
    is_refund: boolean;
    rate_pending: boolean;
    original_amount: number;
    amountHome: number | null;
    created_by?: string | null;
    is_shared?: boolean;
    household_amount?: number | null;
    household_currency?: string | null;
  };

describe('splitsByLineOf', () => {
  it('groups by line and keys a departed member by their former key', () => {
    const map = splitsByLineOf([
      { transaction_id: 'a', member_id: 'u1', former_member_key: null, position: 0, share: -100 },
      { transaction_id: 'a', member_id: null, former_member_key: 'fk', position: 1, share: -50 },
      { transaction_id: 'b', member_id: 'u2', former_member_key: null, position: 0, share: -10 },
    ]);
    expect(map.get('a')).toEqual([
      { memberKey: 'u1', share: -100 },
      { memberKey: 'fk', share: -50 },
    ]);
    expect(map.get('b')).toHaveLength(1);
  });
});

describe('Mine scope rows', () => {
  const own = monthRow({ id: 'own', created_by: ME, original_amount: -1_000, amountHome: -1_000 });
  const legacy = monthRow({ id: 'legacy', created_by: null, original_amount: -500, amountHome: -500 });

  it('a household of one keeps the same array (no read, no change)', () => {
    const rows = [own, legacy];
    expect(rowsNeedSplits(rows, ME)).toBe(false);
    expect(rowsNeedSplits(rows, null)).toBe(false);
    expect(mineMonthRows(rows, new Map(), ME, 'USD')).toBe(rows);
  });

  it('a partner’s shared line counts my stored share; their personal line is left out; my own line is the same object', () => {
    const shared = monthRow({ id: 's', created_by: 'u2', is_shared: true, household_amount: -8_000, household_currency: 'USD', original_amount: -8_000, amountHome: -8_000 });
    const theirs = monthRow({ id: 'p', created_by: 'u2', original_amount: -9_999, amountHome: -9_999 });
    const out = mineMonthRows([own, shared, theirs], splitsByLineOf([{ transaction_id: 's', member_id: ME, former_member_key: null, position: 0, share: -3_000 }]), ME, 'USD');
    expect(out.map((r) => [r.id, r.amountHome])).toEqual([
      ['own', -1_000],
      ['s', -3_000],
    ]);
    expect(out[0]).toBe(own);
    expect(figureTotalsOf(out, []).paidOut).toBe(-4_000);
  });

  it('a shared line I am not on counts 0', () => {
    const shared = monthRow({ id: 's', created_by: 'u2', is_shared: true, household_amount: -8_000, household_currency: 'USD', amountHome: -8_000 });
    expect(mineMonthRows([shared], new Map(), ME, 'USD')[0]?.amountHome).toBe(0);
  });
});

describe('Household scope rows', () => {
  it('shared lines only, at the household amount', () => {
    const rows = [
      monthRow({ id: 'own', created_by: ME, amountHome: -1_000 }),
      monthRow({ id: 's', created_by: 'u2', is_shared: true, household_amount: -9_000, amountHome: -8_000 }),
    ];
    const out = householdMonthRows(rows);
    expect(out.map((r) => [r.id, r.amountHome])).toEqual([['s', -9_000]]);
    expect(figureTotalsOf(out, []).paidOut).toBe(-9_000);
  });
});

describe('Decide source rows (Mine) and the Household small line', () => {
  const base = household();
  const sharedRent = { ...row({ id: 'shared-rent', local_date: '2026-09-03', original_amount: -60_000 }), created_by: 'u2', is_shared: true, household_amount: -60_000, household_currency: 'USD' };
  const partnerOwn = { ...row({ id: 'partner-own', local_date: '2026-09-04', original_amount: -70_000 }), created_by: 'u2', is_shared: false };
  const splits = splitsByLineOf([{ transaction_id: 'shared-rent', member_id: ME, former_member_key: null, position: 0, share: -20_000 }]);

  it('keeps the same array for a household of one', () => {
    expect(mineSnapshotRows(base.rows, new Map(), ME, base)).toBe(base.rows);
    expect(mineSnapshotRows(base.rows, new Map(), null, base)).toBe(base.rows);
  });

  it('stamps my share as the home figure, drops a partner’s personal line, and the builder counts only my share', () => {
    const rows = mineSnapshotRows([...base.rows, sharedRent, partnerOwn], splits, ME, base);
    expect(rows.find((r) => r.id === 'partner-own')).toBeUndefined();
    expect(rows.find((r) => r.id === 'shared-rent')).toMatchObject({ home_currency: 'USD', home_amount: -20_000 });
    const lines = buildInputs({ ...base, rows }, null).months.flatMap((m) => m.lines);
    expect(lines.find((l) => l.id === 'shared-rent')?.amount).toBe(20_000); // month lines carry the size; the role says out
  });

  it('drops a shared line no rate converts, so its full amount never stands in for a share', () => {
    const foreign = { ...sharedRent, id: 'eur', original_currency: 'XYZ', home_currency: 'XYZ', home_amount: -60_000, orig_per_eur: null, household_currency: 'XYZ' };
    expect(mineSnapshotRows([foreign], splits, ME, base)).toEqual([]);
  });

  it('Household: the same builder over shared lines only, at household amounts, in the household currency', () => {
    const mine: SnapshotSource = { ...base, rows: mineSnapshotRows([...base.rows, sharedRent], splits, ME, base) };
    const hs = householdSnapshotSource(mine, 'USD');
    expect(hs.rows.map((r) => r.id)).toEqual(['shared-rent']);
    expect(hs.rows[0]).toMatchObject({ original_amount: -60_000, home_amount: -60_000, home_currency: 'USD' });
    expect(hs.accounts).toEqual([]);
    expect(hs.settings).toBeNull();
    expect(hs.debts).toEqual([]);
    expect(householdSnapshotSource(mine, 'USD')).toBe(hs); // held per source and currency
    const left = householdLeftAfterPlans(mine, 'USD');
    expect(left).toBe(monthPicture(prepare(buildInputs(hs, null))).leftAfterPlans);
    expect(typeof left).toBe('number');
  });

  it('Household keeps joint accounts and their balances only', () => {
    const joint = { ...base.accounts[0], id: 'joint', is_shared: true } as SnapshotSource['accounts'][number];
    const src: SnapshotSource = { ...base, accounts: [...base.accounts, joint], balances: { ...base.balances, joint: 12_000 } };
    const hs = householdSnapshotSource(src, 'USD');
    expect(hs.accounts.map((a) => a.id)).toEqual(['joint']);
    expect(hs.balances).toEqual({ joint: 12_000 });
  });
});
