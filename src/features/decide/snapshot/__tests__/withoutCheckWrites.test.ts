// 05-52 (iteration-3 checker, D-35): a bought check is recalculated without its own writes, so the purchase never counts twice.
import { buildGoAheadWrite, type GoAheadContext, type GoAheadWrite } from '@/data/mutations/decideGoAhead';
import { carInputs, demoSource, sofaInputs } from '@/features/decide/__tests__/helpers/demoScenario';
import { buildDecideSnapshot, type SnapshotSource } from '../buildSnapshot';
import { computeCheck } from '../computeCheck';
import type { CheckInputs } from '../types';
import { withoutCheckWrites, type CheckWriteLink } from '../withoutCheckWrites';

jest.mock('@/features/decide/notifications/waitReminder', () => ({ scheduleCoolingOffReminder: jest.fn() }));

const TODAY = '2026-10-15';
const CASH = 'demo-acct-everyday';

const ctx: GoAheadContext = {
  householdId: 'h1',
  currency: 'USD',
  timeZone: 'UTC',
  today: TODAY,
  cashAccountId: CASH,
  cardAccountId: 'demo-acct-card',
  debtCategoryId: 'cat-debt',
  savingsCategoryId: 'cat-savings',
  transferCategoryId: 'cat-transfer',
  investAccount: null,
  replacedSeries: [],
};

function counter(prefix: string): () => string {
  let n = 0;
  return () => `${prefix}-${++n}`;
}

const logged = (source: SnapshotSource) => {
  const built = buildDecideSnapshot(source);
  if (built.kind !== 'logged') throw new Error('snapshot must be logged');
  return built;
};

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value as Record<string, unknown>)) deepFreeze(v);
  }
  return value;
}

/** Mirrors what record_decide_go (05-04) stores: the rows, series and debt in the source, one 'written' link each. */
function applyGoAhead(
  source: SnapshotSource,
  write: GoAheadWrite,
  checkId: string
): { source: SnapshotSource; links: CheckWriteLink[] } {
  const rows = write.rows.map((r) => ({
    id: r.id,
    account_id: r.account_id,
    local_date: r.local_date,
    original_amount: r.original_amount,
    original_currency: r.original_currency,
    home_currency: r.original_currency,
    home_amount: r.original_amount,
    orig_per_eur: null,
    status: (r.status ?? 'pending') as 'paid' | 'pending',
    is_refund: false,
    transfer_id: r.transfer_id ?? null,
    recurring_series_id: null,
    category_id: r.category_id ?? null,
    deleted_at: null,
  }));
  const series = write.series.map((s) => ({
    id: s.id,
    account_id: s.account_id,
    amount: s.amount,
    currency: s.currency,
    freq: s.freq,
    anchor_date: s.anchor_date,
    end_date: s.end_date ?? null,
    occurrence_count: s.occurrence_count ?? null,
    category_id: s.category_id ?? null,
    deleted_at: null,
  }));
  const ended = new Map(write.endSeries.map((e) => [e.id, e.end_date]));
  const endedSeries = source.series.map((s) => (ended.has(s.id) ? { ...s, end_date: ended.get(s.id)! } : s));
  const debts = [...source.debts];
  const links: CheckWriteLink[] = [];
  const link = (entity: CheckWriteLink['entity'], target_id: string): void => {
    links.push({ check_id: checkId, entity, target_id, source: 'written', deleted_at: null });
  };
  rows.forEach((r) => link('transactions', r.id));
  series.forEach((s) => link('recurring_series', s.id));
  if (write.debt !== null) {
    debts.push({
      id: write.debt.id,
      account_id: write.debt.account_id,
      check_id: checkId,
      series_id: write.debt.series_id,
      currency: write.debt.currency,
      balance: write.debt.balance,
      apr: write.debt.apr,
      minimum_payment: write.debt.minimum_payment,
      secured: write.debt.secured,
      kind: 'loan',
      min_percent: null,
      min_interest_added: null,
      min_floor: null,
      paid_in_full: false,
      version: 1,
      deleted_at: null,
    } as SnapshotSource['debts'][number]);
    link('debts', write.debt.id);
  }
  return {
    source: { ...source, rows: [...source.rows, ...rows], series: [...endedSeries, ...series], debts },
    links,
  };
}

function goAhead(source: SnapshotSource, inputs: CheckInputs, checkId: string) {
  const pre = computeCheck(logged(source), inputs);
  const verdict = pre.verdict;
  if (verdict === null || verdict.state === 'missing') throw new Error('verdict required');
  const write = buildGoAheadWrite({ inputs, assessment: verdict, running: pre.running, ctx, mint: counter('w') });
  return { pre, write, after: applyGoAhead(source, write, checkId) };
}

