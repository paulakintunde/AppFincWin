/**
 * 05.3-65 (D-31): "Someone else always pays this" leaves the series out of the typical month and the past-month series
 * figures, from the answer onward. Recorded paid lines stay records. A one-off paid_by_other or a skip leaves the typical
 * month alone (D-27 is per occurrence). Removing the waiver ("Ask again") restores the exact previous result.
 */
import { minorUnits as mu } from '../../../../money/types';
import { evaluate, type Evaluation } from '../../evaluate';
import type { MonthModel, ReadinessWaiver, SkippedOccurrence, V3Inputs, V3Month } from '../../types';
import { personById, toV3Inputs } from '../../__tests__/golden/adapter';
import { checkOnce, inputsOf, monthOf, v3Line, v3Series } from '../../__tests__/helpers/fixtures';
import { buildMonthModel } from '../model';

const MONTHLY = { unit: 'month', every: 1 } as const;
const ASOF = '2026-12-10';
const PAY = v3Series({ id: 'pay', role: 'pay', cadence: MONTHLY, anchorDate: '2025-01-01', amount: 70000 });
const NETFLIX = v3Series({ id: 'netflix', name: 'Netflix', role: 'bill', cadence: MONTHLY, anchorDate: '2025-01-25', amount: 1199 });
const RENT = v3Series({ id: 'rent', name: 'Rent', role: 'bill', cadence: MONTHLY, anchorDate: '2025-01-20', amount: 40000, isHousing: true });

