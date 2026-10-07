import fc from 'fast-check';
import { minorUnits } from '../../money';
import { convertDraft } from '../convert';
import { reconcile, type ReconcileRow } from '../reconcile';
import type { DraftRow, FormatProfile, StatementDraft } from '../types';

interface LedgerOpts {
  opening: number;
  amounts: readonly number[];
  dates?: readonly string[];
}

function dateFor(i: number): string {
  const day = String((i % 28) + 1).padStart(2, '0');
  return `2026-01-${day}`;
}

/** A dense true ledger: every row carries its own correct running balance. */
function buildDenseLedger({ opening, amounts, dates }: LedgerOpts): { rows: ReconcileRow[]; closing: number } {
  let running = opening;
  const rows: ReconcileRow[] = amounts.map((amount, i) => {
    running += amount;
    return { amount, balance: running, localDate: dates?.[i] ?? dateFor(i) };
  });
  return { rows, closing: running };
}

describe('reconcile: a consistent dense ledger', () => {
  it('file order -> all-verified, every row verified, orientation as-is', () => {
    const { rows, closing } = buildDenseLedger({ opening: 1000, amounts: [100, -50, 200] });
    const result = reconcile(rows, { opening: 1000, closing });
    expect(result.orientation).toBe('as-is');
    expect(result.file).toBe('all-verified');
    expect(result.rows).toEqual(['verified', 'verified', 'verified']);
    expect(result.failedLinks).toBe(0);
  });

  it('the same ledger newest-first -> orientation reversed, all verified (never sorted)', () => {
    const { rows, closing } = buildDenseLedger({ opening: 1000, amounts: [100, -50, 200] });
    const newestFirst = [...rows].reverse();
    const result = reconcile(newestFirst, { opening: 1000, closing });
    expect(result.orientation).toBe('reversed');
    expect(result.file).toBe('all-verified');
    expect(result.rows).toEqual(['verified', 'verified', 'verified']);
  });
});

describe('reconcile: a perturbed amount breaks exactly one link', () => {
  it('marks only the perturbed row cannot-verify, file partial', () => {
    const { rows, closing } = buildDenseLedger({ opening: 1000, amounts: [100, -50, 200, 75] });
    const perturbed = rows.map((r, i) => (i === 2 ? { ...r, amount: (r.amount as number) + 37 } : r));
    const result = reconcile(perturbed, { opening: 1000, closing });
    expect(result.file).toBe('partial');
    expect(result.rows.filter((s) => s === 'cannot-verify')).toHaveLength(1);
    expect(result.rows[2]).toBe('cannot-verify');
    expect(result.rows[0]).toBe('verified');
    expect(result.rows[1]).toBe('verified');
    expect(result.rows[3]).toBe('verified');
  });
});

describe('reconcile: deleting a row breaks exactly one link', () => {
  it('removes row 2 entirely -> exactly one remaining link fails', () => {
    const { rows, closing } = buildDenseLedger({ opening: 1000, amounts: [100, -50, 200, 75] });
    const withDeletion = rows.filter((_, i) => i !== 2);
    const result = reconcile(withDeletion, { opening: 1000, closing });
    expect(result.rows.filter((s) => s === 'cannot-verify')).toHaveLength(1);
    expect(result.file).toBe('partial');
  });
});

describe('reconcile: sparse balances verify by segment', () => {
  it('rows between two balanced rows verify when the segment sum matches', () => {
    const { rows, closing } = buildDenseLedger({ opening: 1000, amounts: [100, -50, 200, 75, -25] });
    const sparse = rows.map((r, i) => (i === 1 || i === 3 ? { ...r, balance: null } : r));
    const result = reconcile(sparse, { opening: 1000, closing });
    expect(result.file).toBe('all-verified');
    expect(result.rows).toEqual(['verified', 'verified', 'verified', 'verified', 'verified']);
  });

  it('a wrong amount inside a sparse segment fails the whole segment', () => {
    const { rows, closing } = buildDenseLedger({ opening: 1000, amounts: [100, -50, 200, 75, -25] });
    const sparse = rows.map((r, i) => {
      if (i === 1 || i === 3) return { ...r, balance: null };
      return r;
    });
    const broken = sparse.map((r, i) => (i === 2 ? { ...r, amount: (r.amount as number) + 5 } : r));
    const result = reconcile(broken, { opening: 1000, closing });
    // row2 keeps its own real balance (only rows 1 and 3 were blanked), so the
    // segment from anchor row0 to anchor row2 covers rows 1..2 and now fails.
    expect(result.rows[1]).toBe('cannot-verify');
    expect(result.rows[2]).toBe('cannot-verify');
    expect(result.file).toBe('partial');
  });
});

