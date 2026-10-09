import fc from 'fast-check';
import { directionOf, isOverdue, markPaidDate, defaultStatusFor, monthsForSwitcher, nextMonth, addableMonth, monthsAhead, ADD_MONTH_LIMIT } from '../status';
import { monthTotals, type TotalsInput } from '../totals';
import { flowOf, filterRows, matchesSearch, normaliseForSearch, isFilterActive, EMPTY_FILTER, type ActivityFilter, type FilterRow } from '../filters';
import { accountBalance } from '../balance';

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

  it('sorts correctly even when the data months arrive already newest-first', () => {
    expect(monthsForSwitcher(['2026-09', '2026-07'], '2026-09-25')).toEqual(['2026-10', '2026-09', '2026-07']);
  });
});

describe('monthTotals', () => {
  it('splits paid rows into in/out, gives a signed still-to-come, and excludes transfers and skipped rows (D-10, D-50)', () => {
    const rows: TotalsInput[] = [
      { amountHome: 5000, status: 'paid', isTransfer: false },
      { amountHome: -1200, status: 'paid', isTransfer: false },
      { amountHome: -800, status: 'pending', isTransfer: false },
      { amountHome: -300, status: 'skipped', isTransfer: false },
      { amountHome: null, status: 'paid', isTransfer: false },
      { amountHome: -50000, status: 'paid', isTransfer: true },
      { amountHome: 50000, status: 'paid', isTransfer: true },
    ];
    expect(monthTotals(rows, [{ amountHome: -999 }])).toEqual({
      paidIn: 5000,
      paidOut: -1200,
      net: 3800,
      stillToCome: -1799,
      pendingCount: 1,
      projectedCount: 1,
      unconvertedCount: 1,
      transferCount: 2,
      count: 4,
    });
  });

  it('counts a projection with no home-currency amount as unconverted, not still-to-come', () => {
    expect(monthTotals([], [{ amountHome: null }])).toEqual({
      paidIn: 0,
      paidOut: 0,
      net: 0,
      stillToCome: 0,
      pendingCount: 0,
      projectedCount: 0,
      unconvertedCount: 1,
      transferCount: 0,
      count: 0,
    });
  });

  it('ignores a skipped row entirely, even with no home-currency amount', () => {
    expect(monthTotals([{ amountHome: null, status: 'skipped', isTransfer: false }], [])).toEqual({
      paidIn: 0,
      paidOut: 0,
      net: 0,
      stillToCome: 0,
      pendingCount: 0,
      projectedCount: 0,
      unconvertedCount: 0,
      transferCount: 0,
      count: 0,
    });
  });

  const totalsInputArb = fc.record({
    amountHome: fc.option(fc.integer({ min: -1_000_000, max: 1_000_000 }), { nil: null }),
    status: fc.constantFrom<TotalsInput['status']>('paid', 'pending', 'skipped'),
    isTransfer: fc.boolean(),
  });
  const projectionArb = fc.record({ amountHome: fc.option(fc.integer({ min: -1_000_000, max: 1_000_000 }), { nil: null }) });

  it('property: net always equals paidIn + paidOut', () => {
    fc.assert(
      fc.property(fc.array(totalsInputArb, { maxLength: 12 }), fc.array(projectionArb, { maxLength: 5 }), (rows, projections) => {
        const totals = monthTotals(rows, projections);
        expect(totals.net).toBe(totals.paidIn + totals.paidOut);
      })
    );
  });

  it('property: adding a transfer pair leaves paidIn, paidOut, net and stillToCome unchanged (D-50)', () => {
    fc.assert(
      fc.property(
        fc.array(totalsInputArb, { maxLength: 12 }),
        fc.array(projectionArb, { maxLength: 5 }),
        fc.integer({ min: -1_000_000, max: 1_000_000 }),
        fc.integer({ min: -1_000_000, max: 1_000_000 }),
        fc.constantFrom<TotalsInput['status']>('paid', 'pending', 'skipped'),
        fc.constantFrom<TotalsInput['status']>('paid', 'pending', 'skipped'),
        (rows, projections, legA, legB, statusA, statusB) => {
          const before = monthTotals(rows, projections);
          const after = monthTotals(
            [...rows, { amountHome: legA, status: statusA, isTransfer: true }, { amountHome: legB, status: statusB, isTransfer: true }],
            projections
          );
          expect(after.paidIn).toBe(before.paidIn);
          expect(after.paidOut).toBe(before.paidOut);
          expect(after.net).toBe(before.net);
          expect(after.stillToCome).toBe(before.stillToCome);
          expect(after.transferCount).toBe(before.transferCount + 2);
        }
      )
    );
  });
});