const ymAdd = (start: string, i: number): string => {
  const total = Number(start.slice(5)) - 1 + i;
  return `${Number(start.slice(0, 4)) + Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
};
const incomeOf = (m: string): number => (['05', '06', '07', '08', '09'].includes(m.slice(5)) ? 145000 : 70000);

function history(start: string, count: number): V3Month[] {
  return Array.from({ length: count }, (_, i): V3Month => {
    const m = ymAdd(start, i);
    return monthOf(m, [
      v3Line({ id: `p-${m}`, date: `${m}-01`, amount: incomeOf(m), role: 'income', seriesId: 'pay' }),
      v3Line({ id: `e-${m}`, date: `${m}-15`, amount: 20000 }),
      v3Line({ id: `n-${m}`, date: `${m}-25`, amount: 1199, seriesId: 'netflix' }),
      v3Line({ id: `r-${m}`, date: `${m}-20`, amount: 40000, seriesId: 'rent' }),
    ]);
  });
}

type Pattern = 'variable' | 'seasonal' | 'steady';

function person(over: { waivers?: ReadinessWaiver[]; skipped?: SkippedOccurrence[]; pattern?: Pattern } = {}): V3Inputs {
  return inputsOf({
    asOf: ASOF,
    series: [PAY, NETFLIX, RENT],
    months: [
      ...history('2025-10', 14),
      monthOf('2026-12', [v3Line({ id: 'n-now', date: '2026-12-02', amount: 1199, seriesId: 'netflix' })], { full: false }),
    ],
    profile: {
      types: ['salary'],
      variable: null,
      steady: null,
      billsHorizonMonths: null,
      pattern: over.pattern ?? 'seasonal',
      patternConfirmed: true,
    },
    ...(over.waivers === undefined ? {} : { waivers: over.waivers }),
    ...(over.skipped === undefined ? {} : { skipped: over.skipped }),
  });
}

const ALWAYS: ReadinessWaiver[] = [{ kind: 'always_other', seriesId: 'netflix' }];

describe('buildMonthModel: D-31 always-other in the typical month (05.3-65)', () => {
  const before = buildMonthModel(person());
  const after = buildMonthModel(person({ waivers: ALWAYS }));

  it('recurringBills falls and typicalLeft and the low month rise by the monthly figure', () => {
    expect(before.recurringBills - after.recurringBills).toBe(1199);
    expect((after.typicalLeft as number) - (before.typicalLeft as number)).toBe(1199);
    expect((after.low?.left as number) - (before.low?.left as number)).toBe(1199);
    expect(after.e).toBe(before.e);
  });

  it('every past-month series figure rises by the monthly figure; recorded everyday spending is unchanged', () => {
    const b = before.incomePicture?.months ?? [];
    const a = after.incomePicture?.months ?? [];
    expect(b).toHaveLength(12);
    expect(a.map((m) => m.left - (b.find((x) => x.month === m.month)?.left as number))).toEqual(Array(12).fill(1199));
    expect(a.map((m) => m.everyday)).toEqual(b.map((m) => m.everyday));
    expect((after.incomePicture?.leanLeft as number) - (before.incomePicture?.leanLeft as number)).toBe(1199);
  });

  it('recorded paid lines stay records: the Netflix paid this month still counts', () => {
    expect(after.billsPaid).toBe(before.billsPaid);
    expect(after.billsPaid).toBeGreaterThanOrEqual(1199);
    expect(after.alwaysOther).toEqual([{ seriesId: 'netflix', name: 'Netflix' }]);
  });

  it('a housing series someone else always pays leaves housingMonthly', () => {
    const r = buildMonthModel(person({ waivers: [{ kind: 'always_other', seriesId: 'rent' }] }));
    expect(before.housingMonthly).toBe(40000);
    expect(r.housingMonthly).toBe(0);
  });

  it('a steady earner: the typical month moves the same way', () => {
    const b = buildMonthModel(person({ pattern: 'steady' }));
    const a = buildMonthModel(person({ pattern: 'steady', waivers: ALWAYS }));
    expect(b.recurringBills - a.recurringBills).toBe(1199);
    expect((a.typicalLeft as number) - (b.typicalLeft as number)).toBe(1199);
  });

  it('D-27: a one-off paid_by_other or a skip leaves the typical month unchanged', () => {
    const typicalPart = (m: MonthModel): string =>
      JSON.stringify([m.recurringBills, m.typicalLeft, m.low, m.e, m.categoryMonthly, m.housingMonthly, m.incomePicture?.months]);
    const once = buildMonthModel(person({ waivers: [{ kind: 'paid_by_other', seriesId: 'netflix', date: '2026-11-25' }] }));
    const skip = buildMonthModel(person({ skipped: [{ seriesId: 'netflix', date: '2026-12-25' }] }));
    expect(typicalPart(once)).toBe(typicalPart(before));
    expect(typicalPart(skip)).toBe(typicalPart(before));
  });

  it('Ask again: inputs without the waiver give back the exact previous result', () => {
    expect(JSON.stringify(buildMonthModel(person({ waivers: [] })))).toBe(JSON.stringify(before));
  });

  it('no waivers and no skips: the golden person is byte-identical', () => {
    const sam = toV3Inputs(personById('sam'));
    expect(JSON.stringify(buildMonthModel({ ...sam, waivers: [], skipped: [] }))).toBe(JSON.stringify(buildMonthModel(sam)));
  });
});

describe('agreement with 05.3-64 in one evaluate() run (D-31)', () => {
  const run = (waivers?: ReadinessWaiver[]): Evaluation =>
    evaluate(
      inputsOf({
        asOf: '2026-10-10',
        series: [NETFLIX],
        months: [monthOf('2026-10', [], { full: false })],
        unspent: { amount: mu(50000), at: '2026-10-05' },
        ...(waivers === undefined ? {} : { waivers }),
      }),
      checkOnce(5000)
    );
  const shortBy = (e: Evaluation): number => (e.cash.kind === 'ok' || e.cash.kind === 'overdraft' || e.cash.kind === 'net' ? 0 : e.cash.shortBy);

  it('always_other(Netflix 1199): recurringBills, billsDue and the cash path all drop the Netflix amount', () => {
    const b = run();
    const a = run(ALWAYS);
    expect(b.month.recurringBills - a.month.recurringBills).toBe(1199);
    expect(b.month.billsDue - a.month.billsDue).toBe(1199);
    expect(shortBy(b) - shortBy(a)).toBe(3 * 1199); // 10-25, 11-25 and 12-25 in the 90-day horizon
    expect(a.funds.suggested - b.funds.suggested).toBe(1199);
    expect(a.funds.unspent?.value).toBe(b.funds.unspent?.value); // D-32: the confirmed figure is never raised
  });
});