describe('reconcile: same-day order jitter', () => {
  it('shuffling interior rows inside a same-date block still verifies as a group', () => {
    const { rows } = buildDenseLedger({
      opening: 500,
      amounts: [10, 20, 30, 40],
      dates: ['2026-03-01', '2026-03-01', '2026-03-01', '2026-03-01'],
    });
    // swap the two interior rows (index 1 and 2), keeping the block's first and last
    // positions -- and therefore the true boundary balances -- in place.
    const shuffled = [rows[0] as ReconcileRow, rows[2] as ReconcileRow, rows[1] as ReconcileRow, rows[3] as ReconcileRow];
    const result = reconcile(shuffled, { opening: 500, closing: 600 });
    expect(result.file).toBe('all-verified');
    expect(result.rows.every((s) => s === 'verified-as-group')).toBe(true);
  });

  it('does not upgrade a same-date block whose boundary balances do not add up', () => {
    const { rows } = buildDenseLedger({
      opening: 500,
      amounts: [10, 20, 30, 40],
      dates: ['2026-03-01', '2026-03-01', '2026-03-01', '2026-03-01'],
    });
    const shuffled = [rows[0] as ReconcileRow, rows[2] as ReconcileRow, rows[1] as ReconcileRow, rows[3] as ReconcileRow];
    // corrupt one amount so neither the individual links nor the whole-block sum add up
    const broken = shuffled.map((r, i) => (i === 3 ? { ...r, amount: (r.amount as number) + 1 } : r));
    const result = reconcile(broken, { opening: 500, closing: 600 });
    expect(result.rows.some((s) => s === 'cannot-verify')).toBe(true);
    expect(result.file).toBe('partial');
  });
});

describe('reconcile: opening + closing only, no running balances', () => {
  it('sum matches -> all rows verified, file all-verified', () => {
    const rows: ReconcileRow[] = [
      { amount: 100, balance: null, localDate: '2026-01-01' },
      { amount: -30, balance: null, localDate: '2026-01-02' },
      { amount: 55, balance: null, localDate: '2026-01-03' },
    ];
    const result = reconcile(rows, { opening: 1000, closing: 1125 });
    expect(result.file).toBe('all-verified');
    expect(result.rows).toEqual(['verified', 'verified', 'verified']);
  });

  it('sum is wrong -> every row cannot-verify, file ends-only-mismatch', () => {
    const rows: ReconcileRow[] = [
      { amount: 100, balance: null, localDate: '2026-01-01' },
      { amount: -30, balance: null, localDate: '2026-01-02' },
      { amount: 55, balance: null, localDate: '2026-01-03' },
    ];
    const result = reconcile(rows, { opening: 1000, closing: 1200 });
    expect(result.file).toBe('ends-only-mismatch');
    expect(result.rows).toEqual(['cannot-verify', 'cannot-verify', 'cannot-verify']);
  });
});

describe('reconcile: no balances at all and no stated figures', () => {
  it('every row no-balance, file none-in-file', () => {
    const rows: ReconcileRow[] = [
      { amount: 100, balance: null, localDate: '2026-01-01' },
      { amount: -30, balance: null, localDate: '2026-01-02' },
    ];
    const result = reconcile(rows, { opening: null, closing: null });
    expect(result.file).toBe('none-in-file');
    expect(result.rows).toEqual(['no-balance', 'no-balance']);
  });

  it('an empty row list -> none-in-file, as-is, zero links', () => {
    const result = reconcile([], { opening: null, closing: null });
    expect(result).toEqual({ orientation: 'as-is', rows: [], file: 'none-in-file', verifiedLinks: 0, failedLinks: 0 });
  });
});

