import { minorUnits as mu } from '../../../../money/types';
import type { Envelope, V3Inputs, V3Line, V3Month, V3Series } from '../../types';
import { inputsOf, monthOf, v3Line, v3Series } from '../../__tests__/helpers/fixtures';
import { refine, refineNoise, type RefineInput } from '../refine';

const ASOF = '2026-10-03'; // full past months: 2026-04 .. 2026-09
const MONTH = { unit: 'month', every: 1 } as const;
const PAST = ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'];

const everyday = (month: string, amount: number, mark: V3Month['mark'] = null): V3Month =>
  monthOf(month, [v3Line({ id: `e-${month}`, date: `${month}-10`, amount })], { mark });
const evenMonths = (months: readonly string[], amount: number): V3Month[] => months.map((m) => everyday(m, amount));
const income = (month: string, amount: number): V3Line => v3Line({ id: `i-${month}`, date: `${month}-01`, amount, role: 'income' });

function inp(over: Partial<V3Inputs> = {}, more: Partial<RefineInput> = {}): RefineInput {
  return {
    inputs: inputsOf({ asOf: ASOF, ...over }),
    setupDoneAt: null,
    setupRough: false,
    overrideAt: null,
    lastAt: null,
    snoozeUntil: null,
    candidates: [],
    cardStatements: [],
    ...more,
  };
}
const kinds = (r: ReturnType<typeof refine>): string[] => r.cards.map((c) => c.kind);

const payOf = (over: Partial<V3Series> = {}): V3Series => ({
  ...v3Series({ id: 'pay1', role: 'pay', cadence: MONTH, anchorDate: '2026-04-01', amount: 400000 }),
  ...over,
});
const paidPay = (month: string, amount: number, seriesId = 'pay1'): V3Line =>
  v3Line({ id: `p-${seriesId}-${month}`, date: `${month}-01`, amount, role: 'income', seriesId });
const profileOf = (steady: number | null) => ({ types: ['salary' as const], variable: null, steady: steady === null ? null : mu(steady), billsHorizonMonths: null });

describe('refineNoise (owner OQ2: the largest of floor, 5% and the spread)', () => {
  it('uses 5% of the figure rounded up when it is the largest', () => {
    expect(refineNoise(mu(100000), [])).toBe(5000);
    expect(refineNoise(mu(100001), [])).toBe(5001);
  });
  it('uses the floor for small figures and reads the size, not the sign', () => {
    expect(refineNoise(mu(20000), [])).toBe(2500);
    expect(refineNoise(mu(-100000), [])).toBe(5000);
  });
  it('uses the median absolute deviation over at least 3 months when it is the largest', () => {
    expect(refineNoise(mu(100000), [mu(90000), mu(100000), mu(110000), mu(130000)])).toBe(10000);
  });
  it('ignores the spread with fewer than 3 months and looks only at the last 6', () => {
    expect(refineNoise(mu(100000), [mu(0), mu(1000000)])).toBe(5000);
    expect(refineNoise(mu(100000), [mu(9000000), ...Array.from({ length: 6 }, () => mu(100000))])).toBe(5000);
  });
});

