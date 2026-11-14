// 06.1-79 (H-16, DS-10, OQ-79-2 A): one months-of-records count, the one the answer's basis line uses.
import { judgeCheck, prepare, type V3Inputs } from '@/engine/decide/v3';
import { checkOnce, inputsOf, monthOf, v3Line, v3Series } from '@/engine/decide/v3/__tests__/helpers/fixtures';
import { minorUnits } from '@/engine/money';
import { recordMonthsOf, type RecordMonthsSource } from '../recordMonths';

/** Three months marked full; September's everyday spending is far below the others (under-logged), so the engine leaves it out. */
function threeFullOneThin(): V3Inputs {
  const mk = (m: string, everyday: number) =>
    monthOf(m, [
      v3Line({ id: `p-${m}`, date: `${m}-25`, amount: 300_000, role: 'income', seriesId: 'pay' }),
      v3Line({ id: `r-${m}`, date: `${m}-10`, amount: 120_000, role: 'spending', seriesId: 'rent' }),
      v3Line({ id: `e-${m}`, date: `${m}-12`, amount: everyday }),
    ]);
  return inputsOf({
    months: [mk('2026-07', 100_000), mk('2026-08', 100_000), mk('2026-09', 1_000), monthOf('2026-10', [], { full: false })],
    series: [
      v3Series({ id: 'pay', role: 'pay', cadence: { unit: 'month', every: 1 }, anchorDate: '2026-01-25', amount: 300_000 }),
      v3Series({ id: 'rent', role: 'bill', cadence: { unit: 'month', every: 1 }, anchorDate: '2026-01-10', amount: 120_000 }),
    ],
    balance: minorUnits(400_000),
    recordsAsOf: '2026-10-01',
  });
}

const source = (basis: NonNullable<RecordMonthsSource['result']['confidence']>['basis'], monthsUsed: string[]): RecordMonthsSource => ({
  result: { confidence: { basis } },
  month: { monthsUsed },
});

describe('recordMonthsOf', () => {
  it('DS-10: three months marked full, the answer uses two; the count shown is the answer’s, not the full-month count', () => {
    const inputs = threeFullOneThin();
    const evaluation = judgeCheck(prepare(inputs), checkOnce(10_000));
    const basis = evaluation.result.confidence.basis;
    expect(basis).toMatchObject({ kind: 'partial', used: 2, lookedFor: 3 });
    expect(inputs.months.filter((m) => m.full)).toHaveLength(3); // the old home count
    // the two months used each hold rent and an everyday line
    expect(recordMonthsOf(inputs, evaluation)).toEqual({ used: 2, total: 3, entries: 4 });
  });

  it('enough months: the basis months, out of at least three', () => {
    expect(recordMonthsOf(null, source({ kind: 'records', months: 3, upTo: '2026-10-01' }, ['2026-07', '2026-08', '2026-09']))).toEqual({ used: 3, total: 3, entries: 0 });
    expect(recordMonthsOf(null, source({ kind: 'records_with_reason', months: 6, upTo: '2026-10-01', reason: 'pay_missed' }, []))).toEqual({ used: 6, total: 6, entries: 0 });
  });

  it('quick estimates: the months the month model used', () => {
    expect(recordMonthsOf(null, source({ kind: 'quick_estimates' }, ['2026-09']))).toEqual({ used: 1, total: 3, entries: 0 });
  });

  it('no evaluation yet, or one without its basis or month model: nothing used', () => {
    expect(recordMonthsOf(null, null)).toEqual({ used: 0, total: 3, entries: 0 });
    expect(recordMonthsOf(null, { result: {} })).toEqual({ used: 0, total: 3, entries: 0 });
    expect(recordMonthsOf(null, { result: { confidence: { basis: { kind: 'quick_estimates' } } } })).toEqual({ used: 0, total: 3, entries: 0 });
  });
});
