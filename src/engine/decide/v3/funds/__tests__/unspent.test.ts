import { array, assert as fcAssert, constantFrom, integer, property } from 'fast-check';
import { minorUnits as mu } from '../../../../money/types';
import { erestOf } from '../../month/thisMonth';
import type { LineRole, V3Line, V3Month, V3Series } from '../../types';
import { rollForward, suggestedUnspent, unspentState } from '../unspent';

function ser(over: Partial<V3Series> & { id: string }): V3Series {
  return {
    role: 'bill',
    cadence: { unit: 'month', every: 1 },
    anchorDate: '2026-01-01',
    endDate: null,
    amount: mu(150000),
    status: 'live',
    confirmed: true,
    payGroup: null,
    countsAs: null,
    incomeKind: null,
    typicalChoice: null,
    categoryId: null,
    isHousing: false,
    savingMode: null,
    ...over,
  };
}

function line(over: Partial<V3Line> & { id: string }): V3Line {
  return {
    date: '2026-10-05',
    amount: mu(10000),
    role: 'spending',
    status: 'paid',
    seriesId: null,
    categoryId: null,
    coversMonths: null,
    expected: false,
    incomeKind: null,
    countsAs: null,
    ...over,
  };
}

const monthOf = (ym: string, lines: V3Line[]): V3Month => ({ month: ym, full: false, mark: null, lines });
const anchor = (amount: number, at = '2026-10-03') => ({ amount: mu(amount), at });
const pay = ser({ id: 'pay', role: 'pay', anchorDate: '2026-01-28', amount: mu(400000) });
const rent = ser({ id: 'rent', anchorDate: '2026-01-10', amount: mu(150000) });
const util = ser({ id: 'util', anchorDate: '2026-01-20', amount: mu(30000) });

function roll(over: Partial<Parameters<typeof rollForward>[0]> & { lines?: V3Line[] }) {
  const { lines, ...rest } = over;
  const all = lines ?? [];
  const byMonth = new Map<string, V3Line[]>();
  for (const l of all) byMonth.set(l.date.slice(0, 7), [...(byMonth.get(l.date.slice(0, 7)) ?? []), l]);
  return rollForward({
    anchor: anchor(240000),
    asOf: '2026-12-01',
    months: [...byMonth].map(([ym, ls]) => monthOf(ym, ls)),
    series: [],
    e: null,
    ...rest,
  });
}

describe('suggestedUnspent', () => {
  const base = { asOf: '2026-10-03', spending: mu(450000), billsDue: mu(30000), erest: mu(137500), profile: null, series: [] as V3Series[] };
  test('D-43 D-54 suggested = spending balance - bills - Erest (the fund is already out of spending)', () => {
    expect(suggestedUnspent(base)).toBe(282500);
  });
  test('I39 profile (d): horizon bills, no Erest', () => {
    const profile = { types: ['mix' as const], variable: 'balance' as const, steady: null, billsHorizonMonths: 2 as const };
    // rent 10th, util 20th: window [Oct 3, Dec 3) holds Oct 10/20, Nov 10/20 = 2 x 180000
    expect(suggestedUnspent({ ...base, profile, series: [rent, util] })).toBe(450000 - 360000);
  });
});

