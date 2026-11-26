// 10.1-15 (SCN-02): a receipt date, flagged when day and month could swap.
import { findDate } from '../dates';

describe('10.1-15 findDate', () => {
  it('flags a date that reads both ways', () => {
    expect(findDate(['03/04/26'], 'MDY')).toEqual({ value: '2026-03-04', unsure: true });
    expect(findDate(['03/04/26'], 'DMY')).toEqual({ value: '2026-04-03', unsure: true });
    expect(findDate(['02.09.2026'], 'DMY')).toEqual({ value: '2026-09-02', unsure: true });
  });
  it('is sure when only one order is a real date, or both orders agree', () => {
    expect(findDate(['13/04/26'], 'DMY')).toEqual({ value: '2026-04-13', unsure: false });
    expect(findDate(['13/04/26'], 'MDY')).toEqual({ value: '2026-04-13', unsure: false });
    expect(findDate(['17.07.2026'], 'DMY')).toEqual({ value: '2026-07-17', unsure: false });
    expect(findDate(['11/20/2026 08:15'], 'DMY')).toEqual({ value: '2026-11-20', unsure: false });
    expect(findDate(['05/05/2026'], 'MDY')).toEqual({ value: '2026-05-05', unsure: false });
  });
  it('reads ISO and month-name dates as sure', () => {
    expect(findDate(['2026-11-24'], 'MDY')).toEqual({ value: '2026-11-24', unsure: false });
    expect(findDate(['2026/1/5 10:00'], 'DMY')).toEqual({ value: '2026-01-05', unsure: false });
    expect(findDate(['Nov 14, 2026'], 'DMY')).toEqual({ value: '2026-11-14', unsure: false });
    expect(findDate(['22 Aug 2026 13:05'], 'MDY')).toEqual({ value: '2026-08-22', unsure: false });
    expect(findDate(['14 September 2026'], 'MDY')).toEqual({ value: '2026-09-14', unsure: false });
  });
  it('YMD order reads a short leading year', () => {
    expect(findDate(['26/11/24'], 'YMD')).toEqual({ value: '2026-11-24', unsure: true });
    expect(findDate(['40/11/13'], 'YMD')).toEqual({ value: '2040-11-13', unsure: false });
  });
  it('skips impossible dates and non-dates', () => {
    expect(findDate(['WOOD SCREWS 1-1/4IN', '31/02/2026', '2026-13-01', 'Foo 40, 2026', 'Nov 31, 2026', '1-1/4/26', '2026/11/2026', '123/11/26', '11/12/5', '11/12/202'], 'MDY')).toEqual({ value: null, unsure: true });
    expect(findDate([], 'MDY')).toEqual({ value: null, unsure: true });
    expect(findDate(['TEL 555', '01/02/1890', 'x 02/29/2028'], 'MDY')).toEqual({ value: '2028-02-29', unsure: false });
  });
});
