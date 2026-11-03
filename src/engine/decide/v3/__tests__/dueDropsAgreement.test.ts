/**
 * 05.3-64 (D-27, D-31, skips): the month model, the cash path and unspent money read the one dueDrops rule and agree.
 * Every case runs through evaluate(), so the three figures come from one run.
 *
 * - month: evaluation.month.billsDue (still to come).
 * - cash path: with no pay and an opening of 0 the path only falls, so cash.shortBy is every outflow over the 90-day
 *   horizon less nothing; it moves by exactly the dropped dues inside the horizon.
 * - unspent: funds.suggested (spending - bills still due - Erest) rises by the dropped dues; the user's confirmed figure
 *   (funds.unspent.value) stays theirs (D-30) and is never released a second time.
 */
import { minorUnits as mu } from '../../../money/types';
import { evaluate, type Evaluation } from '../evaluate';
import type { IncomeProfile, ReadinessWaiver, SkippedOccurrence, V3Inputs, V3Line, V3Series } from '../types';
import { checkOnce, inputsOf, monthOf, v3Line, v3Series } from './helpers/fixtures';

const MONTHLY = { unit: 'month', every: 1 } as const;
const ASOF = '2026-10-10';
const ANCHOR = { amount: mu(50000), at: '2026-10-05' };

const netflix = v3Series({ id: 'netflix', name: 'Netflix', role: 'bill', cadence: MONTHLY, anchorDate: '2026-01-25', amount: 1199 });
const rent = v3Series({ id: 'rent', name: 'Rent', role: 'bill', cadence: MONTHLY, anchorDate: '2026-01-20', amount: 90000 });
const rentToday = v3Series({ id: 'rent', name: 'Rent', role: 'bill', cadence: MONTHLY, anchorDate: '2026-01-10', amount: 90000 });
const lunch = v3Series({ id: 'lunch', name: 'Lunch', role: 'bill', cadence: { unit: 'week', every: 2 }, anchorDate: '2026-10-05', amount: 1000 });
const BALANCE: IncomeProfile = { types: ['mix'], variable: 'balance', steady: null, billsHorizonMonths: 2 };

function run(
  over: { series?: V3Series[]; waivers?: ReadinessWaiver[]; skipped?: SkippedOccurrence[]; lines?: V3Line[]; profile?: IncomeProfile | null } = {}
): Evaluation {
  const inputs: V3Inputs = inputsOf({
    asOf: ASOF,
    series: over.series ?? [netflix, rent, lunch],
    months: [monthOf('2026-10', over.lines ?? [], { full: false })],
    unspent: ANCHOR,
    profile: over.profile ?? null,
    ...(over.waivers === undefined ? {} : { waivers: over.waivers }),
    ...(over.skipped === undefined ? {} : { skipped: over.skipped }),
  });
  return evaluate(inputs, checkOnce(5000));
}

function shortBy(e: Evaluation): number {
  if (e.cash.kind === 'ok' || e.cash.kind === 'overdraft' || e.cash.kind === 'net') throw new Error('expected the falling path to be short');
  return e.cash.shortBy;
}

/** How much each figure moved from `before` to `after`, as money that no longer leaves. */
function moved(before: Evaluation, after: Evaluation) {
  return {
    month: before.month.billsDue - after.month.billsDue,
    cash: shortBy(before) - shortBy(after),
    unspent: after.funds.suggested - before.funds.suggested,
    confirmed: (after.funds.unspent?.value ?? 0) - (before.funds.unspent?.value ?? 0),
  };
}

describe('dueDrops agreement: month model, cash path and unspent (05.3-64; D-27, D-31)', () => {
  const base = run();

  it('W1: every dropped due falls after both asOf and the unspent anchor', () => {
    for (const d of ['2026-10-25', '2026-10-20', '2026-10-19']) {
      expect(d > ASOF && d > ANCHOR.at).toBe(true);
    }
    expect(base.cash.kind).toBe('not_covered');
    expect(base.funds.unspent).not.toBeNull();
  });

  it('always_other(Netflix): this month moves 1199 in all three; the cash path also drops each later Netflix in the horizon', () => {
    const m = moved(base, run({ waivers: [{ kind: 'always_other', seriesId: 'netflix' }] }));
    expect(m.month).toBe(1199);
    expect(m.unspent).toBe(1199);
    // 10-25, 11-25 and 12-25 sit inside the 90-day horizon from 10-10 (to 2027-01-08)
    expect(m.cash).toBe(3 * 1199);
    expect(m.confirmed).toBe(0);
  });

  it('paid_by_other(Rent, 10-20) is dated after asOf, so the one rule ignores it and no figure moves', () => {
    expect(moved(base, run({ waivers: [{ kind: 'paid_by_other', seriesId: 'rent', date: '2026-10-20' }] }))).toEqual({
      month: 0,
      cash: 0,
      unspent: 0,
      confirmed: 0,
    });
  });

  it('paid_by_other(Rent, on asOf) moves 90000 in all three; November Rent still leaves', () => {
    const before = run({ series: [netflix, rentToday, lunch] });
    const m = moved(before, run({ series: [netflix, rentToday, lunch], waivers: [{ kind: 'paid_by_other', seriesId: 'rent', date: ASOF }] }));
    expect(m).toEqual({ month: 90000, cash: 90000, unspent: 90000, confirmed: 0 });
  });

  it('a skip of Lunch on 10-19 moves 1000 in all three', () => {
    const m = moved(base, run({ skipped: [{ seriesId: 'lunch', date: '2026-10-19' }] }));
    expect(m).toEqual({ month: 1000, cash: 1000, unspent: 1000, confirmed: 0 });
  });

  it('records win: a Rent recorded paid on asOf stays counted whatever the answer', () => {
    const paid = [v3Line({ id: 'r10', date: ASOF, amount: 90000, role: 'spending', seriesId: 'rent' })];
    const series = [netflix, rentToday, lunch];
    const before = run({ series, lines: paid });
    const after = run({ series, lines: paid, waivers: [{ kind: 'paid_by_other', seriesId: 'rent', date: ASOF }] });
    expect(moved(before, after)).toEqual({ month: 0, cash: 0, unspent: 0, confirmed: 0 });
    expect(after.month.billsPaid).toBe(before.month.billsPaid);
  });

  it('profile (d): unspent drops every always_other occurrence in its bills horizon, as the cash path does', () => {
    const before = run({ profile: BALANCE });
    const m = moved(before, run({ profile: BALANCE, waivers: [{ kind: 'always_other', seriesId: 'netflix' }] }));
    expect(m.month).toBe(1199);
    expect(m.cash).toBe(3 * 1199);
    // the two-month bills horizon from 10-10 (to 12-10) holds 10-25 and 11-25
    expect(m.unspent).toBe(2 * 1199);
    expect(m.confirmed).toBe(0);
  });

  it('no waivers and no skips: byte-identical to empty lists', () => {
    const empty = run({ waivers: [], skipped: [] });
    expect(JSON.stringify(empty)).toBe(JSON.stringify(base));
  });
});
