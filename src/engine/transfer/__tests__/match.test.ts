import fc from 'fast-check';
import {
  matchTransfers,
  isPaymentLike,
  daysBetween,
  TRANSFER_WINDOW_DAYS,
  TRANSFER_TOLERANCE_BPS,
  type ImportedLeg,
  type ExistingLeg,
  type TransferAccount,
} from '../match';
import { parseRate, type ScaledRate } from '../../money/rates';

const ACCOUNTS: TransferAccount[] = [
  { id: 'current', name: 'Current account', kind: 'checking', currency: 'GBP', exponent: 2 },
  { id: 'visa', name: 'Visa', kind: 'credit', currency: 'GBP', exponent: 2 },
  { id: 'savings', name: 'Savings', kind: 'savings', currency: 'GBP', exponent: 2 },
  { id: 'eur-acc', name: 'Euro account', kind: 'checking', currency: 'EUR', exponent: 2 },
];

function imported(overrides: Partial<ImportedLeg>): ImportedLeg {
  return {
    index: 0,
    accountId: 'visa',
    localDate: '2026-09-05',
    amount: 50000,
    currency: 'GBP',
    name: 'Groceries',
    trnType: null,
    ...overrides,
  };
}

function existing(overrides: Partial<ExistingLeg>): ExistingLeg {
  return {
    id: 'e1',
    accountId: 'current',
    localDate: '2026-09-03',
    amount: -50000,
    currency: 'GBP',
    name: null,
    paymentType: null,
    transferId: null,
    ...overrides,
  };
}

describe('TRANSFER_WINDOW_DAYS / TRANSFER_TOLERANCE_BPS', () => {
  it('default to 3 days and 500 bps (5%)', () => {
    expect(TRANSFER_WINDOW_DAYS).toBe(3);
    expect(TRANSFER_TOLERANCE_BPS).toBe(500);
  });
});

describe('daysBetween', () => {
  it('is the absolute day count between two local dates', () => {
    expect(daysBetween('2026-09-05', '2026-09-03')).toBe(2);
    expect(daysBetween('2026-09-03', '2026-09-05')).toBe(2);
    expect(daysBetween('2026-09-05', '2026-09-05')).toBe(0);
  });
});

describe('isPaymentLike', () => {
  it("'CARD PAYMENT' with no trnType or paymentType -> true", () => {
    expect(isPaymentLike('CARD PAYMENT', null, null)).toBe(true);
  });

  it("'Tesco' with trnType 'XFER' -> true", () => {
    expect(isPaymentLike('Tesco', 'XFER', null)).toBe(true);
  });

  it("'Tesco' with paymentType 'bank_transfer' -> true", () => {
    expect(isPaymentLike('Tesco', null, 'bank_transfer')).toBe(true);
  });

  it("'Tesco' with trnType 'POS' and paymentType 'card' -> false", () => {
    expect(isPaymentLike('Tesco', 'POS', 'card')).toBe(false);
  });
});

