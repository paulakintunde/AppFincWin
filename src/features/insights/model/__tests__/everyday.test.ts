import { barTotals, categoryTotals, compareMonths, monthsInRange } from '@/engine/insights';
import { monthBars, pastMonthBars } from '@/engine/month';
import { prepare } from '@/engine/decide/v3/prepare';
import { inputsOf, monthOf, v3Line } from '@/engine/decide/v3/__tests__/helpers/fixtures';
import { categoryModel, compareModel, inOutModel, recordedMonths } from '../everyday';

function fixture(withLines = true) {
  const month = (m: string) =>
    monthOf(m, [
      v3Line({ id: `p-${m}`, date: `${m}-05`, amount: 300_000, role: 'income' }),
      v3Line({ id: `s-${m}`, date: `${m}-07`, amount: 100_000, categoryId: 'food' }),
    ]);
  return prepare(
    inputsOf({
      asOf: '2026-11-15',
      months: withLines ? [month('2026-08'), month('2026-09'), month('2026-10'), month('2026-11')] : [],
    }),
  );
}

describe('07-09 everyday model', () => {
  it('inOutModel ends with this month and matches Decide past bars', () => {
    const p = fixture();
    const m6 = inOutModel(p, '6m');
    expect(m6.bars[m6.bars.length - 1]?.month).toBe('2026-11');
    const past = pastMonthBars(p);
    for (const b of inOutModel(p, '1y').bars.filter((x) => x.month < '2026-11')) {
      expect(b).toEqual(past.find((x) => x.month === b.month));
    }
    expect(m6.totals).toEqual(barTotals(m6.bars));
    expect(m6.oneMonth).toBe(false);
    expect(m6.empty).toBe(false);
  });

  it('flags empty and one month', () => {
    expect(inOutModel(fixture(false), 'all').empty).toBe(true);
    const one = prepare(inputsOf({ asOf: '2026-11-15', months: [monthOf('2026-11', [v3Line({ id: 'a', date: '2026-11-02', amount: 100 })])] }));
    expect(inOutModel(one, 'all').oneMonth).toBe(true);
  });

  it('categoryModel reads a month or a range from the engine', () => {
    const p = fixture();
    expect(categoryModel(p, { kind: 'month', month: '2026-10' })).toEqual({ ...categoryTotals(p.inputs.months, ['2026-10']), months: ['2026-10'] });
    const months = monthsInRange(monthBars(p, { throughCurrent: true }), '6m');
    expect(categoryModel(p, { kind: 'range', range: '6m' })).toEqual({ ...categoryTotals(p.inputs.months, months), months });
  });

  it('compareModel and recordedMonths', () => {
    const p = fixture();
    expect(compareModel(p, '2026-10')).toEqual(compareMonths(p.inputs.months, monthBars(p, { throughCurrent: true }), '2026-10'));
    expect(recordedMonths(p)).toEqual(['2026-11', '2026-10', '2026-09', '2026-08']);
  });
});
