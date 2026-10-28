import { minorUnits as mu } from '../../../../money/types';
import { checkOnce, inputsOf, monthOf, v3Line } from '../../__tests__/helpers/fixtures';
import { evaluate } from '../../evaluate';
import { redateRefunds, withRedatedRefunds } from '../../month/refunds';
import { rollForward } from '../unspent';

// Owner golden (2026-10-28): confirmed unspent 30000 at 2026-05-31, a 10000 purchase in May, a 10000 linked refund
// arriving 2026-06-28, income 200000 and spending 160000 landing 2026-06-30.
const owner = () => [
  monthOf('2026-05', [v3Line({ id: 'p1', date: '2026-05-10', amount: 10000 })]),
  monthOf('2026-06', [
    v3Line({ id: 'r1', date: '2026-06-28', amount: 10000, role: 'refund', refundOf: 'p1' }),
    v3Line({ id: 'in1', date: '2026-06-30', amount: 200000, role: 'income' }),
    v3Line({ id: 'sp1', date: '2026-06-30', amount: 160000 }),
  ]),
];
const anchor = (at: string, amount = 30000) => ({ amount: mu(amount), at });
const rollOf = (asOf: string, logged: ReturnType<typeof owner>, withLogged: boolean, a = anchor('2026-05-31')) =>
  rollForward({ anchor: a, asOf, months: redateRefunds(logged), ...(withLogged ? { logged } : {}), series: [], e: null }).value;

describe('two-date refunds (05.2 owner golden)', () => {
  it('rolled unspent is 40000 on 2026-06-28 and 80000 on 2026-06-30 and 2026-07-01', () => {
    const l = owner();
    expect(rollOf('2026-06-28', l, true)).toBe(40000);
    expect(rollOf('2026-06-30', l, true)).toBe(80000);
    expect(rollOf('2026-07-01', l, true)).toBe(80000);
  });

  it('before the fix the redated months alone gave 30000 and 70000', () => {
    const l = owner();
    expect(rollOf('2026-06-28', l, false)).toBe(30000);
    expect(rollOf('2026-06-30', l, false)).toBe(70000);
  });

  it('the month view still nets the purchase on its purchase date', () => {
    const re = redateRefunds(owner());
    const may = re.find((m) => m.month === '2026-05');
    const june = re.find((m) => m.month === '2026-06');
    expect(may?.lines.some((x) => x.role === 'refund' && x.date === '2026-05-10' && x.amount === 10000)).toBe(true);
    expect(june?.lines.some((x) => x.role === 'refund')).toBe(false);
  });

  it('a refund of a purchase after the anchor is not counted before it arrives', () => {
    const l = [
      monthOf('2026-06', [
        v3Line({ id: 'p2', date: '2026-06-05', amount: 5000 }),
        v3Line({ id: 'r2', date: '2026-06-20', amount: 5000, role: 'refund', refundOf: 'p2' }),
      ]),
    ];
    const a = anchor('2026-05-31', 100000);
    expect(rollOf('2026-06-10', l, true, a)).toBe(95000);
    expect(rollOf('2026-06-20', l, true, a)).toBe(100000);
  });

  it('a refund logged before the anchor is ignored in the logged view', () => {
    const l = [
      monthOf('2026-05', [
        v3Line({ id: 'p5', date: '2026-05-10', amount: 10000 }),
        v3Line({ id: 'r5', date: '2026-05-20', amount: 10000, role: 'refund', refundOf: 'p5' }),
      ]),
    ];
    expect(rollOf('2026-06-30', l, true)).toBe(30000);
  });

  it('an over-refund raises unspent by the whole amount', () => {
    const l = [
      monthOf('2026-05', [v3Line({ id: 'p3', date: '2026-05-10', amount: 10000 })]),
      monthOf('2026-06', [v3Line({ id: 'r3', date: '2026-06-10', amount: 10030, role: 'refund', refundOf: 'p3' })]),
    ];
    expect(rollOf('2026-06-30', l, true)).toBe(40030);
  });

  it('a refund of a payment-plan day-one row raises unspent on arrival', () => {
    const series = [
      {
        id: 'plan',
        role: 'debt_payment' as const,
        cadence: { unit: 'month' as const, every: 1 },
        anchorDate: '2026-05-10',
        endDate: null,
        amount: mu(2000),
        status: 'live' as const,
        confirmed: true,
        payGroup: null,
        countsAs: null,
        incomeKind: null,
        typicalChoice: null,
        categoryId: null,
        isHousing: false,
        savingMode: null,
      },
    ];
    const l = [
      monthOf('2026-05', [v3Line({ id: 'd1', date: '2026-05-10', amount: 6000, seriesId: 'plan', role: 'spending' })]),
      monthOf('2026-06', [v3Line({ id: 'r4', date: '2026-06-12', amount: 6000, role: 'refund', refundOf: 'd1' })]),
    ];
    const v = (asOf: string) => rollForward({ anchor: anchor('2026-05-31'), asOf, months: redateRefunds(l, series), logged: l, series, e: null }).value;
    expect(v('2026-06-11')).toBe(30000);
    expect(v('2026-06-12')).toBe(36000);
  });

  it('evaluate shows 40000 on 2026-06-28 and leaves callers inputs without loggedMonths', () => {
    const raw = inputsOf({ asOf: '2026-06-28', months: owner(), unspent: anchor('2026-05-31'), balance: mu(500000) });
    expect(raw.loggedMonths).toBeUndefined();
    expect(withRedatedRefunds(raw).loggedMonths).toBe(raw.months);
    const ev = evaluate(raw, checkOnce(1000));
    expect(ev.funds.unspent?.value).toBe(40000);
  });
});
