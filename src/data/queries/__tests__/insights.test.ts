// 07-07 (D-18, ARC-22): the Household prepared holds joint accounts and shared lines only.
import { account, debt, household, row, series } from '@/features/decide/snapshot/__tests__/helpers/sourceFixtures';
import type { SnapshotSource } from '@/features/decide/snapshot/sourceTypes';
import { monthBars } from '@/engine/month';
import { householdSnapshotSource } from '../figureScope';
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

// 07 D-31 (WR-04): an untagged shared money-in line counts in Household "In"; one a member tagged "not money to spend" stays out.
describe('Household money in (D-31)', () => {
  const inOf = (source: SnapshotSource, month: string): number | undefined =>
    monthBars(householdPreparedOf(source, 'USD'), { throughCurrent: true }).find((b) => b.month === month)?.comesIn;
  const withPay = (src: SnapshotSource, over: Extra): SnapshotSource => ({
    ...src,
    rows: src.rows.map((r) => (r.id === 'shared-pay-2026-08' ? ({ ...r, ...over } as typeof r) : r)),
  });

  it('counts an untagged shared pay line, even an occurrence of a series not shared with the viewer', () => {
    const src = fixture();
    const inSeries: SnapshotSource = { ...src, rows: src.rows.map((r) => (r.id.startsWith('shared-pay-') ? { ...r, recurring_series_id: 'partner-pay' } : r)) };
    expect(inOf(src, '2026-08')).toBe(300_000);
    expect(inOf(inSeries, '2026-08')).toBe(300_000);
  });

  it('stamps only untagged money in; money out keeps no mark', () => {
    const hs = householdSnapshotSource(fixture(), 'USD');
    expect(hs.rows.find((r) => r.id === 'shared-pay-2026-08')?.counts_as).toBe('available');
    expect(hs.rows.find((r) => r.id === 'shared-food-2026-08')?.counts_as ?? null).toBeNull();
  });

  it('leaves out a shared line a member marked not money to spend, and keeps an income type as it is', () => {
    const kept = withPay(fixture(), { counts_as: 'kept' });
    expect(householdSnapshotSource(kept, 'USD').rows.find((r) => r.id === 'shared-pay-2026-08')?.counts_as).toBe('kept');
    expect(inOf(kept, '2026-08')).toBe(0);
    const typed = withPay(fixture(), { income_kind: 'gift' });
    expect(householdSnapshotSource(typed, 'USD').rows.find((r) => r.id === 'shared-pay-2026-08')?.counts_as ?? null).toBeNull();
  });

  // NR-02: an occurrence carries no tag of its own; a "not money to spend" mark on its series must keep it out of Household "In".
  const inSharedSeries = (tags: Extra): SnapshotSource => {
    const src = fixture();
    return {
      ...src,
      series: [...src.series, series({ id: 'shared-rent-in', account_id: 'joint', amount: 300_000, anchor_date: '2026-06-01', category_id: 'c-inc', ...tags })],
      rows: src.rows.map((r) => (r.id.startsWith('shared-pay-') ? { ...r, recurring_series_id: 'shared-rent-in' } : r)),
    };
  };

  it('leaves out an untagged occurrence of a series marked not money to spend (NR-02)', () => {
    const kept = inSharedSeries({ counts_as: 'kept' });
    expect(householdSnapshotSource(kept, 'USD').rows.find((r) => r.id === 'shared-pay-2026-08')?.counts_as).toBe('kept');
    expect(inOf(kept, '2026-08')).toBe(0);
  });

  it("carries the series' income type onto an untagged occurrence instead of the stamp (NR-02)", () => {
    const hs = householdSnapshotSource(inSharedSeries({ income_kind: 'gift' }), 'USD');
    const r = hs.rows.find((x) => x.id === 'shared-pay-2026-08');
    expect(r?.counts_as ?? null).toBeNull();
    expect(r?.income_kind).toBe('gift');
  });

  it('counts an untagged occurrence of an untagged series (NR-02)', () => {
    const plain = inSharedSeries({});
    expect(householdSnapshotSource(plain, 'USD').rows.find((r) => r.id === 'shared-pay-2026-08')?.counts_as).toBe('available');
    expect(inOf(plain, '2026-08')).toBe(300_000);
  });

  it("a deleted series' tag no longer applies (NR-02)", () => {
    expect(inOf(inSharedSeries({ counts_as: 'kept', deleted_at: '2026-10-01T00:00:00Z' }), '2026-08')).toBe(300_000);
  });
});
