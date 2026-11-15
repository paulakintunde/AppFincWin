/**
 * 06.1 CO-D-57 (05.4 D-57; built by 06.1 to the 05.5 month-picture contract), UX-43: the month picture and the past-month bars.
 * The month-end figure is pinned to homeFigure; the unused overdraft is on its own line, never inside the three figures.
 */
import * as fc from 'fast-check';
import { minorUnits } from '../../../../money/types';
import { homeFigure } from '../../afterBuy';
import { monthPicture, pastMonthBars } from '../../month/picture';
import { prepare } from '../../prepare';
import type { V3Account, V3Inputs } from '../../types';
import { inputsOf, monthOf, v3Line, v3Series } from '../helpers/fixtures';
import { fcRuns } from '../helpers/fcRuns';
import { inputsArb, overdraftInputsArb, withOverdraft } from '../invariants/arbitraries';

const mu = minorUnits;
const MONTHLY = { unit: 'month', every: 1 } as const;
const everyday = (id: string, balance: number, over: Partial<V3Account> = {}): V3Account => ({ id, balance: mu(balance), use: { kind: 'everyday' }, kind: 'current', ...over });

/** asOf 2026-10-03: pay 300,000 on the 25th, rent 120,000 on the 10th, phone 5,000 on the 28th, a loan minimum on the 15th. */
function sam(over: Partial<V3Inputs> = {}): V3Inputs {
  const months = ['2026-07', '2026-08', '2026-09'].map((m) =>
    monthOf(m, [
      v3Line({ id: `p-${m}`, date: `${m}-25`, amount: 300_000, role: 'income', seriesId: 'pay' }),
      v3Line({ id: `r-${m}`, date: `${m}-10`, amount: 120_000, role: 'spending', seriesId: 'rent' }),
      v3Line({ id: `e-${m}`, date: `${m}-12`, amount: m === '2026-08' ? 200_000 : 100_000 }),
      v3Line({ id: `f-${m}`, date: `${m}-13`, amount: 2_000, role: 'refund' }),
      v3Line({ id: `t-${m}`, date: `${m}-14`, amount: 50_000, role: 'own_transfer' }),
      v3Line({ id: `x-${m}`, date: `${m}-16`, amount: 9_000, status: 'pending' }),
    ])
  );
  return inputsOf({
    months: [...months, monthOf('2026-10', [], { full: false })],
    series: [
      v3Series({ id: 'pay', role: 'pay', cadence: MONTHLY, anchorDate: '2026-01-25', amount: 300_000 }),
      v3Series({ id: 'rent', role: 'bill', cadence: MONTHLY, anchorDate: '2026-01-10', amount: 120_000 }),
      v3Series({ id: 'phone', role: 'bill', cadence: MONTHLY, anchorDate: '2026-01-28', amount: 5_000 }),
    ],
    debts: [{ id: 'loan', kind: 'loan', balance: mu(500_000), minimum: mu(10_000), apr: null, secured: false, isHousing: false, dueDay: 15 }],
    accounts: [everyday('main', 400_000, { overdraftLimit: mu(50_000) })],
    balance: mu(400_000),
    ...over,
  });
}