describe('withoutCheckWrites', () => {
  it('a bought sofa recalculates to its pre-Go-ahead verdict', () => {
    const inputs: CheckInputs = { ...sofaInputs, needBy: null };
    const source = demoSource(TODAY);
    const { pre, write, after } = goAhead(source, inputs, 'sofa');
    expect(write.rows).toHaveLength(1);
    const naive = computeCheck(logged(after.source), inputs).verdict;
    if (pre.verdict === null || pre.verdict.state === 'missing' || naive === null || naive.state === 'missing') throw new Error('verdicts');
    expect(naive.cashAfter).toBe(pre.verdict.cashAfter - 180_000);
    const recalculated = computeCheck(logged(withoutCheckWrites(after.source, 'sofa', after.links, null)), inputs).verdict;
    expect(recalculated).toEqual(pre.verdict);
  });

  it('a loan Go ahead leaves out its debt and series', () => {
    const inputs: CheckInputs = { ...carInputs, needBy: null };
    const source = demoSource(TODAY);
    const { pre, write, after } = goAhead(source, inputs, 'car');
    expect(write.debt).not.toBeNull();
    expect(write.series.length).toBeGreaterThan(1);
    const paymentSeries = write.series[0]!;
    // one occurrence of the payment series has already been paid
    const paid = {
      ...after.source.rows[0]!,
      id: 'paid-occurrence',
      account_id: CASH,
      local_date: TODAY,
      original_amount: paymentSeries.amount,
      home_amount: paymentSeries.amount,
      status: 'paid' as const,
      recurring_series_id: paymentSeries.id,
      transfer_id: null,
      is_refund: false,
      category_id: null,
    };
    const withPaid: SnapshotSource = {
      ...after.source,
      rows: [...after.source.rows, paid],
      balances: { ...after.source.balances, [CASH]: (after.source.balances[CASH] ?? 0) + paymentSeries.amount },
    };
    const out = withoutCheckWrites(withPaid, 'car', after.links, null);
    expect(out.debts.some((d) => d.id === write.debt!.id)).toBe(false);
    expect(out.series.some((s) => write.series.some((w) => w.id === s.id))).toBe(false);
    expect(out.rows.some((r) => r.id === 'paid-occurrence')).toBe(false);
    expect(out.balances[CASH]).toBe(source.balances[CASH]);
    const built = logged(out);
    expect(built.snapshot.debts.length).toBe(logged(source).snapshot.debts.length);
    expect(built.snapshot.cashOnHand).toEqual(logged(source).snapshot.cashOnHand);
    expect(computeCheck(built, inputs).verdict).toEqual(pre.verdict);
  });

  it('attached lines and other checks stay', () => {
    const source = demoSource(TODAY);
    const own = source.rows[0]!;
    const other = source.rows[1]!;
    const links: CheckWriteLink[] = [
      { check_id: 'c1', entity: 'transactions', target_id: own.id, source: 'attached', deleted_at: null },
      { check_id: 'c2', entity: 'transactions', target_id: other.id, source: 'written', deleted_at: null },
    ];
    const out = withoutCheckWrites(source, 'c1', links, null);
    expect(out.rows.map((r) => r.id)).toContain(own.id);
    expect(out.rows.map((r) => r.id)).toContain(other.id);
    expect(out.rows).toHaveLength(source.rows.length);
  });

  it('an undone Go ahead removes nothing', () => {
    const source = demoSource(TODAY);
    const { after } = goAhead(source, { ...sofaInputs, needBy: null }, 'sofa');
    const undone = after.links.map((l) => ({ ...l, deleted_at: '2026-10-15T10:00:00Z' }));
    // undo deleted the written rows themselves
    const out = withoutCheckWrites(source, 'sofa', undone, null);
    expect(out).toEqual(source);
  });

  it('a replaced series ended by Go ahead is live again', () => {
    const source = demoSource(TODAY);
    const bus = { ...source.series[0]!, id: 's-bus', end_date: '2026-10-15' };
    const other = { ...source.series[0]!, id: 's-gym', end_date: '2026-12-01' };
    const withBus: SnapshotSource = { ...source, series: [...source.series, bus, other] };
    const out = withoutCheckWrites(withBus, 'c1', [], { seriesIds: ['s-bus', 's-gym'], endedOn: '2026-10-15' });
    expect(out.series.find((s) => s.id === 's-bus')?.end_date).toBeNull();
    expect(out.series.find((s) => s.id === 's-gym')?.end_date).toBe('2026-12-01');
    const untouched = withoutCheckWrites(withBus, 'c1', [], null);
    expect(untouched.series.find((s) => s.id === 's-bus')?.end_date).toBe('2026-10-15');
  });

  it('a paid write is added back to its balance', () => {
    const source = demoSource(TODAY);
    const base = source.rows[0]!;
    const paidRow = { ...base, id: 'p1', account_id: CASH, original_amount: -26_000, home_amount: -26_000, status: 'paid' as const, original_currency: 'USD' };
    const foreignPaid = { ...paidRow, id: 'p2', original_currency: 'EUR' };
    const pendingRow = { ...paidRow, id: 'p3', status: 'pending' as const, original_amount: -9_000 };
    const withRows: SnapshotSource = { ...source, rows: [...source.rows, paidRow, foreignPaid, pendingRow], balances: { ...source.balances, [CASH]: 100_000 } };
    const links: CheckWriteLink[] = ['p1', 'p2', 'p3'].map((id) => ({ check_id: 'c1', entity: 'transactions', target_id: id, source: 'written', deleted_at: null }));
    const out = withoutCheckWrites(withRows, 'c1', links, null);
    expect(out.balances[CASH]).toBe(126_000);
    expect(out.rows.some((r) => ['p1', 'p2', 'p3'].includes(r.id))).toBe(false);
    const pendingOnly = withoutCheckWrites(withRows, 'c1', links.slice(2), null);
    expect(pendingOnly.balances[CASH]).toBe(100_000);
  });

  it('a paid write on an account with no balance entry starts from zero', () => {
    const source = demoSource(TODAY);
    const account = { ...source.accounts[0]!, id: 'acct-new' };
    const row = { ...source.rows[0]!, id: 'n1', account_id: 'acct-new', original_amount: -500, home_amount: -500, status: 'paid' as const, original_currency: account.currency };
    const withNew: SnapshotSource = { ...source, accounts: [...source.accounts, account], rows: [...source.rows, row] };
    const links: CheckWriteLink[] = [{ check_id: 'c1', entity: 'transactions', target_id: 'n1', source: 'written', deleted_at: null }];
    expect(withoutCheckWrites(withNew, 'c1', links, null).balances['acct-new']).toBe(500);
  });

  it('upcoming rows, payment links and the debt tied by check_id are dropped', () => {
    const source = demoSource(TODAY);
    const base = source.rows[0]!;
    const up = { ...base, id: 'up1', local_date: '2030-01-01', status: 'pending' as const };
    const occ = { ...base, id: 'up2', local_date: '2030-02-01', status: 'pending' as const, recurring_series_id: 'sx' };
    const debt = { ...source.debts[0]!, id: 'd-own', check_id: 'c1' };
    const withAll: SnapshotSource = {
      ...source,
      upcomingRows: [up, occ],
      debts: [...source.debts, debt],
      paymentLinks: [
        { check_id: 'c1', target_id: 'x', check_kind: 'buy' },
        { check_id: 'c2', target_id: 'y', check_kind: 'buy' },
      ],
      writtenRowLinks: [
        { check_id: 'c1', target_id: 'x' },
        { check_id: 'c2', target_id: 'y' },
      ],
    };
    const links: CheckWriteLink[] = [
      { check_id: 'c1', entity: 'transactions', target_id: 'up1', source: 'written', deleted_at: null },
      { check_id: 'c1', entity: 'recurring_series', target_id: 'sx', source: 'written', deleted_at: null },
    ];
    const out = withoutCheckWrites(withAll, 'c1', links, null);
    expect(out.upcomingRows).toHaveLength(0);
    expect(out.debts.some((d) => d.id === 'd-own')).toBe(false);
    expect(out.paymentLinks).toEqual([{ check_id: 'c2', target_id: 'y', check_kind: 'buy' }]);
    expect(out.writtenRowLinks).toEqual([{ check_id: 'c2', target_id: 'y' }]);
  });

  it('the input is not mutated', () => {
    const source = demoSource(TODAY);
    const { after } = goAhead(source, { ...carInputs, needBy: null }, 'car');
    deepFreeze(after.source);
    deepFreeze(after.links);
    expect(() => withoutCheckWrites(after.source, 'car', after.links, { seriesIds: ['x'], endedOn: TODAY })).not.toThrow();
  });
});