describe('filters', () => {
  function row(overrides: Partial<FilterRow>): FilterRow {
    return {
      category_id: null,
      account_id: 'a',
      original_amount: 0,
      amountHome: 0,
      name: null,
      note: null,
      transfer_id: null,
      status: 'paid',
      ...overrides,
    };
  }

  const rows: FilterRow[] = [
    row({ category_id: 'cat1', account_id: 'a', original_amount: 100, amountHome: 100, name: 'Coffee' }),
    row({ category_id: null, account_id: 'b', original_amount: -50, amountHome: -50, name: 'Cafe Nero' }),
    row({ category_id: 'cat2', account_id: 'a', original_amount: -2000, amountHome: null, name: 'Card payment', transfer_id: 'tx1' }),
    row({ category_id: 'cat2', account_id: 'c', original_amount: 2000, amountHome: 2000, name: 'Card payment in', transfer_id: 'tx1' }),
    row({ category_id: 'cat1', account_id: 'a', original_amount: 6000, amountHome: 6000, name: 'Big purchase' }),
  ];

  describe('filterRows', () => {
    it('returns every row unchanged under EMPTY_FILTER', () => {
      expect(filterRows(rows, EMPTY_FILTER)).toEqual(rows);
    });

    it('categoryIds [null] keeps only uncategorised rows', () => {
      expect(filterRows(rows, { ...EMPTY_FILTER, categoryIds: [null] })).toEqual([rows[1]]);
    });

    it("accountIds ['a'] keeps account a's own rows, including its own transfer leg", () => {
      expect(filterRows(rows, { ...EMPTY_FILTER, accountIds: ['a'] })).toEqual([rows[0], rows[2], rows[4]]);
    });

    it("direction 'in' keeps positive non-transfer rows", () => {
      expect(filterRows(rows, { ...EMPTY_FILTER, direction: 'in' })).toEqual([rows[0], rows[4]]);
    });

    it("direction 'out' keeps negative non-transfer rows", () => {
      expect(filterRows(rows, { ...EMPTY_FILTER, direction: 'out' })).toEqual([rows[1]]);
    });

    it("direction 'transfers' keeps only rows with a transfer_id", () => {
      expect(filterRows(rows, { ...EMPTY_FILTER, direction: 'transfers' })).toEqual([rows[2], rows[3]]);
    });

    it('amountMin/amountMax compare |amountHome|, falling back to |original_amount| when amountHome is null', () => {
      expect(filterRows(rows, { ...EMPTY_FILTER, amountMin: 1000, amountMax: 5000 })).toEqual([rows[2], rows[3]]);
    });

    it('amountMin alone excludes everything below it, with no ceiling', () => {
      expect(filterRows(rows, { ...EMPTY_FILTER, amountMin: 1000, amountMax: null })).toEqual([rows[2], rows[3], rows[4]]);
    });

    it('amountMax alone excludes everything above it, with no floor', () => {
      expect(filterRows(rows, { ...EMPTY_FILTER, amountMin: null, amountMax: 60 })).toEqual([rows[1]]);
    });

    it('unpaidOnly keeps only pending rows and composes with the other filters', () => {
      const mixed: FilterRow[] = [
        row({ account_id: 'a', original_amount: -500, status: 'pending' }),
        row({ account_id: 'a', original_amount: -700, status: 'paid' }),
        row({ account_id: 'b', original_amount: -900, status: 'pending' }),
        row({ account_id: 'a', original_amount: 400, status: 'pending' }),
        row({ account_id: 'a', original_amount: -300, status: 'skipped' }),
      ];
      expect(filterRows(mixed, { ...EMPTY_FILTER, unpaidOnly: true })).toEqual([mixed[0], mixed[2], mixed[3]]);
      expect(filterRows(mixed, { ...EMPTY_FILTER, unpaidOnly: true, accountIds: ['a'], direction: 'out' })).toEqual([mixed[0]]);
      expect(filterRows(mixed, { ...EMPTY_FILTER, unpaidOnly: false })).toEqual(mixed);
    });

    const filterRowArb = fc.record({
      status: fc.constantFrom('pending', 'paid', 'skipped'),
      category_id: fc.option(fc.string(), { nil: null }),
      account_id: fc.string({ minLength: 1 }),
      original_amount: fc.integer({ min: -1_000_000, max: 1_000_000 }),
      amountHome: fc.option(fc.integer({ min: -1_000_000, max: 1_000_000 }), { nil: null }),
      name: fc.option(fc.string(), { nil: null }),
      note: fc.option(fc.string(), { nil: null }),
      transfer_id: fc.option(fc.string(), { nil: null }),
    });

    it('property: EMPTY_FILTER never drops a row', () => {
      fc.assert(
        fc.property(fc.array(filterRowArb, { maxLength: 10 }), (someRows) => {
          expect(filterRows(someRows, EMPTY_FILTER)).toEqual(someRows);
        })
      );
    });
  });

  describe('isFilterActive', () => {
    it('is false for EMPTY_FILTER', () => {
      expect(isFilterActive(EMPTY_FILTER)).toBe(false);
    });

    it('is true when categoryIds is set', () => {
      expect(isFilterActive({ ...EMPTY_FILTER, categoryIds: [null] })).toBe(true);
    });

    it('is true when accountIds is set', () => {
      expect(isFilterActive({ ...EMPTY_FILTER, accountIds: ['a'] })).toBe(true);
    });

    it('is true when direction is not all', () => {
      expect(isFilterActive({ ...EMPTY_FILTER, direction: 'in' })).toBe(true);
    });

    it('is true when amountMin is set', () => {
      expect(isFilterActive({ ...EMPTY_FILTER, amountMin: 100 })).toBe(true);
    });

    it('is true when unpaidOnly is set', () => {
      expect(isFilterActive({ ...EMPTY_FILTER, unpaidOnly: true })).toBe(true);
    });

    it('is true when amountMax is set', () => {
      const f: ActivityFilter = { ...EMPTY_FILTER, amountMax: 100 };
      expect(isFilterActive(f)).toBe(true);
    });
  });

  describe('normaliseForSearch', () => {
    it('strips accents, lowercases, collapses whitespace and trims', () => {
      expect(normaliseForSearch('  Café   Nero  ')).toBe('cafe nero');
    });

    it('normalises an already-plain string to itself, lowercased', () => {
      expect(normaliseForSearch('Tesco')).toBe('tesco');
    });
  });

  describe('matchesSearch', () => {
    it('matches every token regardless of order', () => {
      expect(matchesSearch({ name: 'Café Nero', note: null }, 'NERO caf')).toBe(true);
    });

    it('matches a single accent- and case-insensitive token', () => {
      expect(matchesSearch({ name: 'Café Nero', note: null }, 'cafe')).toBe(true);
    });

    it('matches on the note when the name does not contain the token', () => {
      expect(matchesSearch({ name: null, note: 'Card payment' }, 'card')).toBe(true);
    });

    it('an empty search term matches everything', () => {
      expect(matchesSearch({ name: 'Café Nero', note: null }, '')).toBe(true);
    });

    it('does not match an unrelated term', () => {
      expect(matchesSearch({ name: 'Café Nero', note: null }, 'tesco')).toBe(false);
    });
  });
});

