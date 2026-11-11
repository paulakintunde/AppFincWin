/* eslint-disable import/first */
import { renderHook } from '@testing-library/react-native';
import { LEDGER_TODAY, goals as ledger } from '@/engine/grow/__tests__/fixtures/ledger';
import type { TransactionRow } from '@/db/rows';
import type { SavingsGoalRow } from '@/db/savingsGoals';

let mockRows: SavingsGoalRow[] | undefined;
let mockLines: TransactionRow[] | undefined;
let mockRowsError = false;

jest.mock('@/data/queries/growGoals', () => ({
  useSavingsGoalRows: () => ({ data: mockRows, isError: mockRowsError, refetch: jest.fn() }),
  useGoalLines: () => ({ data: mockLines, isError: false, refetch: jest.fn() }),
}));
jest.mock('@/features/decide/past/usePastDecisions', () => ({
  usePastContext: () => ({
    userId: 'u1',
    householdId: 'h1',
    today: '2026-11-05',
    ctx: { home: 'USD', rates: [], customs: [], today: '2026-11-05', timeZone: 'UTC' },
  }),
}));

import { NET_MOVED_BY_MIGRATION_AT, buildGoalsModel, existedBeforeGrow, useGoalsRead } from '../useGoalsRead';
/* eslint-enable import/first */

const identity = (amount: number, currency: string): number | null => (currency === 'USD' ? amount : null);

const row = (over: Partial<SavingsGoalRow> & { id: string; name: string }): SavingsGoalRow => ({
  household_id: 'h1',
  created_by: 'u1',
  check_id: null,
  currency: 'USD',
  target: null,
  monthly_amount: null,
  ready_by: null,
  opening_saved: 0,
  kind: 'pot',
  bucket: null,
  account_id: null,
  locked: true,
  done_at: null,
  is_sample: false,
  deleted_at: null,
  version: 1,
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
  ...over,
});

const NET = row({
  id: 'net',
  name: 'Safety net',
  is_safety_net: true,
  protect: true,
  target: ledger.safetyNet.target,
  opening_saved: ledger.safetyNet.saved,
  monthly_amount: ledger.safetyNet.monthly,
  net_confirmed_at: '2026-11-01T00:00:00Z',
});
const LISBON = row({
  id: 'lisbon',
  name: 'Lisbon',
  target: ledger.lisbon.target,
  opening_saved: ledger.lisbon.opening,
  monthly_amount: ledger.lisbon.monthly,
  ready_by: '2027-06-01',
});
const LAPTOP = row({ id: 'laptop', name: 'Laptop', target: ledger.laptop.target, locked: false });

const deposit = (id: string, transfer: string): TransactionRow =>
  ({
    id,
    goal_id: 'lisbon',
    status: 'paid',
    deleted_at: null,
    transfer_id: transfer,
    original_amount: 5000,
    original_currency: 'USD',
    local_date: LEDGER_TODAY,
  }) as unknown as TransactionRow;
const LINES = [deposit('l1', 't1'), deposit('l2', 't2')];