describe('reconcile: a row with a null amount breaks its link', () => {
  it('marks that link cannot-verify', () => {
    const { rows, closing } = buildDenseLedger({ opening: 1000, amounts: [100, -50, 200] });
    const broken = rows.map((r, i) => (i === 1 ? { ...r, amount: null } : r));
    const result = reconcile(broken, { opening: 1000, closing });
    expect(result.rows[1]).toBe('cannot-verify');
    expect(result.file).toBe('partial');
  });
});

describe('reconcile: available-credit rows (no limit) reconcile on the signed available figure (review E-WR-07)', () => {
  // Signed available 1000 -> 1010 -> 1030 -> 1055 (limit unknown, a constant
  // offset): each row's amount is the change from the row before.
  const fileOrder: ReconcileRow[] = [
    { amount: 1, balance: 1000, localDate: '2026-02-01' },
    { amount: 10, balance: 1010, localDate: '2026-02-02' },
    { amount: 20, balance: 1030, localDate: '2026-02-03' },
    { amount: 25, balance: 1055, localDate: '2026-02-04' },
  ];

  it('every link verifies from row 1 on, exactly like a held running balance', () => {
    const result = reconcile(fileOrder, { opening: null, closing: null });
    expect(result.rows).toEqual(['no-balance', 'verified', 'verified', 'verified']);
    expect(result.verifiedLinks).toBe(3);
  });

  it('the same file newest-first verifies in reversed orientation', () => {
    const result = reconcile([...fileOrder].reverse(), { opening: null, closing: null });
    expect(result.orientation).toBe('reversed');
    expect(result.verifiedLinks).toBe(3);
    expect(result.failedLinks).toBe(0);
  });

  it('end to end: an available-credit card CSV with no limit verifies through convertDraft', () => {
    const profile: FormatProfile = {
      version: 1, source: 'csv', accountFamily: 'card', positiveMeans: 'money-in', balanceMeans: 'available',
      statedLimit: null, decidedBy: 'user',
    };
    const row = (index: number, amount: number, available: number): DraftRow => ({
      index, localDate: `2026-02-0${3 - index}`, description: 'X', magnitude: minorUnits(Math.abs(amount)),
      marker: amount < 0 ? 'minus' : 'none', rawAmount: null, balanceMagnitude: minorUnits(available), balanceMarker: 'none',
      rawBalance: null, currency: 'GBP', externalId: null, trnType: null, issues: [],
    });
    // newest-first: purchases reduce available credit, a payment restores it
    const draft: StatementDraft = {
      source: 'csv', layoutSignature: 'x', accountHint: null, currency: 'GBP',
      rows: [row(0, 5000, 9000), row(1, -2000, 4000), row(2, -1000, 6000)],
      statedOpening: null, statedClosing: null, available: null, statedLimit: null, balanceLabel: 'available',
      labels: [], periodStart: null, periodEnd: null, warnings: [],
    };
    const converted = convertDraft(draft, profile, { limit: null });
    const result = reconcile(
      converted.rows.map((r) => ({ amount: r.amount, balance: r.availableSigned, localDate: r.localDate })),
      { opening: null, closing: null }
    );
    expect(result.orientation).toBe('reversed');
    expect(result.verifiedLinks).toBe(2);
    expect(result.failedLinks).toBe(0);
  });
});