describe('rollForward', () => {
  test('I40 no flows: value is the anchor, rolled false', () => {
    const r = roll({ lines: [line({ id: 'before', date: '2026-10-02', amount: mu(5000) })] });
    expect(r.value).toBe(240000);
    expect(r.rolled).toBe(false);
  });

  test('I35 user figure wins: value ignores the suggested sum with no flows', () => {
    const r = roll({ anchor: anchor(999999), lines: [] });
    expect(r.value).toBe(999999);
  });

  test('I40 breakdown is exact', () => {
    const roles: LineRole[] = [
      'income', 'spending', 'refund', 'debt_payment', 'saved_invested', 'other_in', 'other_out',
      'own_transfer', 'envelope_deposit', 'envelope_withdrawal', 'emergency_move',
    ];
    const lineArb = integer({ min: 0, max: 80 }).chain((d) =>
      constantFrom(...roles).chain((role) =>
        integer({ min: 1, max: 500000 }).map((amount) =>
          line({ id: `l${d}-${role}-${amount}`, date: new Date(Date.UTC(2026, 9, 1 + d)).toISOString().slice(0, 10), role, amount: mu(amount) })
        )
      )
    );
    fcAssert(
      property(array(lineArb, { maxLength: 25 }), integer({ min: 0, max: 400000 }), (lines, e) => {
        const r = roll({ lines, e: mu(e), series: [pay, rent, util], asOf: '2027-01-31' });
        const b = r.breakdown;
        expect(r.value - 240000).toBe(b.in - b.everyday - b.bills - b.loans - b.investedSaved + b.other);
      })
    );
  });

  test('D-22 planned bills do not move it', () => {
    const r = roll({ series: [rent, util], lines: [line({ id: 'r', date: '2026-10-10', role: 'spending', seriesId: 'rent', amount: mu(150000) }), line({ id: 'u', date: '2026-10-20', seriesId: 'util', amount: mu(30000) })] });
    expect(r.value).toBe(240000);
    expect(r.breakdown.bills).toBe(0);
    expect(r.rolled).toBe(false);
  });

  test('D-41 an ended series keeps its occurrences from before today in the anchor list', () => {
    const ended = ser({ id: 'rent', anchorDate: '2026-01-10', status: 'ended' });
    const r = roll({ series: [ended], lines: [line({ id: 'r', date: '2026-10-10', seriesId: 'rent', amount: mu(150000) })] });
    expect(r.breakdown.bills).toBe(0);
    expect(r.value).toBe(240000);
  });

  test('D-56 a typed or statement line of the right amount settles a bill due at the anchor, and is not everyday', () => {
    for (const source of [undefined, 'statement'] as const) {
      const r = roll({ series: [rent], e: mu(0), lines: [line({ id: 't', date: '2026-10-11', amount: mu(150000), source })] });
      expect(r.breakdown.bills).toBe(0);
      expect(r.breakdown.everyday).toBe(0);
      expect(r.value).toBe(240000);
    }
    const off = roll({ series: [rent], e: mu(0), lines: [line({ id: 't', date: '2026-10-11', amount: mu(100000) })] });
    expect(off.breakdown.everyday).toBe(100000);
  });

  test('M-02 an unmatched linked bill subtracts, line order does not matter', () => {
    const a = line({ id: 'a', date: '2026-10-10', seriesId: 'rent', amount: mu(150000) });
    const b = line({ id: 'b', date: '2026-10-12', seriesId: 'rent', amount: mu(150000) });
    expect(roll({ series: [rent], lines: [a, b] }).breakdown.bills).toBe(150000);
    expect(roll({ series: [rent], lines: [b, a] }).breakdown.bills).toBe(150000);
  });

  test('D-22 a bill not due at the anchor moves it', () => {
    const extra = ser({ id: 'extra', anchorDate: '2026-01-01' }); // due on the 1st, before the anchor
    const r = roll({ series: [extra], lines: [line({ id: 'x', date: '2026-11-01', seriesId: 'extra', amount: mu(150000) })] });
    expect(r.breakdown.bills).toBe(150000);
    expect(r.value).toBe(90000);
  });

  test('D-22 an anchor-month bill with no matching due date moves it', () => {
    const extra = ser({ id: 'extra', anchorDate: '2026-01-01' });
    const r = roll({ series: [extra], lines: [line({ id: 'x', date: '2026-10-25', seriesId: 'extra', amount: mu(150000) })] });
    expect(r.breakdown.bills).toBe(150000);
    expect(r.value).toBe(90000);
  });

  test('same-day lines are ordered by id, equal ids keep their order', () => {
    const lines = ['c', 'a', 'b', 'a'].map((id, i) => line({ id, date: '2026-11-05', amount: mu(1000 + i) }));
    const r = roll({ lines });
    expect(r.breakdown.everyday).toBe(1000 + 1001 + 1002 + 1003);
  });

  test('D-22 planned everyday: only the excess over Erest-at-anchor moves it', () => {
    const e = mu(300000);
    const planned = erestOf(e, mu(0), 3, 31);
    const within = roll({ e, lines: [line({ id: 'a', date: '2026-10-10', amount: mu(planned - 1000) })] });
    expect(within.value).toBe(240000);
    const over = roll({ e, lines: [line({ id: 'a', date: '2026-10-10', amount: mu(planned + 7000) })] });
    expect(over.breakdown.everyday).toBe(7000);
    expect(over.value).toBe(233000);
  });

  test('D-22 later months: Sam November', () => {
    const lines = [
      line({ id: 'pay', date: '2026-11-28', role: 'income', seriesId: 'pay', amount: mu(400000) }),
      line({ id: 'rent', date: '2026-11-10', seriesId: 'rent', amount: mu(150000) }),
      line({ id: 'util', date: '2026-11-20', seriesId: 'util', amount: mu(30000) }),
      line({ id: 'food', date: '2026-11-15', amount: mu(147500) }),
      line({ id: 'save', date: '2026-11-29', role: 'saved_invested', amount: mu(30000) }),
    ];
    const r = roll({ series: [pay, rent, util], lines, asOf: '2026-11-30' });
    expect(r.value).toBe(282500);
    expect(r.breakdown).toEqual({ in: 400000, everyday: 147500, bills: 180000, loans: 0, investedSaved: 30000, other: 0 });
  });

  test('own transfers and emergency moves never move it', () => {
    const r = roll({ lines: [line({ id: 't', role: 'own_transfer' }), line({ id: 'm', role: 'emergency_move' })] });
    expect(r.value).toBe(240000);
    expect(r.rolled).toBe(false);
  });

  test('D-22 stand-in envelope deposit and withdrawal', () => {
    const dep = line({ id: 'd', role: 'envelope_deposit', amount: mu(50000), date: '2026-10-08' });
    const r1 = roll({ lines: [dep] });
    expect(r1.value).toBe(190000);
    expect(r1.breakdown.investedSaved).toBe(50000);
    expect(r1.breakdown.everyday).toBe(0);
    // same number twice and with a monthly set-aside series present: no double count
    const setAside = ser({ id: 'env', role: 'saving', amount: mu(50000), anchorDate: '2026-01-08' });
    expect(roll({ lines: [dep], series: [setAside] }).value).toBe(190000);
    expect(roll({ lines: [dep] }).value).toBe(190000);
    const wd = line({ id: 'w', role: 'envelope_withdrawal', amount: mu(20000), date: '2026-10-12' });
    const r2 = roll({ lines: [dep, wd] });
    expect(r2.value).toBe(210000);
    expect(r2.breakdown.investedSaved).toBe(30000);
  });

  test('D-31 six lines', () => {
    expect(Object.keys(roll({}).breakdown).sort()).toEqual(['bills', 'everyday', 'in', 'investedSaved', 'loans', 'other']);
  });

  test('D-18 refund restores', () => {
    const lines = [line({ id: 'buy', date: '2026-10-06', amount: mu(120000) }), line({ id: 'ref', date: '2026-10-07', role: 'refund', amount: mu(120000) })];
    expect(roll({ lines }).value).toBe(240000);
    expect(roll({ lines, e: mu(0) }).value).toBe(240000);
  });

  test('pending lines and lines after asOf are ignored', () => {
    const r = roll({ asOf: '2026-10-20', lines: [line({ id: 'p', status: 'pending' }), line({ id: 'f', date: '2026-10-25' })] });
    expect(r.value).toBe(240000);
  });
});