describe('refine gates and time triggers (D-12)', () => {
  it('is not due before 3 full months since setup and due at 3', () => {
    const two = inp({ months: evenMonths(['2026-08', '2026-09'], 50000) }, { setupDoneAt: '2026-06-15' });
    expect(refine(two)).toEqual({ due: false, triggers: [], cards: [] });
    const three = inp({ months: evenMonths(['2026-07', '2026-08', '2026-09'], 50000) }, { setupDoneAt: '2026-06-15' });
    expect(refine(three)).toEqual({ due: true, triggers: ['three_months'], cards: [] });
  });
  it('is due after 1 full month when setup was rough', () => {
    const r = refine(inp({ months: evenMonths(['2026-09'], 50000) }, { setupDoneAt: '2026-08-20', setupRough: true }));
    expect(r.triggers).toEqual(['rough_one_month']);
    expect(refine(inp({ months: [] }, { setupDoneAt: '2026-08-20', setupRough: true })).due).toBe(false);
  });
  it('counts months from the last check-in once there is one', () => {
    const months = evenMonths(PAST, 50000);
    const r = refine(inp({ months }, { setupDoneAt: '2026-01-10', lastAt: '2026-08-31' }));
    expect(r.due).toBe(false); // only 2026-09 since 2026-08-31
    expect(refine(inp({ months }, { setupDoneAt: '2026-01-10', lastAt: '2026-06-30' })).triggers).toEqual(['three_months']);
  });
  it('never counts a month that is not full or is the current month', () => {
    const months = [...evenMonths(['2026-07', '2026-08'], 50000), { ...everyday('2026-09', 50000), full: false }, everyday('2026-10', 50000)];
    expect(refine(inp({ months }, { setupDoneAt: '2026-06-15' })).due).toBe(false);
  });
  it('has no time trigger without a setup date', () => {
    expect(refine(inp({ months: evenMonths(PAST, 50000) })).due).toBe(false);
  });
  it('hides for the gap after a check-in and while snoozed, and shows again after', () => {
    const base = { months: evenMonths(PAST, 50000) };
    const due = { setupDoneAt: '2026-01-10' };
    expect(refine(inp(base, { ...due, lastAt: '2026-09-23' }))).toEqual({ due: false, triggers: [], cards: [] });
    expect(refine(inp(base, { ...due, lastAt: '2026-10-05' })).due).toBe(false);
    expect(refine(inp(base, { ...due, snoozeUntil: '2026-10-10' }))).toEqual({ due: false, triggers: [], cards: [] });
    expect(refine(inp(base, { ...due, snoozeUntil: '2026-10-03' })).due).toBe(true);
    expect(refine(inp(base, { ...due, lastAt: '2026-09-03' })).due).toBe(true);
  });
});