describe('reconcile: a stated closing is checked even when rows carry running balances (review E-WR-12)', () => {
  const rows: ReconcileRow[] = [
    { amount: -100, balance: 900, localDate: '2026-03-01' },
    { amount: -50, balance: 850, localDate: '2026-03-02' },
  ];

  it('a closing equal to the last running balance adds one verified link', () => {
    const result = reconcile(rows, { opening: 1000, closing: 850 });
    expect(result.file).toBe('all-verified');
    expect(result.verifiedLinks).toBe(3);
    expect(result.failedLinks).toBe(0);
  });

  it('a closing that disagrees with the last running balance fails the file', () => {
    const result = reconcile(rows, { opening: 1000, closing: 700 });
    expect(result.file).toBe('partial');
    expect(result.rows).toEqual(['verified', 'cannot-verify']);
    expect(result.failedLinks).toBe(1);
  });

  it('rows after the last running balance are verified against the closing', () => {
    const trailing: ReconcileRow[] = [...rows, { amount: -25, balance: null, localDate: '2026-03-03' }];
    const result = reconcile(trailing, { opening: 1000, closing: 825 });
    expect(result.file).toBe('all-verified');
    expect(result.rows).toEqual(['verified', 'verified', 'verified']);
  });

  it('truncated rows after the last running balance fail against the closing', () => {
    const trailing: ReconcileRow[] = [...rows, { amount: -25, balance: null, localDate: '2026-03-03' }];
    const result = reconcile(trailing, { opening: 1000, closing: 600 });
    expect(result.file).toBe('partial');
    expect(result.rows).toEqual(['verified', 'verified', 'cannot-verify']);
  });

  it('an unreadable trailing amount can never verify the closing', () => {
    const trailing: ReconcileRow[] = [...rows, { amount: null, balance: null, localDate: '2026-03-03' }];
    const result = reconcile(trailing, { opening: 1000, closing: 850 });
    expect(result.rows[2]).toBe('cannot-verify');
  });

  it('newest-first: the closing is checked at the chronologically last row', () => {
    const newestFirst: ReconcileRow[] = [
      { amount: -50, balance: 850, localDate: '2026-03-02' },
      { amount: -100, balance: 900, localDate: '2026-03-01' },
    ];
    expect(reconcile(newestFirst, { opening: 1000, closing: 850 }).file).toBe('all-verified');
    expect(reconcile(newestFirst, { opening: 1000, closing: 900 }).file).toBe('partial');
  });
});

describe('reconcile: negative balances are never flagged', () => {
  it('property: an opening crossing zero in either direction still verifies with no flag', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -1_000_000_000_000, max: 1_000_000_000_000 }),
        fc.array(fc.integer({ min: -1_000_000_000_000, max: 1_000_000_000_000 }), { minLength: 1, maxLength: 25 }),
        (opening, amounts) => {
          const { rows, closing } = buildDenseLedger({ opening, amounts });
          const result = reconcile(rows, { opening, closing });
          expect(result.file).toBe('all-verified');
          expect(result.rows.every((s) => s === 'verified')).toBe(true);
        }
      )
    );
  });
});

describe('reconcile: 5,000 rows near the 1e13 bound -- exact via BigInt, no precision loss', () => {
  it('an unbroken run of large positive amounts then large negative amounts sums to exactly zero (ends-only path)', () => {
    const big = 9_999_999_999_999; // just under MAX_ABS_AMOUNT_MINOR
    const amounts: number[] = [];
    for (let i = 0; i < 2500; i += 1) amounts.push(big);
    for (let i = 0; i < 2500; i += 1) amounts.push(-big);
    const rows: ReconcileRow[] = amounts.map((amount, i) => ({ amount, balance: null, localDate: dateFor(i) }));
    const result = reconcile(rows, { opening: 0, closing: 0 });
    expect(result.file).toBe('all-verified');
  });

  it('the same 5,000-row swing checked as one running-balance segment (opening to a single closing anchor)', () => {
    const big = 9_999_999_999_999;
    const amounts: number[] = [];
    for (let i = 0; i < 2500; i += 1) amounts.push(big);
    for (let i = 0; i < 2500; i += 1) amounts.push(-big);
    const rows: ReconcileRow[] = amounts.map((amount, i) => ({ amount, balance: null, localDate: dateFor(i) }));
    // give the very last row a real balance equal to the true closing (opening 0 + net 0 = 0)
    rows[rows.length - 1] = { ...(rows[rows.length - 1] as ReconcileRow), balance: 0 };
    const result = reconcile(rows, { opening: 0, closing: null });
    expect(result.file).toBe('all-verified');
    expect(result.rows.every((s) => s === 'verified')).toBe(true);
  });
});

describe('no-leak', () => {
  it('never throws for any content, and results carry only indexes and codes', () => {
    const rows: ReconcileRow[] = [
      { amount: null, balance: null, localDate: null },
      { amount: 10, balance: 5, localDate: '2026-01-01' },
      { amount: -3, balance: null, localDate: null },
    ];
    expect(() => reconcile(rows, { opening: null, closing: null })).not.toThrow();
    const result = reconcile(rows, { opening: null, closing: null });
    expect(result.rows).toHaveLength(3);
    for (const status of result.rows) {
      expect(['verified', 'verified-as-group', 'cannot-verify', 'no-balance']).toContain(status);
    }
  });
});

