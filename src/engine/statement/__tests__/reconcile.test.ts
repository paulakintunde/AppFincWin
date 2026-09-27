import fc from 'fast-check';
import { reconcile, type ReconcileRow } from '../reconcile';

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

describe('reconcile: available-credit rows (no limit) reconcile via availableDelta', () => {
  it('a consistent held-view delta chain verifies from its second link onward', () => {
    // heldView (arbitrarily seeded): row0 unknown, row1 = 10, row2 = 30, row3 = 55.
    // delta[i] = heldView[i] - heldView[i-1], which a consistent ledger requires to
    // equal amt[i]. Row0 has no delta (nothing precedes it) and row1 -- the first
    // anchor found -- has nothing before it either (no stated.opening exists in this
    // held-view scale), so neither can ever be verified; row1's own amount is
    // therefore irrelevant to the check. Rows 2 and 3 chain off row1's anchor value.
    const rows: ReconcileRow[] = [
      { amount: 1, balance: null, localDate: '2026-02-01', availableDelta: null },
      { amount: 999, balance: null, localDate: '2026-02-02', availableDelta: 10 },
      { amount: 20, balance: null, localDate: '2026-02-03', availableDelta: 20 },
      { amount: 25, balance: null, localDate: '2026-02-04', availableDelta: 25 },
    ];
    const result = reconcile(rows, { opening: null, closing: null });
    expect(result.file).toBe('partial');
    expect(result.rows).toEqual(['no-balance', 'no-balance', 'verified', 'verified']);
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
      { amount: 10, balance: 5, localDate: '2026-01-01', availableDelta: null },
      { amount: -3, balance: null, localDate: null, availableDelta: 7 },
    ];
    expect(() => reconcile(rows, { opening: null, closing: null })).not.toThrow();
    const result = reconcile(rows, { opening: null, closing: null });
    expect(result.rows).toHaveLength(3);
    for (const status of result.rows) {
      expect(['verified', 'verified-as-group', 'cannot-verify', 'no-balance']).toContain(status);
    }
  });
});