describe('accountBalance', () => {
  it('sums the opening balance with paid rows in the account currency, reporting other currencies separately', () => {
    expect(
      accountBalance({
        openingBalance: 10000,
        currency: 'GBP',
        legs: [
          { currency: 'GBP', paidSum: '-2500' },
          { currency: 'EUR', paidSum: '-1200' },
        ],
      })
    ).toEqual({ balance: 7500, otherCurrencies: [{ currency: 'EUR', paidSum: -1200 }], overflow: false });
  });

  it('flags overflow and reports a null balance when a sum exceeds a safe integer, for both the own-currency total and a foreign leg', () => {
    const hugeSum = (BigInt(Number.MAX_SAFE_INTEGER) + 10n).toString();
    const result = accountBalance({
      openingBalance: 0,
      currency: 'GBP',
      legs: [
        { currency: 'GBP', paidSum: hugeSum },
        { currency: 'EUR', paidSum: hugeSum },
      ],
    });
    expect(result.overflow).toBe(true);
    expect(result.balance).toBeNull();
    expect(result.otherCurrencies).toEqual([]);
  });

  it('is unaffected by whether a paid row was a transfer leg -- the server sum already includes it (D-50)', () => {
    // A transfer leg's paid amount is inside paidSum exactly like any other paid row; accountBalance
    // has no transfer-specific branch, so this is the same computation as the plain case above.
    expect(
      accountBalance({ openingBalance: 0, currency: 'GBP', legs: [{ currency: 'GBP', paidSum: '-5000' }] })
    ).toEqual({ balance: -5000, otherCurrencies: [], overflow: false });
  });
});

