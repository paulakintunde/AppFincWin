import { assignYears, looksLikeDate, numericOrder, parsePdfDate, parsePeriod, resolveNumeric } from '../dates';

const named = (y: number | null, m: number, d: number) => ({ kind: 'named', parts: { y, m, d } });

describe('parsePdfDate', () => {
  it.each([
    ['02 Mar', named(null, 3, 2)],
    ['2 March 2026', named(2026, 3, 2)],
    ['04 Feb 26', named(2026, 2, 4)],
    ['Mar 04', named(null, 3, 4)],
    ['Mar 4, 2026', named(2026, 3, 4)],
    ['04-Mar-2026', named(2026, 3, 4)],
    ['Sept 30', named(null, 9, 30)],
    ['  4  Mar.  ', named(null, 3, 4)],
    ['29 Feb', named(null, 2, 29)],
    ['2026-03-14', { kind: 'iso', parts: { y: 2026, m: 3, d: 14 } }],
    ['2026/3/4', { kind: 'iso', parts: { y: 2026, m: 3, d: 4 } }],
    ['14/03/2026', { kind: 'numeric', p1: 14, p2: 3, y: 2026 }],
    ['03/04', { kind: 'numeric', p1: 3, p2: 4, y: null }],
    ['14.03.2026', { kind: 'numeric', p1: 14, p2: 3, y: 2026 }],
    ['14-03-26', { kind: 'numeric', p1: 14, p2: 3, y: 2026 }],
  ])('reads %s', (text, expected) => {
    expect(parsePdfDate(text)).toEqual(expected);
  });

  it.each([
    '31 Feb 2026',
    '32 Mar',
    '13/13/2026',
    'ACME GROCERS',
    '1,245.60',
    '',
    '29 Feb 2025',
    '2026-13-01',
    '2026-02-30',
    '4 Foo 2026',
    'Foo 4',
    '12.50',
    '3.05',
    '0099-01-01',
    '1/1/1800',
    '31/31/2026',
  ])('rejects %s', (text) => {
    expect(parsePdfDate(text)).toBeNull();
    expect(looksLikeDate(text)).toBe(false);
  });

  it('looksLikeDate is true for real dates', () => {
    expect(looksLikeDate('02 Mar')).toBe(true);
  });
});

describe('numericOrder / resolveNumeric', () => {
  it('detects the order from the samples', () => {
    expect(numericOrder([{ p1: 14, p2: 3 }])).toBe('DMY');
    expect(numericOrder([{ p1: 3, p2: 14 }])).toBe('MDY');
    expect(numericOrder([{ p1: 14, p2: 3 }, { p1: 3, p2: 14 }])).toBe('invalid');
    expect(numericOrder([{ p1: 3, p2: 4 }])).toBe('ambiguous');
    expect(numericOrder([])).toBe('ambiguous');
  });

  it('resolves under an order and rejects impossible days', () => {
    expect(resolveNumeric({ p1: 3, p2: 4, y: 2026 }, 'DMY')).toEqual({ y: 2026, m: 4, d: 3 });
    expect(resolveNumeric({ p1: 3, p2: 4, y: null }, 'MDY')).toEqual({ y: null, m: 3, d: 4 });
    expect(resolveNumeric({ p1: 31, p2: 2, y: 2026 }, 'DMY')).toBeNull();
    expect(resolveNumeric({ p1: 2, p2: 31, y: 2026 }, 'DMY')).toBeNull();
  });
});

