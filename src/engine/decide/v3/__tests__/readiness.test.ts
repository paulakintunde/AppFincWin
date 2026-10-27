import { minorUnits } from '../../../money/types';
import { evaluate } from '../evaluate';
import { readinessOf } from '../readiness';
import type { Envelope, ReadinessCode, V3Inputs } from '../types';
import { personById, toV3Inputs } from './golden/adapter';
import { checkOnce, v3Line } from './helpers/fixtures';

const mu = minorUnits;
const sam = (over: Partial<V3Inputs> = {}): V3Inputs => toV3Inputs(personById('sam'), over);
const check = checkOnce(15000);

function missingOf(inputs: V3Inputs): readonly ReadinessCode[] {
  const ev = evaluate(inputs, check);
  const r = readinessOf(inputs, ev.month);
  expect(ev.result.readiness).toEqual(r);
  expect(r.ready).toBe(r.missing.length === 0);
  return r.missing;
}

/** Sam, edited: map a month's lines. */
function editMonth(inputs: V3Inputs, month: string, edit: (lines: V3Inputs['months'][number]['lines']) => V3Inputs['months'][number]['lines']): V3Inputs {
  return { ...inputs, months: inputs.months.map((m) => (m.month === month ? { ...m, lines: edit(m.lines) } : m)) };
}

const without = (...ids: string[]) => (lines: V3Inputs['months'][number]['lines']) => lines.filter((l) => !ids.includes(l.id));
const envelope = (accountId: string | null | undefined): Envelope => ({
  id: 'env-1',
  kind: 'pot',
  target: null,
  monthlyAmount: null,
  readyBy: null,
  saved: mu(0),
  purposeId: null,
  ...(accountId === undefined ? {} : { accountId }),
});
/** Sam on 2026-10-20 with a recent everyday line, so October is current. */
const samLate = (): V3Inputs =>
  editMonth(sam({ asOf: '2026-10-20' }), '2026-10', (lines) => [...lines, v3Line({ id: 'sam-e-10-2', date: '2026-10-18', amount: 20000 })]);