describe('CO-D-57 monthPicture', () => {
  it('gives the balance now, after the bills before payday, the month end and the unused overdraft on its own line', () => {
    const p = prepare(sam());
    const pic = monthPicture(p);
    expect(pic.asOf).toBe('2026-10-03');
    expect(pic.payday).toBe('2026-10-25');
    expect(pic.balanceOn).toBe(p.readings[0]?.funds.spending);
    expect(pic.balanceOn).toBe(400_000);
    // rent on the 10th and the loan minimum on the 15th fall before payday; the phone bill on the 28th does not
    expect(pic.afterBillsBeforePayday).toBe(400_000 - 120_000 - 10_000);
    expect(pic.monthEnd).toBe(homeFigure(p));
    expect(pic.unusedOverdraft).toBe(50_000);
    expect(pic.usual).not.toBeNull();
    const u = pic.usual as NonNullable<typeof pic.usual>;
    expect(u.comesIn - u.goesOut).toBe(u.left);
    expect(u.comesIn).toBe(300_000);
    const low = pic.low as NonNullable<typeof pic.low>;
    expect(low.comesIn - low.goesOut).toBe(low.left);
    expect(low.comesIn).toBe(300_000); // a steady earner's low month is read with the typical income
  });

  it('reads every figure from the reading homeFigure reads (the lower month figure)', () => {
    const p = prepare(sam());
    const r = p.readings[0] as (typeof p.readings)[number];
    const higher = { ...r, month: { ...r.month, monthLeft: mu(r.month.monthLeft + 1), typicalLeft: null } };
    const pic = monthPicture({ inputs: p.inputs, readings: [higher, r] });
    expect(pic.monthEnd).toBe(r.month.monthLeft);
    expect(pic.usual).not.toBeNull(); // from r, not from the higher reading (which has no typical month)
  });

  it('with no payday takes the bills to the month end; a drawn overdraft shows only what is left of it', () => {
    const inputs = sam({ accounts: [everyday('main', -20_000, { overdraftLimit: mu(50_000) }), everyday('b', -90_000, { overdraftLimit: mu(50_000) })] });
    const noPay = { ...inputs, series: inputs.series.filter((s) => s.role !== 'pay') };
    const pic = monthPicture(prepare(noPay));
    expect(pic.payday).toBeNull();
    expect(pic.afterBillsBeforePayday).toBe(pic.balanceOn - 120_000 - 10_000 - 5_000);
    expect(pic.unusedOverdraft).toBe(30_000); // 50,000 - 20,000 on main; b is past its limit, so nothing
  });

  it('has no usual or low month without records or estimates, and reads a variable earner low month with its own income', () => {
    const empty = monthPicture(prepare(inputsOf()));
    expect(empty.usual).toBeNull();
    expect(empty.low).toBeNull();
    const months = ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09'].map((m, i) =>
      monthOf(m, [
        v3Line({ id: `p-${m}`, date: `${m}-05`, amount: [100_000, 400_000, 150_000, 500_000, 120_000][i] as number, role: 'income', seriesId: 'gig' }),
        v3Line({ id: `e-${m}`, date: `${m}-12`, amount: 80_000 }),
      ])
    );
    const varied = inputsOf({
      months,
      series: [v3Series({ id: 'gig', role: 'pay', cadence: MONTHLY, anchorDate: '2026-01-05', amount: 100_000 })],
      profile: { types: ['freelance'], variable: null, steady: null, billsHorizonMonths: null, pattern: 'variable', patternConfirmed: true },
    });
    const pic = monthPicture(prepare(varied));
    const low = pic.low as NonNullable<typeof pic.low>;
    const bar = pastMonthBars(prepare(varied)).find((b) => b.month === low.month);
    expect(low.comesIn).toBe(bar?.comesIn);
    expect(low.comesIn - low.goesOut).toBe(low.left);
  });

  it('D-57 the month end always equals homeFigure(prepared), and the overdraft is never inside the three figures', () => {
    fc.assert(
      fc.property(inputsArb, (inputs) => {
        const p = prepare(inputs);
        const pic = monthPicture(p);
        expect(pic.monthEnd).toBe(homeFigure(p));
        expect(pic.afterBillsBeforePayday).toBeLessThanOrEqual(pic.balanceOn);
      }),
      { numRuns: fcRuns(150), seed: 0x0657 }
    );
    fc.assert(
      fc.property(overdraftInputsArb, ({ base, o }) => {
        const withOd = prepare(withOverdraft(base, o));
        const without = prepare(withOverdraft(base, { ...o, overdraftLimit: null }));
        const a = monthPicture(withOd);
        const b = monthPicture(without);
        expect(a.balanceOn).toBe(b.balanceOn);
        expect(a.afterBillsBeforePayday).toBe(b.afterBillsBeforePayday);
        expect(a.unusedOverdraft).toBeGreaterThanOrEqual(0);
        expect(b.unusedOverdraft).toBe(0);
      }),
      { numRuns: fcRuns(60), seed: 0x0658 }
    );
  });
});

describe('UX-43 pastMonthBars', () => {
  it('lists the months before this one oldest first from recorded lines, with left keeping its sign', () => {
    const inputs = sam();
    const shuffled = { ...inputs, months: [...inputs.months].reverse() };
    const bars = pastMonthBars(prepare(shuffled));
    expect(bars.map((b) => b.month)).toEqual(['2026-07', '2026-08', '2026-09']);
    // in 300,000; out rent 120,000 + everyday 100,000 - refund 2,000; own transfers and pending lines are neither
    expect(bars[0]).toEqual({ month: '2026-07', comesIn: 300_000, goesOut: 218_000, left: 82_000 });
    expect(bars[1]?.left).toBe(300_000 - 318_000);
    for (const b of bars) expect(b.comesIn - b.goesOut).toBe(b.left);
  });

  it('reads a month that is not complete too', () => {
    const inputs = inputsOf({
      months: [monthOf('2026-09', [v3Line({ id: 'a', date: '2026-09-02', amount: 7_000, role: 'income', seriesId: 'pay' })], { full: false })],
      series: [v3Series({ id: 'pay', role: 'pay', cadence: MONTHLY, anchorDate: '2026-01-02', amount: 7_000 })],
    });
    expect(pastMonthBars(prepare(inputs))).toEqual([{ month: '2026-09', comesIn: 7_000, goesOut: 0, left: 7_000 }]);
  });
});