describe('parsePeriod', () => {
  it('reads written periods', () => {
    expect(parsePeriod('Statement period 1 March 2026 to 31 March 2026', true)).toEqual({ start: '2026-03-01', end: '2026-03-31' });
    expect(parsePeriod('05 Feb 2026 - 04 Mar 2026', true)).toEqual({ start: '2026-02-05', end: '2026-03-04' });
    expect(parsePeriod('Period 01 Jan 2026 until 31 Jan 2026 Page 1', true)).toEqual({ start: '2026-01-01', end: '2026-01-31' });
    expect(parsePeriod('1 Feb 2026 – 28 Feb 2026', true)).toEqual({ start: '2026-02-01', end: '2026-02-28' });
  });

  it('reads numeric periods and settles day order', () => {
    expect(parsePeriod('15/12/2025 - 14/01/2026', false)).toEqual({ start: '2025-12-15', end: '2026-01-14' });
    expect(parsePeriod('03/04/2026 to 30/04/2026', false)).toEqual({ start: '2026-04-03', end: '2026-04-30' });
    expect(parsePeriod('01/02/2026 to 28/02/2026', false)).toEqual({ start: '2026-02-01', end: '2026-02-28' });
    expect(parsePeriod('01/02/2026 to 03/02/2026', true)).toEqual({ start: '2026-02-01', end: '2026-02-03' });
    expect(parsePeriod('01/02/2026 to 03/02/2026', false)).toEqual({ start: '2026-01-02', end: '2026-03-02' });
    expect(parsePeriod('01/02/2026 to 3 Feb 2026', false)).toEqual({ start: '2026-01-02', end: '2026-02-03' });
  });

  it('returns null when there is no usable period', () => {
    expect(parsePeriod('Opening balance 5,000.00', true)).toBeNull();
    expect(parsePeriod('31 Mar 2026 to 01 Mar 2026', true)).toBeNull();
    expect(parsePeriod('14/03/2026 to 03/14/2026', true)).toBeNull();
    expect(parsePeriod('1 Mar to 31 Mar', true)).toBeNull();
    expect(parsePeriod('Mar 2026 to Apr 2026', true)).toBeNull();
    expect(parsePeriod('31/02/2026 to 31/03/2026', true)).toBeNull();
    expect(parsePeriod('31/03/2026 to 31/02/2026', true)).toBeNull();
    expect(parsePeriod('', true)).toBeNull();
  });
});

describe('assignYears with a period', () => {
  const period = { start: '2025-12-15', end: '2026-01-14' };
  const opts = { today: '2026-09-26', firstRowYear: null };
  const rows = [
    { y: null, m: 12, d: 16 },
    { y: null, m: 12, d: 31 },
    { y: null, m: 1, d: 2 },
    { y: null, m: 1, d: 13 },
  ];

  it('takes the year by position across December to January', () => {
    const out = assignYears(rows, period, opts);
    expect(out.dates).toEqual(['2025-12-16', '2025-12-31', '2026-01-02', '2026-01-13']);
    expect(out.outOfPeriod).toEqual([false, false, false, false]);
    expect(out.question).toBeNull();
  });

  it('gives the same year per row for newest-first statements', () => {
    const out = assignYears([...rows].reverse(), period, opts);
    expect(out.dates).toEqual(['2026-01-13', '2026-01-02', '2025-12-31', '2025-12-16']);
  });

  it('flags a row outside the period beyond seven days', () => {
    const mar = { start: '2026-03-01', end: '2026-03-31' };
    const out = assignYears(
      [
        { y: null, m: 4, d: 15 },
        { y: null, m: 4, d: 3 },
        { y: 2026, m: 3, d: 10 },
        { y: 2024, m: 3, d: 10 },
        null,
      ],
      mar,
      opts
    );
    expect(out.outOfPeriod).toEqual([true, false, false, true, false]);
    expect(out.dates).toEqual(['2026-04-15', '2026-04-03', '2026-03-10', '2024-03-10', null]);
  });

  it('gives a null date for a day that exists in neither year', () => {
    const out = assignYears([{ y: null, m: 2, d: 29 }], { start: '2025-02-01', end: '2025-03-01' }, opts);
    expect(out.dates).toEqual([null]);
    expect(out.outOfPeriod).toEqual([true]);
  });

  it('uses the other year when 29 Feb exists only there', () => {
    const out = assignYears([{ y: null, m: 2, d: 29 }], { start: '2027-12-01', end: '2028-03-01' }, opts);
    expect(out.dates).toEqual(['2028-02-29']);
  });

  it('falls back to a valid year outside the window', () => {
    const out = assignYears([{ y: null, m: 2, d: 29 }], { start: '2027-12-01', end: '2028-01-05' }, opts);
    expect(out.dates).toEqual(['2028-02-29']);
    expect(out.outOfPeriod).toEqual([true]);
  });

  it('treats a half-known period as no period', () => {
    const out = assignYears([{ y: 2026, m: 3, d: 1 }], { start: '2026-03-01', end: null }, opts);
    expect(out.dates).toEqual(['2026-03-01']);
  });
});