describe('D-52 readiness', () => {
  it('D-52 ready: Sam on 2026-10-03', () => {
    expect(missingOf(sam())).toEqual([]);
    expect(evaluate(sam(), check).result.readiness).toEqual({ ready: true, missing: [] });
  });

  it('D-52 ready: Sam on 2026-10-20 with a recent everyday line', () => {
    expect(missingOf(samLate())).toEqual([]);
  });

  it('D-52 past_month_missing: September not marked full', () => {
    const s = sam();
    expect(missingOf({ ...s, months: s.months.map((m) => (m.month === '2026-09' ? { ...m, full: false } : m)) })).toEqual(['past_month_missing']);
  });

  it('D-52 past_month_missing: no September month at all', () => {
    const s = sam();
    expect(missingOf({ ...s, months: s.months.filter((m) => m.month !== '2026-09') })).toEqual(['past_month_missing']);
  });

  it('D-52 past_month_missing: September has no everyday lines', () => {
    expect(missingOf(editMonth(sam(), '2026-09', without('sam-e-09-1', 'sam-e-09-2', 'sam-e-09-3')))).toEqual(['past_month_missing']);
  });

  it('D-52 past_month_missing: September rent is unsettled', () => {
    expect(missingOf(editMonth(sam(), '2026-09', without('sam-rent-09')))).toEqual(['past_month_missing']);
  });

  it('D-52 past_month_missing: September pay was due but no income is recorded', () => {
    expect(missingOf(editMonth(sam(), '2026-09', without('sam-pay-09')))).toEqual(['past_month_missing']);
  });

  it('D-52 past_month_missing: no pay or other income due in September needs no income line', () => {
    const s = sam();
    const noIncome = { ...s, series: s.series.filter((x) => x.role !== 'pay') };
    expect(missingOf(editMonth(noIncome, '2026-09', without('sam-pay-09')))).toEqual([]);
  });

  it('D-52 activity_not_current: no October everyday line by the 20th', () => {
    const s = editMonth(sam({ asOf: '2026-10-20' }), '2026-10', without('sam-e-10-1'));
    expect(missingOf(s)).toEqual(['activity_not_current']);
  });

  it('D-52 activity_not_current: October rent due 10-01 is still unsettled on the 20th', () => {
    expect(missingOf(editMonth(samLate(), '2026-10', without('sam-rent-10')))).toEqual(['activity_not_current']);
  });

  it('D-52 activity_not_current: a recent entry is current even when the month is behind pace; an old entry with a high pace is too', () => {
    // newest entry 10 days old is not older than the limit
    const s = editMonth(sam({ asOf: '2026-10-12' }), '2026-10', without('sam-e-10-1'));
    const recent = editMonth(s, '2026-10', (lines) => [...lines, v3Line({ id: 'x', date: '2026-10-02', amount: 1000 })]);
    expect(missingOf(recent)).toEqual([]);
    // old entry but the month is at pace: not behind
    const atPace = editMonth(samLate(), '2026-10', (lines) => [...lines.filter((l) => l.id !== 'sam-e-10-2'), v3Line({ id: 'big', date: '2026-10-05', amount: 900000 })]);
    expect(missingOf(atPace)).toEqual([]);
  });

  it('D-52 activity_not_current: with no typical everyday figure the pace part is skipped', () => {
    const s = sam({ asOf: '2026-10-20', months: [], series: [], rough: null });
    expect(missingOf(s)).toEqual(['past_month_missing']);
    const lone = sam({ asOf: '2026-10-20', months: [{ month: '2026-10', full: false, mark: null, lines: [v3Line({ id: 'a', date: '2026-10-01', amount: 100 })] }], series: [] });
    expect(missingOf(lone)).toEqual(['activity_not_current', 'past_month_missing']);
  });

  it('D-54 envelopes_unconfirmed: an envelope with no account', () => {
    expect(missingOf(sam({ envelopes: [envelope(null)] }))).toEqual(['envelopes_unconfirmed']);
    expect(missingOf(sam({ envelopes: [envelope(undefined)] }))).toEqual(['envelopes_unconfirmed']);
    expect(missingOf(sam({ envelopes: [envelope('sam-main')] }))).toEqual([]);
  });

  it('D-58 a missed pay is not a readiness item', () => {
    expect(missingOf(editMonth(samLate(), '2026-10', without('sam-pay-10')))).toEqual([]);
  });

  it('D-57 no history with rough figures is ready; without them it is not', () => {
    const rough = { income: mu(300000), expenses: mu(200000), saving: mu(0), debt: mu(0), invest: mu(0), asOf: '2026-10-03' };
    expect(missingOf(sam({ months: [], series: [], rough }))).toEqual([]);
    expect(missingOf(sam({ months: [], series: [], rough: null }))).toEqual(['past_month_missing']);
    // rough figures do not excuse a person who has history: the usual checks apply
    const s = sam({ rough });
    expect(missingOf({ ...s, months: s.months.map((m) => (m.month === '2026-09' ? { ...m, full: false } : m)) })).toEqual(['past_month_missing']);
  });

  it('D-52 several failures are all listed, sorted and unique', () => {
    const s = sam({ asOf: '2026-10-20', envelopes: [envelope(null), envelope(null)] });
    const bad = editMonth({ ...s, months: s.months.map((m) => (m.month === '2026-09' ? { ...m, full: false } : m)) }, '2026-10', without('sam-e-10-1'));
    expect(missingOf(bad)).toEqual(['activity_not_current', 'envelopes_unconfirmed', 'past_month_missing']);
  });

  it('D-52 readiness never changes the code, the split, the facts or the confidence', () => {
    const ready = evaluate(sam(), check).result;
    const s = sam();
    const notReady = evaluate({ ...s, months: s.months.map((m) => (m.month === '2026-09' ? { ...m, full: false } : m)) }, check).result;
    expect(ready.readiness?.ready).toBe(true);
    expect(notReady.readiness?.ready).toBe(false);
    const strip = ({ readiness: _r, ...rest }: typeof ready): Omit<typeof ready, 'readiness'> => rest;
    // Same code on the same inputs whatever readiness says: re-evaluating is deterministic and readiness-free fields match.
    expect(strip(evaluate(sam(), check).result)).toEqual(strip(ready));
    expect(notReady.code).toBe(ready.code);
  });
});