describe('unspentState', () => {
  const zero = { in: mu(0), everyday: mu(0), bills: mu(0), loans: mu(0), investedSaved: mu(0), other: mu(0) };
  const st = (over: { at?: string; asOf?: string; value?: number; suggested?: number; thr?: number }) =>
    unspentState({
      anchor: anchor(over.value ?? 100000, over.at ?? '2026-10-01'),
      asOf: over.asOf ?? '2026-10-01',
      roll: { value: mu(over.value ?? 100000), breakdown: zero, rolled: false },
      suggested: mu(over.suggested ?? 100000),
      driftThreshold: mu(over.thr ?? 20000),
      heldBridges: [],
    });

  test('I35 stale', () => {
    expect(st({ asOf: '2026-10-31' })?.stale).toBe(false); // 30 days
    expect(st({ asOf: '2026-11-01' })?.stale).toBe(true); // 31 days
  });

  test('D-22 drifted 10%', () => {
    expect(st({ value: 1000000, suggested: 899000, thr: 10_000_000 })?.drifted).toBe(true);
    expect(st({ value: 1000000, suggested: 910000, thr: 10_000_000 })?.drifted).toBe(false);
  });

  test('D-26 drifted by amount', () => {
    expect(st({ value: 5000000, suggested: 4979000, thr: 20000 })?.drifted).toBe(true);
    expect(st({ value: 5000000, suggested: 4981000, thr: 20000 })?.drifted).toBe(false);
    expect(st({ value: 5000000, suggested: 4970000, thr: 30000 })?.drifted).toBe(false); // JPY-sized threshold
  });

  test('threshold 0 flags any difference', () => {
    expect(st({ value: 100000_00, suggested: 100000_00 - 1, thr: 0 })?.drifted).toBe(true);
    expect(st({ value: 100000_00, suggested: 100000_00, thr: 0 })?.drifted).toBe(false);
  });

  test('no roll falls back to the anchor amount, not rolled', () => {
    const s = unspentState({ anchor: anchor(300000, '2026-10-01'), asOf: '2026-10-01', roll: null, suggested: mu(300000), driftThreshold: mu(20000), heldBridges: [] });
    expect(s?.value).toBe(300000);
    expect(s?.rolled).toBe(false);
  });

  test('null anchor gives null', () => {
    expect(unspentState({ anchor: null, asOf: '2026-10-01', roll: null, suggested: mu(0), driftThreshold: mu(0), heldBridges: [] })).toBeNull();
  });

  describe('held-back bridges (D-38)', () => {
    const bridged = (list: { id: string; amount: number }[], value = 240000, suggested = 240000) =>
      unspentState({
        anchor: anchor(value, '2026-10-01'),
        asOf: '2026-10-01',
        roll: { value: mu(value), breakdown: zero, rolled: false },
        suggested: mu(suggested),
        driftThreshold: mu(20000),
        heldBridges: list.map((b) => ({ id: b.id, amount: b.amount as never })), // raw numbers: some are deliberately invalid
      });

    test('D-38 no bridges: available equals value and heldBack is 0', () => {
      const s = bridged([]);
      expect(s?.available).toBe(240000);
      expect(s?.breakdown.heldBack).toBe(0);
      expect(s?.drifted).toBe(false);
    });

    test('D-38 bridges are subtracted and shown as their own line', () => {
      const s = bridged([{ id: 'a', amount: 30000 }, { id: 'b', amount: 20000 }]);
      expect(s?.available).toBe(190000);
      expect(s?.breakdown.heldBack).toBe(50000);
      expect(s?.value).toBe(240000);
    });

    test('D-38 bridges larger than the value give a negative available', () => {
      expect(bridged([{ id: 'a', amount: 300000 }])?.available).toBe(-60000);
    });

    test('D-38 invalid amounts are ignored and duplicate ids count once', () => {
      const s = bridged([{ id: 'a', amount: -5 }, { id: 'b', amount: 1.5 }, { id: 'c', amount: 10000 }, { id: 'c', amount: 99999 }]);
      expect(s?.breakdown.heldBack).toBe(10000);
      expect(s?.available).toBe(230000);
    });

    test('D-38 drift reads the confirmed figure, not the available one', () => {
      expect(bridged([{ id: 'a', amount: 200000 }])?.drifted).toBe(false);
    });
  });

  test('D-30 value never replaced; typed above suggested is used as given', () => {
    const s = st({ value: 300000, suggested: 200000, at: '2026-10-01', asOf: '2026-10-01' });
    expect(s?.value).toBe(300000);
    expect(s?.drifted).toBe(true);
    const low = st({ value: 100000, suggested: 400000 });
    expect(low?.value).toBe(100000);
  });
});
