// 06-10 (ARC-15, criterion 9): a goal's monthly contribution counts exactly once in Decide's month.
import type { V3Inputs, V3Line } from '@/engine/decide/v3';
import { demoSource } from '../../../__tests__/helpers/demoScenario';
import type { SnapshotSource } from '../../buildSnapshot';
import { buildV3Inputs } from '../buildV3Inputs';
import { SETTINGS, TODAY, USES } from './growScenarios';

type Row = SnapshotSource['rows'][number];
type Goal = SnapshotSource['goals'][number];

const MONTH = TODAY.slice(0, 7);
const lisbon: Goal = {
  id: 'g-lisbon', name: 'Lisbon', kind: 'pot', check_id: null, currency: 'USD', target: 640000, monthly_amount: 5000, ready_by: null,
  opening_saved: 0, done_at: null, deleted_at: null, locked: true, account_id: 'demo-acct-savings',
};

const row = (id: string, over: Partial<Row>): Row => ({
  id, account_id: 'demo-acct-everyday', local_date: `${MONTH}-02`, original_amount: -5000, original_currency: 'USD', home_currency: 'USD', home_amount: -5000,
  orig_per_eur: null, status: 'paid', is_refund: false, transfer_id: null, recurring_series_id: null, category_id: 'cat-transport', deleted_at: null, ...over,
});

const goalSeries: SnapshotSource['series'][number] = {
  id: 's-lisbon', account_id: 'demo-acct-everyday', amount: -5000, currency: 'USD', freq: 'monthly', anchor_date: '2026-06-16', end_date: null,
  occurrence_count: null, category_id: null, deleted_at: null, goal_id: 'g-lisbon',
};

function source(extraRows: Row[], goals: Goal[] = [lisbon]): SnapshotSource {
  const base = demoSource(TODAY);
  return { ...base, goals, series: [...base.series, goalSeries], rows: [...base.rows, ...extraRows], categories: { ...base.categories, 'cat-savings': 'Savings' } };
}

const linesOf = (i: V3Inputs, role: V3Line['role']): V3Line[] => i.months.filter((m) => m.month === MONTH).flatMap((m) => m.lines.filter((l) => l.role === role && l.id.startsWith('lisbon')));
const total = (xs: V3Line[]): number => xs.reduce((n, l) => n + Math.abs(l.amount), 0);