describe('everyday cards (D-12, D-20)', () => {
  it('a typed everyday figure 15% off the records two months running makes a card', () => {
    const months = [...evenMonths(PAST.slice(0, 4), 120000), everyday('2026-08', 120000), everyday('2026-09', 121000)];
    const r = refine(inp({ months, everydayOverride: mu(100000) }));
    expect(r.triggers).toEqual(['typed_off']);
    expect(r.cards).toEqual([{ kind: 'everyday', ref: null, month: null, current: 100000, suggested: 120000, noise: 6000 }]);
  });
  it('no everyday card when the typical month is within the noise', () => {
    const months = evenMonths(PAST, 102000);
    const r = refine(inp({ months, everydayOverride: mu(100000) }, { setupDoneAt: '2026-01-10' }));
    expect(kinds(r)).toEqual([]);
    expect(r.triggers).toEqual(['three_months']);
  });
  it('shows the card on a time trigger alone when only one recent month is off', () => {
    const months = [...evenMonths(PAST.slice(0, 5), 120000), everyday('2026-09', 100000)];
    const r = refine(inp({ months, everydayOverride: mu(100000) }, { setupDoneAt: '2026-01-10' }));
    expect(r.triggers).toEqual(['three_months']);
    expect(kinds(r)).toEqual(['everyday']);
  });
  it('a typed figure with fewer than 2 full months is not typed-off', () => {
    const r = refine(inp({ months: evenMonths(['2026-09'], 120000), everydayOverride: mu(100000) }));
    expect(r.triggers).toEqual([]);
  });
  it('typed-off needs both recent months off, not just the typical month', () => {
    const months = [...evenMonths(PAST.slice(0, 4), 150000), everyday('2026-08', 100000), everyday('2026-09', 100000)];
    const r = refine(inp({ months, everydayOverride: mu(100000) }, { setupDoneAt: '2026-01-10' }));
    expect(r.triggers).toEqual(['three_months']);
  });
  it('months marked out or half never count', () => {
    const months = [...evenMonths(PAST.slice(0, 3), 50000), everyday('2026-07', 900000, 'out'), everyday('2026-08', 900000, 'half'), everyday('2026-09', 50000, 'normal')];
    const r = refine(inp({ months, everydayOverride: mu(50000) }, { setupDoneAt: '2026-01-10' }));
    expect(kinds(r)).toEqual([]);
  });
  it('no everyday card without records', () => {
    const r = refine(inp({ months: [], everydayOverride: mu(100000) }, { setupDoneAt: '2026-01-10', overrideAt: '2026-09-20' }));
    expect(kinds(r)).toEqual([]);
  });
  it('an override older than 90 days is flagged, with no value change when the records agree', () => {
    const months = evenMonths(PAST, 100000);
    const r = refine(inp({ months, everydayOverride: mu(100000) }, { overrideAt: '2026-06-01' }));
    expect(r.triggers).toEqual(['life_change']);
    expect(r.cards).toEqual([{ kind: 'everyday_override_expiring', ref: null, month: null, current: 100000, suggested: null, noise: null }]);
    expect(kinds(refine(inp({ months, everydayOverride: mu(100000) }, { overrideAt: '2026-08-01' })))).toEqual([]);
  });
  it('an override older than 90 days is flagged without records; with no date it is not', () => {
    expect(kinds(refine(inp({ months: [], everydayOverride: mu(100000) }, { overrideAt: '2026-06-01' })))).toEqual(['everyday_override_expiring']);
    expect(kinds(refine(inp({ months: [], everydayOverride: mu(100000) }, { overrideAt: null })))).toEqual([]);
  });
  it('an override whose records median moved 20% is flagged even when the spread hides a value card', () => {
    const jumpy = [10000, 300000, 10000, 300000, 10000, 300000].map((a, i) => everyday(PAST[i] as string, a));
    const r = refine(inp({ months: jumpy, everydayOverride: mu(100000) }, { overrideAt: '2026-09-20' }));
    expect(kinds(r)).toEqual(['everyday_override_expiring']);
  });
  it('an old override does not add a second card when an everyday card is already shown', () => {
    const r = refine(inp({ months: evenMonths(PAST, 150000), everydayOverride: mu(100000) }, { overrideAt: '2026-01-01' }));
    expect(kinds(r)).toEqual(['everyday']);
  });
});