describe('refund-aware totals (D-03)', () => {
  it('files a paid refund under Money out as a reduction', () => {
    const t = monthTotals([{ amountHome: 500, status: 'paid', isTransfer: false, isRefund: true }], []);
    expect(t.paidIn).toBe(0);
    expect(t.paidOut).toBe(500);
    expect(t.net).toBe(500);
  });

  it('never routes a refund into paidIn and keeps paidIn + paidOut === net', () => {
    const row = fc.record({
      amountHome: fc.option(fc.integer({ min: -100000, max: 100000 }), { nil: null }),
      status: fc.constantFrom('pending', 'paid', 'skipped'),
      isTransfer: fc.boolean(),
      isRefund: fc.boolean(),
    });
    fc.assert(
      fc.property(fc.array(row), (rows) => {
        const t = monthTotals(rows, []);
        const refundsOnly = monthTotals(rows.map((r) => ({ ...r, isRefund: true })), []);
        expect(t.paidIn + t.paidOut).toBe(t.net);
        expect(refundsOnly.paidIn).toBe(0);
        expect(t.count).toBe(rows.filter((r) => !r.isTransfer && r.status !== 'skipped').length);
      })
    );
  });
});

describe('flowOf', () => {
  it('classifies by transfer link, refund flag, then sign', () => {
    expect(flowOf({ original_amount: 500, transfer_id: null, is_refund: true })).toBe('out');
    expect(flowOf({ original_amount: 500, transfer_id: 't', is_refund: true })).toBe('transfer');
    expect(flowOf({ original_amount: -300, transfer_id: null })).toBe('out');
    expect(flowOf({ original_amount: 300, transfer_id: null })).toBe('in');
  });

  it('filterRows direction in never returns a refund; out returns refunds', () => {
    const rows = [
      { category_id: null, account_id: 'a', original_amount: 500, amountHome: 500, name: null, note: null, transfer_id: null, status: 'paid' as const, is_refund: true },
      { category_id: null, account_id: 'a', original_amount: 300, amountHome: 300, name: null, note: null, transfer_id: null, status: 'paid' as const },
    ];
    expect(filterRows(rows, { ...EMPTY_FILTER, direction: 'in' })).toEqual([rows[1]]);
    expect(filterRows(rows, { ...EMPTY_FILTER, direction: 'out' })).toEqual([rows[0]]);
  });
});

describe('horizon-aware months', () => {
  it('includes every month through the horizon, newest first', () => {
    expect(monthsForSwitcher(['2026-09'], '2026-10-09', '2027-01')).toEqual([
      '2027-01', '2026-12', '2026-11', '2026-10', '2026-09',
    ]);
  });

  it('ignores a horizon earlier than next month and bounds a far horizon', () => {
    expect(monthsForSwitcher([], '2026-10-09', '2026-10')).toEqual(['2026-11', '2026-10']);
    expect(monthsForSwitcher([], '2026-10-09', '2099-01').length).toBeLessThanOrEqual(ADD_MONTH_LIMIT + 3);
  });

  it('throws RangeError on a malformed horizon', () => {
    expect(() => monthsForSwitcher([], '2026-10-09', 'nope')).toThrow(RangeError);
  });

  it('addableMonth stops at 12 months ahead', () => {
    expect(addableMonth('2026-10-09', null)).toBe('2026-12');
    expect(addableMonth('2026-10-09', '2027-09')).toBe('2027-10');
    expect(addableMonth('2026-10-09', '2027-10')).toBeNull();
    expect(addableMonth('2026-10-09', '2026-10')).toBe('2026-12');
  });

  it('monthsAhead counts months and rejects bad input', () => {
    expect(monthsAhead('2026-10', '2027-01')).toBe(3);
    expect(monthsAhead('2026-10', '2026-08')).toBe(-2);
    expect(() => monthsAhead('x', '2026-08')).toThrow(RangeError);
    expect(() => monthsAhead('2026-08', 'x')).toThrow(RangeError);
  });
});