describe('06-10 a goal contribution counts once (ARC-15)', () => {
  it('a goal-linked series is not a Decide series; the envelope carries the monthly amount; the paid occurrence is one deposit', () => {
    const contribution = row('lisbon-1', { recurring_series_id: 's-lisbon', goal_id: 'g-lisbon' });
    const i = buildV3Inputs(source([contribution]), SETTINGS, undefined, USES);
    expect(i.series.find((s) => s.id === 's-lisbon')).toBeUndefined();
    expect(i.envelopes.find((e) => e.id === 'g-lisbon')?.monthlyAmount).toBe(5000);
    expect(linesOf(i, 'envelope_deposit')).toHaveLength(1);
    expect(total(linesOf(i, 'envelope_deposit'))).toBe(5000);
    expect(linesOf(i, 'spending')).toHaveLength(0);
  });

  it('a goal-linked series in the Savings category is not a saving series either; the goal carries the 5000', () => {
    const s = source([], [lisbon]);
    const i = buildV3Inputs({ ...s, series: s.series.map((r) => (r.id === 's-lisbon' ? { ...r, category_id: 'cat-savings' } : r)) }, SETTINGS, undefined, USES);
    expect(i.series.find((x) => x.id === 's-lisbon')).toBeUndefined();
    expect(i.envelopes.find((e) => e.id === 'g-lisbon')?.monthlyAmount).toBe(5000);
  });

  it('single leg, no account: one line tagged with the live goal is an envelope deposit, not spending', () => {
    const i = buildV3Inputs(source([row('lisbon-1', { goal_id: 'g-lisbon' })], [{ ...lisbon, account_id: null }]), SETTINGS, undefined, USES);
    expect(linesOf(i, 'envelope_deposit')).toHaveLength(1);
    expect(total(linesOf(i, 'envelope_deposit'))).toBe(5000);
    expect(total(linesOf(i, 'spending'))).toBe(0);
  });

  it('single leg recorded in the goal account itself is the same', () => {
    const i = buildV3Inputs(source([row('lisbon-1', { goal_id: 'g-lisbon', account_id: 'demo-acct-savings' })]), SETTINGS, undefined, USES);
    expect(total(linesOf(i, 'envelope_deposit'))).toBe(5000);
    expect(total(linesOf(i, 'spending'))).toBe(0);
  });

  it('a single in-leg tagged with a live goal is an envelope withdrawal', () => {
    const i = buildV3Inputs(source([row('lisbon-1', { goal_id: 'g-lisbon', original_amount: 5000, home_amount: 5000 })]), SETTINGS, undefined, USES);
    expect(total(linesOf(i, 'envelope_withdrawal'))).toBe(5000);
    expect(linesOf(i, 'income')).toHaveLength(0);
  });

  it('a single leg tagged with a deleted or unknown goal keeps its ordinary role', () => {
    const gone: Goal = { ...lisbon, deleted_at: '2026-09-01T00:00:00Z' };
    const out = buildV3Inputs(source([row('lisbon-1', { goal_id: 'g-lisbon' }), row('lisbon-2', { goal_id: 'g-nobody' })], [gone]), SETTINGS, undefined, USES);
    expect(linesOf(out, 'spending')).toHaveLength(2);
    expect(linesOf(out, 'envelope_deposit')).toHaveLength(0);
    const inbound = buildV3Inputs(source([row('lisbon-1', { goal_id: 'g-nobody', original_amount: 5000, home_amount: 5000 })], [lisbon]), SETTINGS, undefined, USES);
    expect(linesOf(inbound, 'income')).toHaveLength(1);
    expect(linesOf(inbound, 'envelope_withdrawal')).toHaveLength(0);
  });

  // P5-CR-01: removing a goal (or finishing it) leaves its series running until the server ends it. With the goal no longer
  // carrying it, the series must stay a real outflow, never dropped.
  it.each([
    ['removed', { deleted_at: '2026-09-01T00:00:00Z' }],
    ['done', { done_at: '2026-09-01T00:00:00Z' }],
  ] as const)('a %s goal no longer carries its series: the Savings series is counted as saving', (_label, over) => {
    const s = source([], [{ ...lisbon, ...over }]);
    const i = buildV3Inputs({ ...s, series: s.series.map((r) => (r.id === 's-lisbon' ? { ...r, category_id: 'cat-savings' } : r)) }, SETTINGS, undefined, USES);
    expect(i.envelopes.find((e) => e.id === 'g-lisbon')).toBeUndefined();
    const kept = i.series.find((x) => x.id === 's-lisbon');
    expect(kept?.role).toBe('saving');
    expect(Math.abs(kept?.amount ?? 0)).toBe(5000);
  });

  it('a removed goal no longer carries its series: the bill series is counted as a bill', () => {
    const gone: Goal = { ...lisbon, deleted_at: '2026-09-01T00:00:00Z' };
    const months = ['2026-08', '2026-09', '2026-10', MONTH].filter((m, k, xs) => xs.indexOf(m) === k);
    const paid = months.map((m, k) => row(`lisbon-${k}`, { local_date: `${m}-16`, recurring_series_id: 's-lisbon', goal_id: 'g-lisbon', category_id: null }));
    const live = buildV3Inputs(source(paid, [lisbon]), SETTINGS, undefined, USES);
    const dead = buildV3Inputs(source(paid, [gone]), SETTINGS, undefined, USES);
    expect(live.series.find((x) => x.id === 's-lisbon')).toBeUndefined();
    const bill = dead.series.find((x) => x.id === 's-lisbon');
    expect(bill?.role).toBe('bill');
    expect(Math.abs(bill?.amount ?? 0)).toBe(5000);
  });

  it('a paired goal-tagged transfer still counts once through the existing tagged path', () => {
    const out = row('lisbon-x-out', { transfer_id: 't-1', goal_id: null });
    const into = row('lisbon-x-in', { transfer_id: 't-1', account_id: 'demo-acct-savings', original_amount: 5000, home_amount: 5000, goal_id: 'g-lisbon' });
    const i = buildV3Inputs(source([out, into]), SETTINGS, undefined, USES);
    expect(total(linesOf(i, 'envelope_deposit'))).toBe(5000);
  });
});
