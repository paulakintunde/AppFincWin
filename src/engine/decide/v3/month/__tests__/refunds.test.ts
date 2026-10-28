import { minorUnits } from '../../../../money/types';
import type { LineRole, V3Inputs, V3Line, V3Month } from '../../types';
import type { V3Series } from '../../types';
import { redateRefunds, withRedatedRefunds } from '../refunds';

const mu = minorUnits;

function line(id: string, date: string, amount: number, role: LineRole, extra: Partial<V3Line> = {}): V3Line {
  return {
    id,
    date,
    amount: mu(amount),
    role,
    status: 'paid',
    seriesId: null,
    categoryId: null,
    coversMonths: null,
    expected: false,
    incomeKind: null,
    countsAs: null,
    ...extra,
  };
}

function month(ym: string, lines: V3Line[]): V3Month {
  return { month: ym, full: true, mark: null, lines };
}

const purchase = line('p1', '2026-05-10', 1000000, 'spending', { categoryId: 'C' });
const refundLine = (id: string, date: string, amount: number): V3Line => line(id, date, amount, 'refund', { refundOf: 'p1', categoryId: 'X' });

const run = (refunds: V3Line[], p: V3Line = purchase): readonly V3Month[] =>
  redateRefunds([month('2026-05', [p]), month('2026-06', refunds.filter((r) => r.date.startsWith('2026-06'))), month('2026-07', refunds.filter((r) => r.date.startsWith('2026-07')))]);

describe('redateRefunds', () => {
  it('full refund lands in the purchase month with its date and category', () => {
    const out = run([refundLine('r1', '2026-07-05', 1000000)]);
    expect(out[0]?.lines.map((l) => l.id)).toEqual(['p1', 'r1']);
    const r = out[0]?.lines[1] as V3Line;
    expect(r).toMatchObject({ role: 'refund', date: '2026-05-10', categoryId: 'C', amount: 1000000, refundOf: null });
    expect(out[2]?.lines).toEqual([]);
  });

  it('a short refund (998000) is credited in full; the shortfall stays as May spending', () => {
    const out = run([refundLine('r1', '2026-07-05', 998000)]);
    expect(out[0]?.lines[1]).toMatchObject({ role: 'refund', amount: 998000 });
    expect(out[2]?.lines).toEqual([]);
  });

  it('a refund over the price (1003000) keeps the surplus in its own month as other_in', () => {
    const out = run([refundLine('r1', '2026-07-05', 1003000)]);
    expect(out[0]?.lines[1]).toMatchObject({ role: 'refund', amount: 1000000 });
    expect(out[2]?.lines).toEqual([expect.objectContaining({ id: 'r1:surplus', role: 'other_in', amount: 3000, refundOf: null, date: '2026-07-05' })]);
  });

  it('two partials apply in date order; the second overflows into a surplus', () => {
    const out = run([refundLine('r2', '2026-07-05', 700000), refundLine('r1', '2026-06-05', 400000)]);
    const may = out[0]?.lines ?? [];
    expect(may.map((l) => [l.id, l.amount])).toEqual([
      ['p1', 1000000],
      ['r1', 400000],
      ['r2', 600000],
    ]);
    expect(out[1]?.lines).toEqual([]);
    expect(out[2]?.lines).toEqual([expect.objectContaining({ id: 'r2:surplus', amount: 100000 })]);
  });

  it('same-date refunds are ordered by id; a refund after the room is gone is all surplus', () => {
    const out = run([refundLine('b', '2026-07-05', 800000), refundLine('a', '2026-07-05', 800000)]);
    expect(out[0]?.lines.map((l) => [l.id, l.amount])).toEqual([
      ['p1', 1000000],
      ['a', 800000],
      ['b', 200000],
    ]);
    expect(out[2]?.lines).toEqual([expect.objectContaining({ id: 'b:surplus', amount: 600000 })]);
    const out2 = run([refundLine('a', '2026-07-05', 1000000), refundLine('b', '2026-07-05', 50000)]);
    expect(out2[0]?.lines.map((l) => l.id)).toEqual(['p1', 'a']);
    expect(out2[2]?.lines).toEqual([expect.objectContaining({ id: 'b:surplus', amount: 50000 })]);
  });

  it('a purchase that is not in the months leaves the refund where it is', () => {
    const r = refundLine('r1', '2026-07-05', 500);
    const months = [month('2026-07', [r])];
    expect(redateRefunds(months)).toBe(months);
  });

  it('refundOf on a non-refund line is ignored', () => {
    const odd = line('o1', '2026-07-05', 500, 'income', { refundOf: 'p1' });
    const months = [month('2026-05', [purchase]), month('2026-07', [odd])];
    expect(redateRefunds(months)).toBe(months);
  });

  it('a purchase that is not spending leaves the refund unchanged', () => {
    const inc = line('p1', '2026-05-10', 1000, 'income');
    const months = [month('2026-05', [inc]), month('2026-07', [refundLine('r1', '2026-07-05', 500)])];
    expect(redateRefunds(months)).toBe(months);
  });

  it('a zero-amount linked refund is left alone', () => {
    const months = [month('2026-05', [purchase]), month('2026-07', [refundLine('r1', '2026-07-05', 0)])];
    expect(redateRefunds(months)).toBe(months);
  });

  it('refund and purchase in the same month: date and category become the purchase', () => {
    const r = refundLine('r1', '2026-05-20', 300000);
    const out = redateRefunds([month('2026-05', [purchase, r])]);
    expect(out[0]?.lines).toEqual([purchase, expect.objectContaining({ id: 'r1', date: '2026-05-10', categoryId: 'C', amount: 300000 })]);
  });

  it('a plan purchase is credited to its month; the series id is untouched', () => {
    const plan = line('p1', '2026-05-10', 1000000, 'spending', { seriesId: 's1', categoryId: 'C' });
    const out = run([refundLine('r1', '2026-07-05', 100000)], plan);
    expect(out[0]?.lines[0]).toBe(plan);
    expect(out[0]?.lines[1]).toMatchObject({ amount: 100000, date: '2026-05-10' });
  });

  it('untouched months keep identity; touched months sort by date with stable ties', () => {
    const a = line('a', '2026-05-30', 10, 'spending');
    const b = line('b', '2026-05-10', 10, 'spending');
    const c = line('c', '2026-05-10', 10, 'spending');
    const other = month('2026-04', [line('z', '2026-04-01', 1, 'spending')]);
    const out = redateRefunds([other, month('2026-05', [a, purchase, b, c]), month('2026-07', [refundLine('r1', '2026-07-05', 5)])]);
    expect(out[0]).toBe(other);
    expect(out[1]?.lines.map((l) => l.id)).toEqual(['p1', 'b', 'c', 'r1', 'a']);
  });

  it('no linked line returns the same array', () => {
    const months = [month('2026-05', [purchase, line('r', '2026-05-12', 5, 'refund')])];
    expect(redateRefunds(months)).toBe(months);
  });
});

