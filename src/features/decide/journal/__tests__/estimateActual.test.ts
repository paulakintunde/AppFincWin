import { compareEstimate, scheduleMatch, type LinkedLine } from '../estimateActual';

const line = (p: Partial<LinkedLine> & { id: string }): LinkedLine => ({
  date: '2026-01-10',
  amount: 100,
  status: 'paid',
  seriesId: null,
  ...p,
});

describe('compareEstimate', () => {
  it('is not reached before day 30', () => {
    const r = compareEstimate(
      { decidedDate: '2026-01-10', estimateDayOne: 500, estimateMonthly: 100, lines: [line({ id: 'a' })] },
      '2026-02-08'
    );
    expect(r.checkpoints[0]).toMatchObject({ days: 30, date: '2026-02-09', reached: false, dayOneActual: 0 });
    expect(r.checkpoints[1]).toMatchObject({ days: 90, date: '2026-04-10', reached: false });
  });

  it('computes actuals and tones at both checkpoints', () => {
    const lines: LinkedLine[] = [
      line({ id: 'a', amount: -600, date: '2026-01-10' }),
      line({ id: 'b', amount: 100, date: '2026-02-09' }),
      line({ id: 'c', amount: 50, date: '2026-02-10' }),
      line({ id: 'd', amount: 100, date: '2026-01-10', seriesId: 's' }),
      line({ id: 'e', amount: 100, date: '2026-01-20', seriesId: 's' }),
      line({ id: 'f', amount: 101, date: '2026-03-20', seriesId: 's' }),
      line({ id: 'g', amount: 999, date: '2026-01-20', status: 'pending' }),
      line({ id: 'h', amount: 999, date: '2026-01-05' }),
      line({ id: 'i', amount: 999, date: '2026-06-01', seriesId: 's' }),
      line({ id: 'j', amount: null, date: '2026-01-21', seriesId: 's' }),
    ];
    const r = compareEstimate(
      { decidedDate: '2026-01-10', estimateDayOne: 700, estimateMonthly: 100, lines },
      '2026-05-01'
    );
    const [c30, c90] = r.checkpoints;
    expect(c30).toMatchObject({
      reached: true,
      dayOneActual: 700,
      monthlyActual: 100,
      diffDayOne: 0,
      diffMonthly: 0,
      toneDayOne: 'at',
      toneMonthly: 'at',
    });
    expect(c90).toMatchObject({
      dayOneActual: 750,
      monthlyActual: 67,
      diffDayOne: 50,
      diffMonthly: -33,
      toneDayOne: 'over',
      toneMonthly: 'under',
    });
    expect(r.skipped).toBe(1);
  });

  it('rolls dates over month and year ends', () => {
    const r = compareEstimate(
      { decidedDate: '2026-12-20', estimateDayOne: 0, estimateMonthly: 0, lines: [] },
      '2026-12-20'
    );
    expect(r.checkpoints[0].date).toBe('2027-01-19');
    expect(r.checkpoints[1].date).toBe('2027-03-20');
  });
});

describe('scheduleMatch', () => {
  it('counts due and paid rows', () => {
    const lines = [
      line({ id: 'a', date: '2026-01-01' }),
      line({ id: 'b', date: '2026-02-01', status: 'skipped' }),
      line({ id: 'c', date: '2026-03-01', status: 'pending' }),
    ];
    expect(scheduleMatch(lines, '2026-02-15')).toEqual({ paid: 1, due: 2 });
  });
});
