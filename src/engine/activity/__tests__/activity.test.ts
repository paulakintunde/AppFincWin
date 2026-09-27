import { directionOf, isOverdue, markPaidDate, defaultStatusFor, monthsForSwitcher, nextMonth } from '../status';

describe('directionOf', () => {
  it('reads a negative amount as money out', () => {
    expect(directionOf(-1)).toBe('out');
  });

  it('reads a positive amount as money in', () => {
    expect(directionOf(1)).toBe('in');
  });
});

describe('isOverdue', () => {
  it('flags a pending row dated before today as overdue', () => {
    expect(isOverdue({ status: 'pending', local_date: '2026-09-01' }, '2026-09-25')).toBe(true);
  });

  it('never flags a paid row, whatever its date', () => {
    expect(isOverdue({ status: 'paid', local_date: '2026-09-01' }, '2026-09-25')).toBe(false);
  });

  it('does not flag a pending row dated today', () => {
    expect(isOverdue({ status: 'pending', local_date: '2026-09-25' }, '2026-09-25')).toBe(false);
  });

  it('does not flag a pending row dated in the future', () => {
    expect(isOverdue({ status: 'pending', local_date: '2026-09-26' }, '2026-09-25')).toBe(false);
  });

  it('throws RangeError on an invalid local_date', () => {
    expect(() => isOverdue({ status: 'pending', local_date: '2026-13-01' }, '2026-09-25')).toThrow(RangeError);
  });

  it('throws RangeError on an invalid today', () => {
    expect(() => isOverdue({ status: 'pending', local_date: '2026-09-01' }, 'not-a-date')).toThrow(RangeError);
  });
});

describe('markPaidDate', () => {
  it('uses the due date when it is earlier than today', () => {
    expect(markPaidDate('2026-09-25', '2026-09-01')).toBe('2026-09-01');
  });

  it('uses today when the due date is later than today', () => {
    expect(markPaidDate('2026-09-25', '2026-10-01')).toBe('2026-09-25');
  });

  it('uses today when the due date equals today', () => {
    expect(markPaidDate('2026-09-25', '2026-09-25')).toBe('2026-09-25');
  });
});

describe('defaultStatusFor', () => {
  it('defaults to pending for a future local date', () => {
    expect(defaultStatusFor('2026-09-26', '2026-09-25')).toBe('pending');
  });

  it('defaults to paid for the same day', () => {
    expect(defaultStatusFor('2026-09-25', '2026-09-25')).toBe('paid');
  });

  it('defaults to paid for a past local date', () => {
    expect(defaultStatusFor('2026-09-01', '2026-09-25')).toBe('paid');
  });
});

describe('nextMonth', () => {
  it('rolls over into the next year at December', () => {
    expect(nextMonth('2026-12')).toBe('2027-01');
  });

  it('advances within the same year otherwise', () => {
    expect(nextMonth('2026-09')).toBe('2026-10');
  });

  it('throws RangeError on an invalid month string', () => {
    expect(() => nextMonth('2026-13')).toThrow(RangeError);
  });
});

describe('monthsForSwitcher', () => {
  it('lists every data month plus the current and next month, newest first, deduplicated', () => {
    expect(monthsForSwitcher(['2026-07', '2026-09', '2026-07'], '2026-09-25')).toEqual([
      '2026-10',
      '2026-09',
      '2026-07',
    ]);
  });

  it('still includes the current and next month when there is no data at all', () => {
    expect(monthsForSwitcher([], '2026-09-25')).toEqual(['2026-10', '2026-09']);
  });
});