describe('refund of a payment-plan day-one row (owner decision 2026-10-28)', () => {
  const planSeries = { id: 's1', role: 'debt_payment', confirmed: true, status: 'active', endDate: null } as unknown as V3Series;
  const dayOne = line('p1', '2026-05-10', 40000, 'spending', { seriesId: 's1', categoryId: 'C' });
  const plan = (refunds: V3Line[], series: V3Series[] = [planSeries]): readonly V3Month[] =>
    redateRefunds([month('2026-05', [dayOne]), month('2026-07', refunds)], series);

  it('the credit comes off the day-one row, not everyday spending', () => {
    const out = plan([refundLine('r1', '2026-07-05', 30000)]);
    expect(out[0]?.lines.map((l) => [l.id, l.role, l.amount])).toEqual([['p1', 'spending', 10000]]);
    expect(out[1]?.lines).toEqual([]);
  });

  it('a full refund removes the day-one row', () => {
    const out = plan([refundLine('r1', '2026-07-05', 40000)]);
    expect(out[0]?.lines).toEqual([]);
  });

  it('the part over the day-one amount counts as money in when it arrives (D-06)', () => {
    const out = plan([refundLine('r1', '2026-07-05', 55000)]);
    expect(out[0]?.lines).toEqual([]);
    expect(out[1]?.lines).toEqual([expect.objectContaining({ id: 'r1:surplus', role: 'other_in', amount: 15000 })]);
  });

  it('several refunds net the row in date order and the overflow is money in', () => {
    const out = plan([refundLine('r1', '2026-07-05', 30000), refundLine('r2', '2026-07-09', 30000)]);
    expect(out[0]?.lines).toEqual([]);
    expect(out[1]?.lines.map((l) => [l.id, l.amount])).toEqual([['r2:surplus', 20000]]);
  });

  it('a series that is not counting leaves the old everyday credit', () => {
    const out = plan([refundLine('r1', '2026-07-05', 30000)], [{ ...planSeries, confirmed: false } as V3Series]);
    expect(out[0]?.lines.map((l) => [l.id, l.role, l.amount])).toEqual([['p1', 'spending', 40000], ['r1', 'refund', 30000]]);
  });

  it('is idempotent', () => {
    const once = plan([refundLine('r1', '2026-07-05', 30000)]);
    expect(redateRefunds(once, [planSeries])).toBe(once);
  });

  it('withRedatedRefunds passes the inputs series through', () => {
    const inputs = { months: [month('2026-05', [dayOne]), month('2026-07', [refundLine('r1', '2026-07-05', 30000)])], series: [planSeries] } as unknown as V3Inputs;
    expect(withRedatedRefunds(inputs).months[0]?.lines[0]?.amount).toBe(10000);
  });
});

describe('withRedatedRefunds', () => {
  const base = { months: [month('2026-05', [purchase])] } as unknown as V3Inputs;
  it('returns the same inputs when nothing is linked', () => {
    expect(withRedatedRefunds(base)).toBe(base);
  });
  it('replaces months when a refund is linked', () => {
    const inputs = { ...base, months: [month('2026-05', [purchase]), month('2026-07', [refundLine('r1', '2026-07-05', 5)])] } as V3Inputs;
    const out = withRedatedRefunds(inputs);
    expect(out).not.toBe(inputs);
    expect(out.months[1]?.lines).toEqual([]);
  });
});