describe('matchTransfers', () => {
  it('pairs a card payment leg with the current-account leg it matches', () => {
    const result = matchTransfers({
      imported: [
        imported({
          index: 0,
          accountId: 'visa',
          localDate: '2026-09-05',
          amount: 50000,
          currency: 'GBP',
          name: 'PAYMENT - THANK YOU',
        }),
      ],
      existing: [
        existing({ id: 'e1', accountId: 'current', localDate: '2026-09-03', amount: -50000, currency: 'GBP' }),
      ],
      accounts: ACCOUNTS,
      perEur: new Map<string, ScaledRate>([['GBP', parseRate('1')]]),
    });

    expect(result).toEqual([{ kind: 'pair', importIndex: 0, existingId: 'e1', score: 4 }]);
  });

  it('pairs two equal payments in one week with their closest dates, one-to-one', () => {
    const result = matchTransfers({
      imported: [
        imported({ index: 0, accountId: 'visa', localDate: '2026-09-03', amount: 10000, name: 'X' }),
        imported({ index: 1, accountId: 'visa', localDate: '2026-09-04', amount: 10000, name: 'X' }),
      ],
      existing: [
        existing({ id: 'e1', accountId: 'current', localDate: '2026-09-02', amount: -10000 }),
        existing({ id: 'e2', accountId: 'current', localDate: '2026-09-05', amount: -10000 }),
      ],
      accounts: ACCOUNTS,
      perEur: new Map<string, ScaledRate>([['GBP', parseRate('1')]]),
    });

    expect(result).toHaveLength(2);
    expect(result).toContainEqual(expect.objectContaining({ kind: 'pair', importIndex: 0, existingId: 'e1' }));
    expect(result).toContainEqual(expect.objectContaining({ kind: 'pair', importIndex: 1, existingId: 'e2' }));
  });

  it('does not pair legs on the same account', () => {
    const result = matchTransfers({
      imported: [imported({ index: 0, accountId: 'current', amount: 5000, name: 'X' })],
      existing: [existing({ id: 'e1', accountId: 'current', amount: -5000 })],
      accounts: ACCOUNTS,
      perEur: new Map<string, ScaledRate>(),
    });
    expect(result).toEqual([]);
  });

  it('does not pair legs of the same sign', () => {
    const result = matchTransfers({
      imported: [imported({ index: 0, accountId: 'visa', amount: 5000, name: 'X' })],
      existing: [existing({ id: 'e1', accountId: 'current', amount: 5000 })],
      accounts: ACCOUNTS,
      perEur: new Map<string, ScaledRate>(),
    });
    expect(result).toEqual([]);
  });

  it('does not pair legs more than the window apart', () => {
    const result = matchTransfers({
      imported: [imported({ index: 0, accountId: 'visa', localDate: '2026-09-10', amount: 5000, name: 'X' })],
      existing: [existing({ id: 'e1', accountId: 'current', localDate: '2026-09-01', amount: -5000 })],
      accounts: ACCOUNTS,
      perEur: new Map<string, ScaledRate>(),
    });
    expect(result).toEqual([]);
  });

  it('does not pair an existing leg that is already linked', () => {
    const result = matchTransfers({
      imported: [imported({ index: 0, accountId: 'visa', amount: 5000, name: 'X' })],
      existing: [existing({ id: 'e1', accountId: 'current', amount: -5000, transferId: 'already-linked' })],
      accounts: ACCOUNTS,
      perEur: new Map<string, ScaledRate>(),
    });
    expect(result).toEqual([]);
  });

  it('pairs a cross-currency leg within the 5% tolerance', () => {
    const result = matchTransfers({
      imported: [
        imported({ index: 0, accountId: 'eur-acc', localDate: '2026-09-05', amount: 11500, currency: 'EUR', name: 'X' }),
      ],
      existing: [
        existing({ id: 'e1', accountId: 'current', localDate: '2026-09-04', amount: -10000, currency: 'GBP' }),
      ],
      accounts: ACCOUNTS,
      // 10000 GBP converts to 11700 EUR; actual in-leg is 11500 -> 1.7% difference, within 5%.
      perEur: new Map<string, ScaledRate>([
        ['GBP', parseRate('1')],
        ['EUR', parseRate('1.17')],
      ]),
    });
    expect(result).toEqual([{ kind: 'pair', importIndex: 0, existingId: 'e1', score: expect.any(Number) }]);
  });

  it('between equally scored cross-currency candidates, the smaller converted difference wins', () => {
    const result = matchTransfers({
      imported: [
        imported({ index: 0, accountId: 'eur-acc', localDate: '2026-09-05', amount: 11500, currency: 'EUR', name: 'X' }),
      ],
      existing: [
        // 9900 GBP -> 11583 EUR (diff 83); 9830 GBP -> 11501 EUR (diff 1). The id order alone would pick a-far.
        existing({ id: 'a-far', accountId: 'current', localDate: '2026-09-05', amount: -9900, currency: 'GBP' }),
        existing({ id: 'b-near', accountId: 'savings', localDate: '2026-09-05', amount: -9830, currency: 'GBP' }),
      ],
      accounts: ACCOUNTS,
      perEur: new Map<string, ScaledRate>([
        ['GBP', parseRate('1')],
        ['EUR', parseRate('1.17')],
      ]),
    });
    expect(result).toEqual([{ kind: 'pair', importIndex: 0, existingId: 'b-near', score: expect.any(Number) }]);
  });

  it('does not pair a cross-currency leg beyond the 5% tolerance', () => {
    const result = matchTransfers({
      imported: [
        imported({ index: 0, accountId: 'eur-acc', localDate: '2026-09-05', amount: 11500, currency: 'EUR', name: 'X' }),
      ],
      existing: [
        existing({ id: 'e1', accountId: 'current', localDate: '2026-09-04', amount: -10000, currency: 'GBP' }),
      ],
      accounts: ACCOUNTS,
      // 10000 GBP converts to 12300 EUR; actual in-leg is 11500 -> ~7% difference, beyond 5%.
      perEur: new Map<string, ScaledRate>([
        ['GBP', parseRate('1')],
        ['EUR', parseRate('1.23')],
      ]),
    });
    expect(result).toEqual([]);
  });

  it('skips a cross-currency candidate with a missing rate, and never throws', () => {
    expect(() =>
      matchTransfers({
        imported: [
          imported({ index: 0, accountId: 'eur-acc', localDate: '2026-09-05', amount: 11500, currency: 'EUR', name: 'X' }),
        ],
        existing: [
          existing({ id: 'e1', accountId: 'current', localDate: '2026-09-04', amount: -10000, currency: 'GBP' }),
        ],
        accounts: ACCOUNTS,
        perEur: new Map<string, ScaledRate>([['GBP', parseRate('1')]]), // EUR rate missing
      })
    ).not.toThrow();

    const result = matchTransfers({
      imported: [
        imported({ index: 0, accountId: 'eur-acc', localDate: '2026-09-05', amount: 11500, currency: 'EUR', name: 'X' }),
      ],
      existing: [
        existing({ id: 'e1', accountId: 'current', localDate: '2026-09-04', amount: -10000, currency: 'GBP' }),
      ],
      accounts: ACCOUNTS,
      perEur: new Map<string, ScaledRate>([['GBP', parseRate('1')]]),
    });
    expect(result).toEqual([]);
  });

  it('never throws when a cross-currency conversion overflows', () => {
    expect(() =>
      matchTransfers({
        imported: [
          imported({
            index: 0,
            accountId: 'eur-acc',
            localDate: '2026-09-05',
            amount: 9_000_000_000_000,
            currency: 'EUR',
            name: 'X',
          }),
        ],
        existing: [
          existing({
            id: 'e1',
            accountId: 'current',
            localDate: '2026-09-04',
            amount: -9_000_000_000_000,
            currency: 'GBP',
          }),
        ],
        accounts: ACCOUNTS,
        perEur: new Map<string, ScaledRate>([
          ['GBP', parseRate('1')],
          ['EUR', parseRate('1000000000000')],
        ]),
      })
    ).not.toThrow();
  });

  it('returns choose when two candidates tie on every key', () => {
    const result = matchTransfers({
      imported: [
        imported({ index: 0, accountId: 'visa', localDate: '2026-09-10', amount: 20000, currency: 'GBP', name: 'Foo' }),
      ],
      existing: [
        existing({ id: 'exist-b', accountId: 'savings', localDate: '2026-09-08', amount: -20000 }),
        existing({ id: 'exist-a', accountId: 'current', localDate: '2026-09-08', amount: -20000 }),
      ],
      accounts: ACCOUNTS,
      perEur: new Map<string, ScaledRate>([['GBP', parseRate('1')]]),
    });

    expect(result).toEqual([{ kind: 'choose', importIndex: 0, options: ['exist-a', 'exist-b'] }]);
  });

  it('reserves the legs a choose offers, so no stored leg is offered to two imports (review E-WR-06)', () => {
    const result = matchTransfers({
      imported: [
        imported({ index: 0, accountId: 'current', localDate: '2026-09-05', amount: -10000, name: 'Foo' }),
        imported({ index: 1, accountId: 'current', localDate: '2026-09-05', amount: -10000, name: 'Foo' }),
      ],
      existing: [
        existing({ id: 'e1', accountId: 'visa', localDate: '2026-09-05', amount: 10000 }),
        existing({ id: 'e2', accountId: 'visa', localDate: '2026-09-05', amount: 10000 }),
      ],
      accounts: ACCOUNTS,
      perEur: new Map<string, ScaledRate>([['GBP', parseRate('1')]]),
    });
    expect(result).toEqual([{ kind: 'choose', importIndex: 0, options: ['e1', 'e2'] }]);
  });

  it('offers an unmatched payment-like row as an orphan transfer', () => {
    const result = matchTransfers({
      imported: [imported({ index: 0, accountId: 'visa', name: 'TRANSFER TO SAVINGS' })],
      existing: [],
      accounts: ACCOUNTS,
      perEur: new Map<string, ScaledRate>(),
    });
    expect(result).toEqual([{ kind: 'orphan-transfer', importIndex: 0 }]);
  });

  it('offers no suggestion for an unmatched, non-payment-like row', () => {
    const result = matchTransfers({
      imported: [imported({ index: 0, accountId: 'visa', name: 'Groceries' })],
      existing: [],
      accounts: ACCOUNTS,
      perEur: new Map<string, ScaledRate>(),
    });
    expect(result).toEqual([]);
  });

  it('scores a description that mentions the other account name higher', () => {
    const withName = matchTransfers({
      imported: [
        imported({ index: 0, accountId: 'visa', localDate: '2026-09-05', amount: 5000, name: 'To Savings account' }),
      ],
      existing: [existing({ id: 'e1', accountId: 'savings', localDate: '2026-09-05', amount: -5000 })],
      accounts: ACCOUNTS,
      perEur: new Map<string, ScaledRate>([['GBP', parseRate('1')]]),
    });
    const withoutName = matchTransfers({
      imported: [imported({ index: 0, accountId: 'visa', localDate: '2026-09-05', amount: 5000, name: 'Groceries' })],
      existing: [existing({ id: 'e1', accountId: 'savings', localDate: '2026-09-05', amount: -5000 })],
      accounts: ACCOUNTS,
      perEur: new Map<string, ScaledRate>([['GBP', parseRate('1')]]),
    });

    const withNameScore = (withName[0] as { kind: 'pair'; score: number }).score;
    const withoutNameScore = (withoutName[0] as { kind: 'pair'; score: number }).score;
    expect(withNameScore).toBe(withoutNameScore + 2);
  });

  it('skips a cross-currency candidate whose account is missing from the accounts list, and never throws', () => {
    expect(() =>
      matchTransfers({
        imported: [
          imported({ index: 0, accountId: 'unknown-eur', localDate: '2026-09-05', amount: 11500, currency: 'EUR', name: 'X' }),
        ],
        existing: [
          existing({ id: 'e1', accountId: 'current', localDate: '2026-09-04', amount: -10000, currency: 'GBP' }),
        ],
        accounts: ACCOUNTS, // 'unknown-eur' deliberately absent
        perEur: new Map<string, ScaledRate>([
          ['GBP', parseRate('1')],
          ['EUR', parseRate('1.17')],
        ]),
      })
    ).not.toThrow();

    const result = matchTransfers({
      imported: [
        imported({ index: 0, accountId: 'unknown-eur', localDate: '2026-09-05', amount: 11500, currency: 'EUR', name: 'X' }),
      ],
      existing: [
        existing({ id: 'e1', accountId: 'current', localDate: '2026-09-04', amount: -10000, currency: 'GBP' }),
      ],
      accounts: ACCOUNTS,
      perEur: new Map<string, ScaledRate>([
        ['GBP', parseRate('1')],
        ['EUR', parseRate('1.17')],
      ]),
    });
    expect(result).toEqual([]);
  });

  it('breaks a tie in score and Δdays by the smaller amount difference', () => {
    const result = matchTransfers({
      imported: [
        imported({ index: 0, accountId: 'eur-acc', localDate: '2026-09-05', amount: 11500, currency: 'EUR', name: 'X' }),
      ],
      existing: [
        existing({ id: 'e-close', accountId: 'current', localDate: '2026-09-05', amount: -10000, currency: 'GBP' }),
        existing({ id: 'e-far-amount', accountId: 'current', localDate: '2026-09-05', amount: -10050, currency: 'GBP' }),
      ],
      accounts: ACCOUNTS,
      // 10000 GBP -> 11700 EUR (diff 200); 10050 GBP -> 11758.5 -> 11759 EUR (diff 259). Same
      // score and Δdays for both candidates, so the smaller amount difference should win outright
      // rather than being reported as a tie.
      perEur: new Map<string, ScaledRate>([
        ['GBP', parseRate('1')],
        ['EUR', parseRate('1.17')],
      ]),
    });

    expect(result).toEqual([{ kind: 'pair', importIndex: 0, existingId: 'e-close', score: expect.any(Number) }]);
  });

  it('breaks a full tie between two imports competing for the same existing leg by importIndex', () => {
    const result = matchTransfers({
      imported: [
        imported({ index: 0, accountId: 'visa', localDate: '2026-09-05', amount: 5000, name: 'Groceries' }),
        imported({ index: 1, accountId: 'visa', localDate: '2026-09-05', amount: 5000, name: 'Groceries' }),
      ],
      existing: [existing({ id: 'e1', accountId: 'current', localDate: '2026-09-05', amount: -5000 })],
      accounts: ACCOUNTS,
      perEur: new Map<string, ScaledRate>([['GBP', parseRate('1')]]),
    });

    expect(result).toEqual([{ kind: 'pair', importIndex: 0, existingId: 'e1', score: expect.any(Number) }]);
  });

  it('sorts output by importIndex', () => {
    const result = matchTransfers({
      imported: [
        imported({ index: 5, accountId: 'visa', localDate: '2026-09-05', amount: 5000, name: 'TRANSFER TO A' }),
        imported({ index: 1, accountId: 'visa', localDate: '2026-09-06', amount: 7000, name: 'TRANSFER TO B' }),
      ],
      existing: [],
      accounts: ACCOUNTS,
      perEur: new Map<string, ScaledRate>(),
    });
    expect(result.map((r) => r.importIndex)).toEqual([1, 5]);
  });
});