describe('reconcile: coverage edges', () => {
  it('ends-only path with a null amount present never falsely claims a match', () => {
    const rows: ReconcileRow[] = [
      { amount: 100, balance: null, localDate: '2026-01-01' },
      { amount: null, balance: null, localDate: '2026-01-02' },
      { amount: 55, balance: null, localDate: '2026-01-03' },
    ];
    const result = reconcile(rows, { opening: 1000, closing: 1155 });
    expect(result.file).toBe('ends-only-mismatch');
    expect(result.rows.every((s) => s === 'cannot-verify')).toBe(true);
  });

  it('a same-date block that already verifies normally is left alone (no group upgrade attempted)', () => {
    const { rows, closing } = buildDenseLedger({
      opening: 100,
      amounts: [10, 20, 30],
      dates: ['2026-04-01', '2026-04-01', '2026-04-01'],
    });
    const result = reconcile(rows, { opening: 100, closing });
    expect(result.file).toBe('all-verified');
    expect(result.rows).toEqual(['verified', 'verified', 'verified']);
  });

  it('a failing same-date block at the very start of the file, with no stated opening, cannot be upgraded (no boundary value before it)', () => {
    const { rows } = buildDenseLedger({
      opening: 0,
      amounts: [10, 20, 30],
      dates: ['2026-05-01', '2026-05-01', '2026-05-01'],
    });
    // row0's own balance is never checkable (no stated.opening, no preceding anchor).
    // Perturb row2's amount so the row1->row2 link fails; the block cannot be
    // rescued because there is no boundary value before the block (start === 0
    // and stated.opening is null).
    const broken = rows.map((r, i) => (i === 2 ? { ...r, amount: (r.amount as number) + 1 } : r));
    const result = reconcile(broken, { opening: null, closing: null });
    expect(result.rows[0]).toBe('no-balance');
    expect(result.rows[2]).toBe('cannot-verify');
    expect(result.file).toBe('partial');
  });

  it('a failing same-date block that starts after another row uses the preceding row\'s own balance as its boundary', () => {
    const { rows } = buildDenseLedger({
      opening: 100,
      amounts: [5, 10, 20, 30],
      dates: ['2026-02-01', '2026-02-02', '2026-02-02', '2026-02-02'],
    });
    // row0 is outside the block (a different date); swap the two interior rows
    // of the 3-row same-date block that follows it.
    const shuffled = [rows[0] as ReconcileRow, rows[2] as ReconcileRow, rows[1] as ReconcileRow, rows[3] as ReconcileRow];
    const result = reconcile(shuffled, { opening: 100, closing: 165 });
    expect(result.file).toBe('all-verified');
    expect(result.rows[0]).toBe('verified');
    expect(result.rows.slice(1)).toEqual(['verified-as-group', 'verified-as-group', 'verified-as-group']);
  });

  it('a failing same-date block whose own last row has no balance cannot be upgraded (no boundary value after it)', () => {
    const rows: ReconcileRow[] = [
      { amount: 10, balance: 110, localDate: '2026-07-01' },
      { amount: 21, balance: 130, localDate: '2026-07-01' }, // true amount is 20; perturbed so this link fails
      { amount: 5, balance: null, localDate: '2026-07-01' },
    ];
    const result = reconcile(rows, { opening: 100, closing: null });
    expect(result.orientation).toBe('as-is');
    expect(result.rows).toEqual(['verified', 'cannot-verify', 'no-balance']);
    expect(result.file).toBe('partial');
  });

  it('the date tie-break alone can select reversed when link counts tie at zero', () => {
    const rows: ReconcileRow[] = [
      { amount: 5, balance: null, localDate: '2026-06-05' },
      { amount: 7, balance: null, localDate: '2026-06-01' },
    ];
    // forward dates descend (not non-decreasing); reversed dates ascend.
    const result = reconcile(rows, { opening: null, closing: null });
    expect(result.orientation).toBe('reversed');
  });
});