describe('assignYears without a period', () => {
  const noPeriod = { start: null, end: null };
  const opts = { today: '2026-09-26', firstRowYear: null };

  it('wraps backwards from a row that carries a year', () => {
    const out = assignYears(
      [
        { y: null, m: 12, d: 5 },
        { y: null, m: 12, d: 20 },
        null,
        { y: null, m: 12, d: 28 },
        { y: 2026, m: 1, d: 3 },
      ],
      noPeriod,
      opts
    );
    expect(out.dates).toEqual(['2025-12-05', '2025-12-20', null, '2025-12-28', '2026-01-03']);
    expect(out.question).toBeNull();
    expect(out.outOfPeriod).toEqual([false, false, false, false, false]);
  });

  it('wraps backwards newest-first', () => {
    const out = assignYears(
      [
        { y: null, m: 1, d: 5 },
        { y: 2025, m: 12, d: 30 },
      ],
      noPeriod,
      opts
    );
    expect(out.dates).toEqual(['2026-01-05', '2025-12-30']);
  });

  it('walks forward from an explicit year, resetting on later explicit years', () => {
    const out = assignYears(
      [
        { y: 2025, m: 11, d: 30 },
        null,
        { y: null, m: 12, d: 15 },
        { y: null, m: 1, d: 2 },
        { y: 2027, m: 2, d: 2 },
        { y: null, m: 2, d: 5 },
      ],
      noPeriod,
      opts
    );
    expect(out.dates).toEqual(['2025-11-30', null, '2025-12-15', '2026-01-02', '2027-02-02', '2027-02-05']);
  });

  it('walks forward newest-first (month rises by six or more)', () => {
    const out = assignYears(
      [
        { y: 2026, m: 1, d: 3 },
        { y: null, m: 12, d: 28 },
      ],
      noPeriod,
      opts
    );
    expect(out.dates).toEqual(['2026-01-03', '2025-12-28']);
  });

  it('asks which year when there is no evidence', () => {
    const out = assignYears([null, { y: null, m: 12, d: 30 }, { y: null, m: 1, d: 2 }], noPeriod, opts);
    expect(out.question).toEqual([2025, 2026]);
    expect(out.dates).toEqual([null, '2026-12-30', '2027-01-02']);
  });

  it('uses the answered year without asking', () => {
    const out = assignYears([{ y: null, m: 12, d: 30 }, { y: null, m: 1, d: 2 }], noPeriod, { today: '2026-09-26', firstRowYear: 2025 });
    expect(out.question).toBeNull();
    expect(out.dates).toEqual(['2025-12-30', '2026-01-02']);
  });

  it('nulls a day the walked year cannot hold', () => {
    const out = assignYears([{ y: null, m: 2, d: 29 }], noPeriod, { today: '2026-09-26', firstRowYear: 2026 });
    expect(out.dates).toEqual([null]);
    expect(out.outOfPeriod).toEqual([true]);
  });

  it('handles no rows and all-null rows', () => {
    expect(assignYears([], noPeriod, opts)).toEqual({ dates: [], outOfPeriod: [], question: null });
    expect(assignYears([null, null], noPeriod, opts)).toEqual({ dates: [null, null], outOfPeriod: [false, false], question: null });
  });
});