describe('matchTransfers: permutation-invariance property', () => {
  const accounts: TransferAccount[] = [
    { id: 'A', name: 'Account A', kind: 'checking', currency: 'GBP', exponent: 2 },
    { id: 'B', name: 'Account B', kind: 'checking', currency: 'GBP', exponent: 2 },
    { id: 'C', name: 'Account C', kind: 'checking', currency: 'GBP', exponent: 2 },
  ];
  const perEur = new Map<string, ScaledRate>([['GBP', parseRate('1')]]);

  const accountIdArb = fc.constantFrom('A', 'B', 'C');
  const dateArb = fc.constantFrom(
    '2026-09-01',
    '2026-09-02',
    '2026-09-03',
    '2026-09-04',
    '2026-09-05',
    '2026-09-06'
  );
  const amountArb = fc.constantFrom(-10000, -5000, 5000, 10000);

  const importedArb = fc
    .array(fc.tuple(accountIdArb, dateArb, amountArb), { minLength: 0, maxLength: 4 })
    .map((rows) =>
      rows.map(
        ([accountId, localDate, amount], index): ImportedLeg => ({
          index,
          accountId,
          localDate,
          amount,
          currency: 'GBP',
          name: 'X',
          trnType: null,
        })
      )
    );

  const existingArb = fc
    .array(fc.tuple(accountIdArb, dateArb, amountArb), { minLength: 0, maxLength: 4 })
    .map((rows) =>
      rows.map(
        ([accountId, localDate, amount], i): ExistingLeg => ({
          id: `e${i}`,
          accountId,
          localDate,
          amount,
          currency: 'GBP',
          name: null,
          paymentType: null,
          transferId: null,
        })
      )
    );

  function permute<T>(arr: readonly T[], seeds: readonly number[]): T[] {
    return arr
      .map((item, i) => ({ item, key: seeds[i % seeds.length]! }))
      .sort((a, b) => a.key - b.key)
      .map((x) => x.item);
  }

  it('produces the same output regardless of input order', () => {
    fc.assert(
      fc.property(
        importedArb,
        existingArb,
        fc.array(fc.integer(), { minLength: 1, maxLength: 8 }),
        fc.array(fc.integer(), { minLength: 1, maxLength: 8 }),
        (importedRows, existingRows, seedsA, seedsB) => {
          const original = matchTransfers({ imported: importedRows, existing: existingRows, accounts, perEur });
          const shuffled = matchTransfers({
            imported: permute(importedRows, seedsA),
            existing: permute(existingRows, seedsB),
            accounts,
            perEur,
          });
          expect(shuffled).toEqual(original);
        }
      )
    );
  });

  it('every pair has different accounts, opposite signs, |Δdays| <= 3, equal magnitudes, and no existing id twice', () => {
    fc.assert(
      fc.property(importedArb, existingArb, (importedRows, existingRows) => {
        const result = matchTransfers({ imported: importedRows, existing: existingRows, accounts, perEur });
        const pairs = result.filter((r): r is Extract<typeof r, { kind: 'pair' }> => r.kind === 'pair');

        const usedExistingIds = new Set<string>();
        for (const p of pairs) {
          const imp = importedRows.find((i) => i.index === p.importIndex)!;
          const ex = existingRows.find((e) => e.id === p.existingId)!;

          expect(imp.accountId).not.toBe(ex.accountId);
          expect(Math.sign(imp.amount)).not.toBe(Math.sign(ex.amount));
          expect(daysBetween(imp.localDate, ex.localDate)).toBeLessThanOrEqual(3);
          expect(Math.abs(imp.amount)).toBe(Math.abs(ex.amount));

          expect(usedExistingIds.has(p.existingId)).toBe(false);
          usedExistingIds.add(p.existingId);
        }

        // Review E-WR-06: a leg offered in a choose is reserved too -- no
        // stored id appears in more than one suggestion of any kind.
        for (const r of result) {
          if (r.kind !== 'choose') continue;
          for (const id of r.options) {
            expect(usedExistingIds.has(id)).toBe(false);
            usedExistingIds.add(id);
          }
        }
      })
    );
  });
});