describe('buildGoalsModel (LEDGER)', () => {
  it('totals 194000 saved and 15000 a month, with the net and two goals', () => {
    const m = buildGoalsModel([NET, LISBON, LAPTOP], LINES, identity, 'USD');
    expect(m.totalSaved).toBe(194000);
    expect(m.monthlyIntoGoals).toBe(15000);
    expect(m.safetyNet?.saved).toBe(130000);
    expect(m.goals.map((g) => [g.id, g.saved])).toEqual([
      ['lisbon', 64000],
      ['laptop', 0],
    ]);
    expect(m.needsNetConfirm).toBe(false);
    expect(m.goalCount).toBe(2);
    expect(m.netCounted).toBe(true);
  });

  it('pendingByGoal counts due Expected lines per goal, not future, skipped or deleted ones', () => {
    const line = (id: string, goal: string, over: Record<string, unknown>) =>
      ({ id, goal_id: goal, status: 'pending', deleted_at: null, local_date: '2026-11-01', ...over }) as unknown as TransactionRow;
    const lines = [
      line('p1', 'lisbon', {}),
      line('p2', 'lisbon', { local_date: '2026-12-01' }),
      line('p3', 'net', {}),
      line('p4', 'net', { status: 'skipped' }),
      line('p5', 'net', { deleted_at: '2026-11-02T00:00:00Z' }),
    ];
    const m = buildGoalsModel([NET, LISBON, LAPTOP], [...LINES, ...lines], identity, 'USD', '2026-11-05');
    expect(m.pendingByGoal).toEqual({ lisbon: 1, net: 1 });
    expect(m.totalSaved).toBe(194000);
  });

  it('netReachesOn comes from the monthly amount and size; null without a monthly amount', () => {
    const withPlan = buildGoalsModel([NET], [], identity, 'USD', '2026-11-05');
    expect(withPlan.netReachesOn).toBe('2027-09-01');
    expect(buildGoalsModel([{ ...NET, monthly_amount: null }], [], identity, 'USD', '2026-11-05').netReachesOn).toBeNull();
    expect(buildGoalsModel([LISBON], [], identity, 'USD', '2026-11-05').netReachesOn).toBeNull();
  });

  it('needsNetConfirm: unconfirmed net with a size or money; not when empty or no net', () => {
    const unconfirmed = { ...NET, net_confirmed_at: null };
    expect(buildGoalsModel([unconfirmed], [], identity, 'USD').needsNetConfirm).toBe(true);
    expect(buildGoalsModel([{ ...unconfirmed, target: null }], [], identity, 'USD').needsNetConfirm).toBe(true); // saved 130000
    expect(buildGoalsModel([{ ...unconfirmed, target: null, opening_saved: 0 }], [], identity, 'USD').needsNetConfirm).toBe(false);
    expect(buildGoalsModel([LISBON], LINES, identity, 'USD').needsNetConfirm).toBe(false);
  });

  it('06-37 D-36: only a net created on or before the Grow migration push asks to be confirmed', () => {
    expect(NET_MOVED_BY_MIGRATION_AT).toBe('2026-11-07T04:03:00Z');
    const unconfirmed = { ...NET, net_confirmed_at: null };
    const at = (created_at: string) => buildGoalsModel([{ ...unconfirmed, created_at }], [], identity, 'USD').needsNetConfirm;
    // Moved by the migration: created before the push, or within its minute.
    expect(at('2026-10-01T00:00:00Z')).toBe(true);
    expect(at('2026-11-07T04:03:00Z')).toBe(true);
    expect(at('2026-11-07T04:03:59.999+00:00')).toBe(true);
    expect(at('2026-11-06 23:03:00-05:00')).toBe(true); // Postgres text form, another offset, same instant as 04:03Z
    // Made in the app after the push: never the moved sheet, even unconfirmed.
    expect(at('2026-11-07T04:04:00Z')).toBe(false);
    expect(at('2026-11-10T12:00:00+00:00')).toBe(false);
    // A confirmed old net does not ask again.
    expect(buildGoalsModel([{ ...NET, created_at: '2026-10-01T00:00:00Z' }], [], identity, 'USD').needsNetConfirm).toBe(false);
  });

  it('06-37 existedBeforeGrow: an unreadable or missing time counts as after', () => {
    expect(existedBeforeGrow(undefined)).toBe(false);
    expect(existedBeforeGrow(null)).toBe(false);
    expect(existedBeforeGrow('not a date')).toBe(false);
    expect(existedBeforeGrow('2026-11-07T04:02:59Z')).toBe(true);
    expect(existedBeforeGrow('2026-11-07T04:03:12.123456+00:00')).toBe(true); // microseconds, as PostgREST sends
    expect(existedBeforeGrow('2026-11-07T04:04:00.000001+00:00')).toBe(false);
  });

  it('a goal whose money cannot convert is left out; an other-currency net counts nothing saved', () => {
    const eur = row({ id: 'eur', name: 'Rome', currency: 'EUR', opening_saved: 1000 });
    const m = buildGoalsModel([eur, { ...NET, currency: 'EUR' }], [], identity, 'USD');
    expect(m.goals).toEqual([]);
    expect(m.safetyNet?.saved).toBe(0);
    expect(m.monthlyIntoGoals).toBe(0);
  });

  it('P4-WR-01: ownSavedByGoal carries each goal in its own currency, beside the home figure Decide reads', () => {
    // EUR -> USD at 1.10; within EUR every amount stays as it is.
    const toUsd = (amount: number, currency: string): number | null => (currency === 'USD' ? amount : currency === 'EUR' ? Math.round(amount * 1.1) : null);
    const toCurrency = (c: string) => (amount: number, from: string): number | null => (from === c ? amount : null);
    const eur = row({ id: 'eur', name: 'Rome', currency: 'EUR', opening_saved: 100_000 });
    const usd = row({ id: 'usd', name: 'Lisbon', currency: 'USD', opening_saved: 64_000 });
    const m = buildGoalsModel([eur, usd], [], toUsd, 'USD', '2026-11-05', toCurrency);
    expect(m.goals.find((g) => g.id === 'eur')?.saved).toBe(110_000);
    expect(m.ownSavedByGoal).toEqual({ eur: 100_000, usd: 64_000 });
    // without the converter the field is absent (older callers)
    expect(buildGoalsModel([eur, usd], [], toUsd, 'USD').ownSavedByGoal).toBeUndefined();
  });
});

describe('useGoalsRead', () => {
  beforeEach(() => {
    mockRows = undefined;
    mockLines = undefined;
    mockRowsError = false;
  });

  it('is loading until the goals and their lines load, then ready with the LEDGER figures', async () => {
    const first = await renderHook(() => useGoalsRead());
    expect(first.result.current.status).toBe('loading');
    mockRows = [NET, LISBON, LAPTOP];
    const half = await renderHook(() => useGoalsRead());
    expect(half.result.current.status).toBe('loading');
    mockLines = LINES;
    const ready = await renderHook(() => useGoalsRead());
    expect(ready.result.current.status).toBe('ready');
    expect(ready.result.current.model.totalSaved).toBe(194000);
    expect(ready.result.current.model.monthlyIntoGoals).toBe(15000);
    expect(ready.result.current.householdId).toBe('h1');
  });

  it('no goals at all is ready and empty', async () => {
    mockRows = [];
    const { result } = await renderHook(() => useGoalsRead());
    expect(result.current.status).toBe('ready');
    expect(result.current.model.goals).toEqual([]);
    expect(result.current.model.safetyNet).toBeNull();
    result.current.refetch();
  });

  it('reports an error', async () => {
    mockRowsError = true;
    const { result } = await renderHook(() => useGoalsRead());
    expect(result.current.status).toBe('error');
  });
});