describe('new regular items and income cards', () => {
  it('a candidate repeating 3 times is a new_regular card; 2 is nothing', () => {
    const r = refine(
      inp({}, { candidates: [{ key: 'b', occurrences: 2, amount: mu(900) }, { key: 'c', occurrences: 4, amount: mu(700) }, { key: 'a', occurrences: 3, amount: mu(1500) }] })
    );
    expect(r.triggers).toEqual(['new_repeating']);
    expect(r.cards).toEqual([
      { kind: 'new_regular', ref: 'a', month: null, current: null, suggested: 1500, noise: null },
      { kind: 'new_regular', ref: 'c', month: null, current: null, suggested: 700, noise: null },
    ]);
    expect(refine(inp({}, { candidates: [{ key: 'b', occurrences: 2, amount: mu(900) }] })).due).toBe(false);
  });
  it('a pay that moved less than the noise is not a card; one that moved more is', () => {
    const mk = (amount: number): RefineInput =>
      inp({ series: [payOf()], months: PAST.slice(3).map((m) => monthOf(m, [paidPay(m, amount)])) }, { setupDoneAt: '2026-01-10' });
    expect(kinds(refine(mk(415000)))).toEqual([]);
    const r = refine(mk(440000));
    expect(r.cards).toEqual([{ kind: 'pay', ref: 'pay1', month: null, current: 400000, suggested: 440000, noise: 20000 }]);
    expect(r.triggers).toEqual(['three_months', 'life_change']);
  });
  it('a pay needs 3 paid lines before it is judged', () => {
    const months = ['2026-08', '2026-09'].map((m) => monthOf(m, [paidPay(m, 440000)]));
    expect(kinds(refine(inp({ series: [payOf()], months }, { setupDoneAt: '2026-01-10' })))).toEqual([]);
  });
  it('a pay series that is not confirmed is not judged', () => {
    const months = PAST.slice(2).map((m) => monthOf(m, [paidPay(m, 440000)]));
    expect(kinds(refine(inp({ series: [payOf({ confirmed: false })], months }, { setupDoneAt: '2026-01-10' })))).toEqual([]);
  });
  it('a regular pay with no paid line for its last 2 expected dates has stopped', () => {
    const months = [monthOf('2026-06', [paidPay('2026-06', 400000)]), ...evenMonths(['2026-07', '2026-08', '2026-09'], 50000)];
    const r = refine(inp({ series: [payOf()], months }));
    expect(r.cards).toEqual([{ kind: 'pay_stopped', ref: 'pay1', month: null, current: 400000, suggested: null, noise: null }]);
    expect(r.triggers).toEqual(['life_change']);
  });
  it('a pay is not stopped when one of the last 2 dates was paid, paid a few days late, or never paid at all', () => {
    const late = [monthOf('2026-06', [paidPay('2026-06', 400000)]), monthOf('2026-09', [v3Line({ id: 'late', date: '2026-09-05', amount: 400000, role: 'income', seriesId: 'pay1' })])];
    expect(kinds(refine(inp({ series: [payOf()], months: late })))).not.toContain('pay_stopped');
    const never = evenMonths(['2026-07', '2026-08', '2026-09'], 50000);
    expect(kinds(refine(inp({ series: [payOf()], months: never })))).toEqual([]);
  });
  it('a pay series with fewer than 2 expected dates past the grace is not stopped', () => {
    const recent = payOf({ anchorDate: '2026-09-28' });
    const r = refine(inp({ series: [recent], months: [monthOf('2026-06', [paidPay('2026-06', 400000)])] }));
    expect(kinds(r)).toEqual([]);
  });
  it('a steady amount above the income of the last 2 months makes a card with the lowest of the last 3', () => {
    const months = [
      ...['2026-04', '2026-05', '2026-06', '2026-07'].map((m) => monthOf(m, [income(m, 400000)])),
      monthOf('2026-08', [income('2026-08', 300000)]),
      monthOf('2026-09', [income('2026-09', 320000)]),
    ];
    const r = refine(inp({ months, profile: profileOf(350000) }));
    expect(r.cards.map((c) => [c.kind, c.current, c.suggested])).toEqual([['steady_above_income', 350000, 300000]]);
    expect(r.triggers).toEqual(['life_change']);
  });
  it('no steady card when only one recent month is below, the gap is within the noise, or history is short', () => {
    const one = [monthOf('2026-08', [income('2026-08', 400000)]), monthOf('2026-09', [income('2026-09', 300000)])];
    expect(kinds(refine(inp({ months: one, profile: profileOf(350000) })))).toEqual([]);
    const near = [monthOf('2026-08', [income('2026-08', 345000)]), monthOf('2026-09', [income('2026-09', 346000)])];
    expect(kinds(refine(inp({ months: near, profile: profileOf(350000) })))).toEqual([]);
    expect(kinds(refine(inp({ months: [monthOf('2026-09', [income('2026-09', 100000)])], profile: profileOf(350000) })))).toEqual([]);
    expect(kinds(refine(inp({ months: one, profile: profileOf(null) })))).toEqual([]);
  });
  it('a series that drifted past 5% and the noise is a series_drift card', () => {
    const bill = v3Series({ id: 'rent', role: 'bill', cadence: MONTH, anchorDate: '2026-01-05', amount: 100000 });
    const months = ['2026-08', '2026-09'].map((m) => monthOf(m, [v3Line({ id: `r-${m}`, date: `${m}-05`, amount: 120000, seriesId: 'rent' })]));
    const r = refine(inp({ series: [bill], months }));
    expect(r.cards).toEqual([{ kind: 'series_drift', ref: 'rent', month: null, current: 100000, suggested: 120000, noise: 5000 }]);
    expect(r.triggers).toEqual(['life_change']);
  });
  it('a drift under the noise from a jumpy history is not a card, and a drifted pay is left to the pay card', () => {
    const bill = v3Series({ id: 'power', role: 'bill', cadence: MONTH, anchorDate: '2026-01-05', amount: 100000 });
    const amounts = [100000, 400000, 50000, 600000, 106000, 107000];
    const months = PAST.map((m, i) => monthOf(m, [v3Line({ id: `w${i}`, date: `${m}-05`, amount: amounts[i] as number, seriesId: 'power' })]));
    expect(kinds(refine(inp({ series: [bill], months }, { setupDoneAt: '2026-01-10' })))).toEqual([]);
    const pm = ['2026-08', '2026-09'].map((m) => monthOf(m, [paidPay(m, 460000)]));
    expect(kinds(refine(inp({ series: [payOf()], months: pm }, { setupDoneAt: '2026-01-10' })))).toEqual([]);
  });
});

