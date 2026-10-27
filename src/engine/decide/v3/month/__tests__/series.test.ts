import { minorUnits as mu } from '../../../../money/types';
import type { LineRole, V3Line, V3Month, V3Series } from '../../types';
import {
  classifyLine,
  effectiveEnd,
  isCounting,
  liveSeriesOf,
  paymentsPerYear,
  seriesDrift,
  seriesIndex,
  seriesOccurrences,
} from '../series';

function ser(over: Partial<V3Series> & { id: string }): V3Series {
  return {
    role: 'bill',
    cadence: { unit: 'month', every: 1 },
    anchorDate: '2026-01-05',
    endDate: null,
    amount: mu(180000),
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
    date: '2026-03-05',
    amount: mu(180000),
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

const cls = (l: V3Line, s: V3Series[]) => classifyLine(l, seriesIndex(s));

describe('classifyLine', () => {
  it('I34 unconfirmed never counts', () => {
    const s = ser({ id: 'a', confirmed: false });
    expect(cls(line({ id: 'l', seriesId: 'a' }), [s])).toBe('everyday');
    const p = ser({ id: 'p', role: 'pay', confirmed: false });
    expect(cls(line({ id: 'l', role: 'income', seriesId: 'p' }), [p])).toBe('other_income_unconfirmed');
    expect(cls(line({ id: 'l', role: 'income' }), [])).toBe('other_income_unconfirmed');
  });

  it('confirmed pay and other income are recurring income; a bill-role series is not', () => {
    const p = ser({ id: 'p', role: 'pay' });
    const o = ser({ id: 'o', role: 'other_income' });
    const b = ser({ id: 'b', role: 'bill' });
    expect(cls(line({ id: 'l', role: 'income', seriesId: 'p' }), [p])).toBe('recurring_income');
    expect(cls(line({ id: 'l', role: 'income', seriesId: 'o' }), [o])).toBe('recurring_income');
    expect(cls(line({ id: 'l', role: 'income', seriesId: 'b' }), [b])).toBe('other_income_unconfirmed');
  });

  it('D-25 never regular becomes everyday on every past date', () => {
    const s = ser({ id: 'a', status: 'dismissed' });
    expect(cls(line({ id: 'l', seriesId: 'a', date: '2025-01-05' }), [s])).toBe('everyday');
    expect(cls(line({ id: 'l', seriesId: 'a', date: '2026-03-05' }), [s])).toBe('everyday');
  });

  it('D-21 ended keeps the past and drops after endDate', () => {
    const s = ser({ id: 'a', status: 'ended', endDate: '2026-03-05' });
    expect(cls(line({ id: 'l', seriesId: 'a', date: '2026-03-05' }), [s])).toBe('recurring_bill');
    expect(cls(line({ id: 'l', seriesId: 'a', date: '2026-04-05' }), [s])).toBe('everyday');
  });

  it('D-22 stand-in envelope moves are saving', () => {
    expect(cls(line({ id: 'l', role: 'envelope_deposit' }), [])).toBe('saving');
    expect(cls(line({ id: 'l', role: 'envelope_withdrawal' }), [])).toBe('saving_withdrawal');
  });

  it('fixed mappings', () => {
    const map: [LineRole, string][] = [
      ['own_transfer', 'ignored'],
      ['emergency_move', 'ignored'],
      ['refund', 'refund'],
      ['other_in', 'other_in'],
      ['other_out', 'other_out'],
      ['debt_payment', 'debt_payment'],
    ];
    for (const [role, want] of map) expect(cls(line({ id: 'l', role }), [])).toBe(want);
  });

  it('saved_invested follows the series role', () => {
    const inv = ser({ id: 'i', role: 'investing' });
    const sav = ser({ id: 's', role: 'saving' });
    expect(cls(line({ id: 'l', role: 'saved_invested', seriesId: 'i' }), [inv])).toBe('investing');
    expect(cls(line({ id: 'l', role: 'saved_invested', seriesId: 's' }), [sav])).toBe('saving');
    expect(cls(line({ id: 'l', role: 'saved_invested' }), [])).toBe('saving');
  });

  it('spending in debt, saving and investing series keeps its class; pay series spending is everyday', () => {
    const roles = [
      ['debt_payment', 'debt_payment'],
      ['saving', 'saving'],
      ['investing', 'investing'],
      ['pay', 'everyday'],
    ] as const;
    for (const [role, want] of roles) {
      const s = ser({ id: 'x', role });
      expect(cls(line({ id: 'l', seriesId: 'x' }), [s])).toBe(want);
    }
    expect(cls(line({ id: 'l', seriesId: 'missing' }), [])).toBe('everyday');
  });
});

describe('isCounting and liveSeriesOf', () => {
  it('counts only confirmed, not dismissed, not past end', () => {
    expect(isCounting(ser({ id: 'a' }), '2026-01-01')).toBe(true);
    expect(isCounting(ser({ id: 'a', confirmed: false }), '2026-01-01')).toBe(false);
    expect(isCounting(ser({ id: 'a', status: 'dismissed' }), '2026-01-01')).toBe(false);
    expect(isCounting(ser({ id: 'a', status: 'ended', endDate: '2026-02-01' }), '2026-02-02')).toBe(false);
  });
  it('liveSeriesOf filters by role and asOf', () => {
    const a = ser({ id: 'a', role: 'pay' });
    const b = ser({ id: 'b', role: 'pay', status: 'ended', endDate: '2026-01-01' });
    const c = ser({ id: 'c', role: 'bill' });
    expect(liveSeriesOf([a, b, c], '2026-02-01', 'pay').map((s) => s.id)).toEqual(['a']);
  });
});

describe('seriesOccurrences', () => {
  it('D-02 a yearly bill occurs once in its month and not in the month before', () => {
    const s = ser({ id: 'y', cadence: { unit: 'month', every: 12 }, anchorDate: '2025-11-20' });
    expect(seriesOccurrences(s, '2026-11-01', '2026-12-01')).toEqual(['2026-11-20']);
    expect(seriesOccurrences(s, '2026-10-01', '2026-11-01')).toEqual([]);
  });
  it('D-19 every 4 weeks gives 13 in 364 days', () => {
    const s = ser({ id: 'w', cadence: { unit: 'week', every: 4 }, anchorDate: '2026-01-02' });
    expect(seriesOccurrences(s, '2026-01-02', '2027-01-01')).toHaveLength(13);
  });
  it('C2 a pay group of two monthly series is 24 a year', () => {
    const a = ser({ id: 'a', role: 'pay', payGroup: 'g', anchorDate: '2026-01-01' });
    const b = ser({ id: 'b', role: 'pay', payGroup: 'g', anchorDate: '2026-01-15' });
    const total = [a, b].reduce((n, s) => n + seriesOccurrences(s, '2026-01-01', '2027-01-01').length, 0);
    expect(total).toBe(24);
    const ppy = paymentsPerYear(a.cadence);
    expect((ppy.num / ppy.den) * 2).toBe(24);
  });
  it('none when unconfirmed or dismissed; capped at endDate', () => {
    expect(seriesOccurrences(ser({ id: 'a', confirmed: false }), '2026-01-01', '2027-01-01')).toEqual([]);
    expect(seriesOccurrences(ser({ id: 'a', status: 'dismissed' }), '2026-01-01', '2027-01-01')).toEqual([]);
    const ended = ser({ id: 'a', status: 'ended', endDate: '2026-03-05' });
    expect(seriesOccurrences(ended, '2026-01-01', '2027-01-01')).toEqual(['2026-01-05', '2026-02-05', '2026-03-05']);
  });
  it('paymentsPerYear for weeks', () => {
    expect(paymentsPerYear({ unit: 'week', every: 2 })).toEqual({ num: 52, den: 2 });
  });
});

describe('seriesDrift', () => {
  const rent = ser({ id: 'rent', amount: mu(180000) });
  const month = (m: string, lines: V3Line[]): V3Month => ({ month: m, full: true, mark: null, lines });
  const paid = (id: string, date: string, amount: number, extra: Partial<V3Line> = {}) =>
    line({ id, date, amount: mu(amount), seriesId: 'rent', ...extra });

  it('UP 4.2 drift: last two payments both above 5%', () => {
    const months = [
      month('2026-02', [paid('1', '2026-02-05', 180000)]),
      month('2026-03', [paid('2', '2026-03-05', 200000)]),
      month('2026-04', [paid('3', '2026-04-05', 200000)]),
    ];
    expect(seriesDrift([rent], months)).toEqual([
      { seriesId: 'rent', current: 180000, suggested: 200000, fromMonth: '2026-05' },
    ]);
  });
  it('a series with no lines has no drift', () => {
    expect(seriesDrift([rent], [])).toEqual([]);
  });
  it('year rollover for fromMonth', () => {
    const months = [month('2026-12', [paid('1', '2026-12-05', 190000), paid('2', '2026-11-05', 190000)])];
    expect(seriesDrift([rent], months)[0]?.fromMonth).toBe('2027-01');
  });
  it('one drifted line, or exactly 5%, is no drift', () => {
    expect(seriesDrift([rent], [month('2026-03', [paid('1', '2026-03-05', 190000)])])).toEqual([]);
    const exact = [month('2026-03', [paid('1', '2026-03-05', 189000), paid('2', '2026-04-05', 189000)])];
    expect(seriesDrift([rent], exact)).toEqual([]);
    const just = [month('2026-03', [paid('1', '2026-03-05', 189001), paid('2', '2026-04-05', 189001)])];
    expect(seriesDrift([rent], just)).toHaveLength(1);
  });
  it('a drop of more than 5% also drifts; mixed directions and a normal latest line do not', () => {
    const down = [month('2026-03', [paid('1', '2026-03-05', 150000), paid('2', '2026-04-05', 150000)])];
    expect(seriesDrift([rent], down)[0]?.suggested).toBe(150000);
    const opposite = [month('2026-03', [paid('1', '2026-03-05', -185000), paid('2', '2026-04-05', 185000)])];
    expect(seriesDrift([rent], opposite)).toEqual([]);
    const back = [month('2026-03', [paid('1', '2026-03-05', 190000), paid('2', '2026-04-05', 180000)])];
    expect(seriesDrift([rent], back)).toEqual([]);
  });
  it('ignores unconfirmed, dismissed, pending and unlinked lines; sorts by series id', () => {
    const lines = [paid('1', '2026-03-05', 190000), paid('2', '2026-04-05', 190000)];
    expect(seriesDrift([ser({ id: 'rent', confirmed: false })], [month('2026-03', lines)])).toEqual([]);
    expect(seriesDrift([ser({ id: 'rent', status: 'dismissed' })], [month('2026-03', lines)])).toEqual([]);
    const pending = [paid('1', '2026-03-05', 190000), paid('2', '2026-04-05', 190000, { status: 'pending' })];
    expect(seriesDrift([rent], [month('2026-03', pending)])).toEqual([]);
    const unlinked = [line({ id: 'u', amount: mu(190000) }), line({ id: 'v', amount: mu(190000) })];
    expect(seriesDrift([rent], [month('2026-03', unlinked)])).toEqual([]);
    const other = ser({ id: 'a-gym', amount: mu(1000) });
    const both = [
      month('2026-03', [
        ...lines,
        line({ id: 'g1', seriesId: 'a-gym', date: '2026-03-06', amount: mu(2000) }),
        line({ id: 'g2', seriesId: 'a-gym', date: '2026-04-06', amount: mu(2000) }),
      ]),
    ];
    expect(seriesDrift([rent, other], both).map((d) => d.seriesId)).toEqual(['a-gym', 'rent']);
    expect(seriesDrift([other, rent], both).map((d) => d.seriesId)).toEqual(['a-gym', 'rent']);
  });
});

describe('D-41 ended with no end date', () => {
  const endedNull = ser({ id: 'e', role: 'pay', status: 'ended', endDate: null });
  it('effectiveEnd: the day before today, an explicit end wins, live is open', () => {
    expect(effectiveEnd(endedNull, '2026-10-03')).toBe('2026-10-02');
    expect(effectiveEnd(ser({ id: 'x', status: 'ended', endDate: '2026-12-31' }), '2026-10-03')).toBe('2026-12-31');
    expect(effectiveEnd(ser({ id: 'x' }), '2026-10-03')).toBeNull();
  });
  it('D-41 liveSeriesOf drops it on asOf and keeps it for an earlier date', () => {
    expect(liveSeriesOf([endedNull], '2026-10-03', 'pay')).toEqual([]);
    expect(liveSeriesOf([endedNull], '2026-10-02', 'pay', '2026-10-03')).toEqual([endedNull]);
  });
  it('D-41 seriesOccurrences stops the day before today; without today it is unchanged', () => {
    const s = ser({ id: 'e', status: 'ended', endDate: null });
    expect(seriesOccurrences(s, '2026-09-01', '2026-12-01', '2026-10-06')).toEqual(['2026-09-05', '2026-10-05']);
    expect(seriesOccurrences(s, '2026-09-01', '2026-12-01', '2026-10-05')).toEqual(['2026-09-05']);
    expect(seriesOccurrences(s, '2026-09-01', '2026-12-01')).toEqual(['2026-09-05', '2026-10-05', '2026-11-05']);
  });
  it('D-41 a paid line before the end still classifies by the series role', () => {
    const s = ser({ id: 'e', status: 'ended', endDate: null });
    expect(cls(line({ id: 'l', seriesId: 'e', date: '2026-10-02' }), [s])).toBe('recurring_bill');
  });
});

describe('L-06 seriesDrift ties', () => {
  it('L-06 picks the same latest amount whatever the input order', () => {
    const rent = ser({ id: 'rent', amount: mu(180000) });
    const a = line({ id: 'a', seriesId: 'rent', date: '2026-04-05', amount: mu(200000) });
    const b = line({ id: 'b', seriesId: 'rent', date: '2026-04-05', amount: mu(210000) });
    const m = (lines: V3Line[]): V3Month => ({ month: '2026-04', full: true, mark: null, lines });
    expect(seriesDrift([rent], [m([a, b])])[0]?.suggested).toBe(210000);
    expect(seriesDrift([rent], [m([b, a])])[0]?.suggested).toBe(210000);
  });
});