describe('cards, buckets, unspent and under-logged months', () => {
  it('a card said to be paid in full that was not for 2 statements', () => {
    const r = refine(
      inp({}, {
        cardStatements: [
          { debtId: 'b', statedPaysInFull: 'yes', paidInFull: [true, false, false] },
          { debtId: 'a', statedPaysInFull: 'yes', paidInFull: [false, false] },
          { debtId: 'c', statedPaysInFull: 'yes', paidInFull: [false, true] },
          { debtId: 'd', statedPaysInFull: 'yes', paidInFull: [false] },
          { debtId: 'e', statedPaysInFull: 'no', paidInFull: [false, false] },
          { debtId: 'f', statedPaysInFull: null, paidInFull: [false, false] },
        ],
      })
    );
    expect(r.cards).toEqual([
      { kind: 'card_not_paid_in_full', ref: 'a', month: null, current: null, suggested: null, noise: null },
      { kind: 'card_not_paid_in_full', ref: 'b', month: null, current: null, suggested: null, noise: null },
    ]);
    expect(r.triggers).toEqual(['life_change']);
  });
  it('a saving bucket with a monthly amount is a card, with the target only when it is beyond the noise', () => {
    const env = (over: Partial<Envelope>): Envelope => ({ id: 'z', kind: 'pot', target: mu(100000), monthlyAmount: mu(5000), readyBy: null, saved: mu(20000), purposeId: null, bucket: true, ...over });
    const envelopes = [
      env({ id: 'b2', target: null }),
      env({ id: 'b1' }),
      env({ id: 'near', saved: mu(99000) }),
      env({ id: 'nomonthly', monthlyAmount: null }),
      env({ id: 'plain', bucket: false }),
      env({ id: 'unflagged', bucket: undefined }),
    ];
    const r = refine(inp({ envelopes, months: evenMonths(PAST, 50000) }, { setupDoneAt: '2026-01-10' }));
    expect(r.cards).toEqual([
      { kind: 'saving_bucket', ref: 'b1', month: null, current: 20000, suggested: 100000, noise: 2500 },
      { kind: 'saving_bucket', ref: 'b2', month: null, current: 20000, suggested: null, noise: null },
      { kind: 'saving_bucket', ref: 'near', month: null, current: 99000, suggested: null, noise: null },
    ]);
  });
  it('an unspent figure that the account balances disagree with beyond the noise is a card', () => {
    const accounts = [
      { id: 'a1', balance: mu(300000), use: { kind: 'everyday' as const } },
      { id: 'a2', balance: mu(100000), use: { kind: 'mixed' as const, extraSetAside: null } },
      { id: 'a3', balance: mu(9000000), use: { kind: 'untouched' as const } },
      { id: 'a4', balance: mu(9000000), use: null },
    ];
    const months = evenMonths(PAST, 50000);
    const unspent = { amount: mu(150000), at: '2026-09-30' };
    const base = { months, accounts, unspent };
    const setup = { setupDoneAt: '2026-01-10' };
    const r = refine(inp(base, setup));
    expect(r.cards.map((c) => [c.kind, c.suggested])).toEqual([['unspent', 400000]]);
    const agree = refine(inp({ ...base, accounts: [{ id: 'a1', balance: mu(152000), use: { kind: 'everyday' as const } }] }, setup));
    expect(kinds(agree)).toEqual([]);
    const none = refine(inp({ ...base, accounts: [{ id: 'a3', balance: mu(5), use: { kind: 'untouched' as const } }] }, setup));
    expect(kinds(none)).toEqual([]);
    expect(kinds(refine(inp({ months, unspent }, setup)))).toEqual([]);
    expect(kinds(refine(inp({ months, accounts }, setup)))).toEqual([]);
    expect(kinds(refine(inp({ ...base, months: [] }, setup)))).toEqual([]);
  });
  it('the newest full month far under the typical month is suggested once as under-logged', () => {
    const months = [...evenMonths(PAST.slice(0, 3), 100000), everyday('2026-07', 20000), everyday('2026-08', 100000), everyday('2026-09', 10000)];
    const r = refine(inp({ months }));
    expect(r.cards).toEqual([{ kind: 'under_logged_month', ref: null, month: '2026-09', current: null, suggested: null, noise: null }]);
    expect(r.triggers).toEqual(['life_change']);
  });
  it('a month marked half, out or normal is never suggested as under-logged', () => {
    const base = evenMonths(PAST.slice(0, 4), 100000);
    for (const mark of ['half', 'out', 'normal'] as const) {
      expect(kinds(refine(inp({ months: [...base, everyday('2026-08', 100000), everyday('2026-09', 10000, mark)] })))).toEqual([]);
    }
  });
  it('a single month cannot be under-logged against nothing', () => {
    expect(kinds(refine(inp({ months: [everyday('2026-09', 10)] })))).toEqual([]);
  });
});

describe('order and codes only', () => {
  it('lists cards in the D-59 order and holds only codes and integers', () => {
    const bill = v3Series({ id: 'rent', role: 'bill', cadence: MONTH, anchorDate: '2026-01-05', amount: 100000 });
    const months = PAST.map((m, i) =>
      i >= 4
        ? monthOf(m, [v3Line({ id: `r-${m}`, date: `${m}-05`, amount: 120000, seriesId: 'rent' }), income(m, 300000), v3Line({ id: `e${m}`, date: `${m}-10`, amount: 150000 })])
        : everyday(m, i === 3 ? 10000 : 150000)
    );
    const r = refine(
      inp(
        { months, series: [bill, payOf({ anchorDate: '2026-04-01' })], everydayOverride: mu(100000), profile: profileOf(350000) },
        {
          setupDoneAt: '2026-01-10',
          overrideAt: '2026-09-01',
          candidates: [{ key: 'k', occurrences: 3, amount: mu(1000) }],
          cardStatements: [{ debtId: 'c1', statedPaysInFull: 'yes', paidInFull: [false, false] }],
        }
      )
    );
    expect(kinds(r)).toEqual(['pay_stopped', 'everyday', 'steady_above_income', 'series_drift', 'card_not_paid_in_full', 'new_regular', 'under_logged_month']);
    expect(r.triggers).toEqual(['three_months', 'typed_off', 'new_repeating', 'life_change']);
    for (const c of r.cards) {
      for (const v of [c.current, c.suggested, c.noise]) expect(v === null || Number.isInteger(v)).toBe(true);
      expect(c.ref === null || typeof c.ref === 'string').toBe(true);
    }
  });
});
