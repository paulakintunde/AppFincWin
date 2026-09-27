import fc from 'fast-check';
import { markerSign, minorUnits, type AmountMarker, type MinorUnits } from '../../money';
import { convertAmount, convertBalance, convertDraft, signOfPositive } from '../convert';
import type { DraftRow, FormatProfile, StatementDraft } from '../types';

function makeRow(index: number, overrides: Partial<DraftRow> = {}): DraftRow {
  return {
    index,
    localDate: '2026-01-01',
    description: 'Row',
    magnitude: minorUnits(100),
    marker: 'none',
    rawAmount: '1.00',
    balanceMagnitude: null,
    balanceMarker: 'none',
    rawBalance: null,
    currency: 'GBP',
    externalId: null,
    trnType: null,
    issues: [],
    ...overrides,
  };
}

function makeDraft(overrides: Partial<StatementDraft> = {}): StatementDraft {
  return {
    source: 'csv',
    layoutSignature: 'date|description|amount',
    accountHint: null,
    currency: 'GBP',
    rows: [],
    statedOpening: null,
    statedClosing: null,
    available: null,
    statedLimit: null,
    balanceLabel: null,
    labels: [],
    periodStart: null,
    periodEnd: null,
    warnings: [],
    ...overrides,
  };
}

function makeProfile(overrides: Partial<FormatProfile> = {}): FormatProfile {
  return {
    version: 1,
    source: 'csv',
    accountFamily: 'deposit',
    positiveMeans: 'money-in',
    balanceMeans: 'held',
    statedLimit: null,
    decidedBy: 'user',
    ...overrides,
  };
}

describe('signOfPositive', () => {
  it('money-in -> +1', () => {
    expect(signOfPositive(makeProfile({ positiveMeans: 'money-in' }))).toBe(1);
  });
  it('money-spent -> -1', () => {
    expect(signOfPositive(makeProfile({ positiveMeans: 'money-spent' }))).toBe(-1);
  });
});

describe('convertAmount: deposit, positiveMeans money-in', () => {
  const profile = makeProfile({ positiveMeans: 'money-in' });
  it('(1250, minus) -> -1250', () => {
    expect(convertAmount(minorUnits(1250), 'minus', profile)).toBe(-1250);
  });
  it('(1250, none) -> +1250', () => {
    expect(convertAmount(minorUnits(1250), 'none', profile)).toBe(1250);
  });
});

describe('convertAmount: card, positiveMeans money-spent (issuer view)', () => {
  const profile = makeProfile({ positiveMeans: 'money-spent', accountFamily: 'card' });
  it('purchase (1250, none) -> -1250', () => {
    expect(convertAmount(minorUnits(1250), 'none', profile)).toBe(-1250);
  });
  it('payment (50000, minus) -> +50000', () => {
    expect(convertAmount(minorUnits(50000), 'minus', profile)).toBe(50000);
  });
});

describe('convertAmount: DR/CR rows, independent of positiveMeans', () => {
  it('(1250, dr) -> -1250 under money-in', () => {
    expect(convertAmount(minorUnits(1250), 'dr', makeProfile({ positiveMeans: 'money-in' }))).toBe(-1250);
  });
  it('(1250, cr) -> +1250 under money-in', () => {
    expect(convertAmount(minorUnits(1250), 'cr', makeProfile({ positiveMeans: 'money-in' }))).toBe(1250);
  });
  it('(1250, dr) -> -1250 under money-spent', () => {
    expect(convertAmount(minorUnits(1250), 'dr', makeProfile({ positiveMeans: 'money-spent' }))).toBe(-1250);
  });
  it('(1250, cr) -> +1250 under money-spent', () => {
    expect(convertAmount(minorUnits(1250), 'cr', makeProfile({ positiveMeans: 'money-spent' }))).toBe(1250);
  });
});

describe('convertBalance: held', () => {
  const profile = makeProfile({ balanceMeans: 'held' });
  it('(24000, minus) held -> -24000 (overdrawn stays negative, no flag)', () => {
    expect(convertBalance({ magnitude: minorUnits(24000), marker: 'minus' }, profile, null)).toBe(-24000);
  });
  it('(24000, none) held -> +24000', () => {
    expect(convertBalance({ magnitude: minorUnits(24000), marker: 'none' }, profile, null)).toBe(24000);
  });
  it('(500, dr) held -> -500 (dr is independent of balanceMeans)', () => {
    expect(convertBalance({ magnitude: minorUnits(500), marker: 'dr' }, profile, null)).toBe(-500);
  });
  it('(500, cr) held -> +500 (cr is independent of balanceMeans)', () => {
    expect(convertBalance({ magnitude: minorUnits(500), marker: 'cr' }, profile, null)).toBe(500);
  });
});

describe('convertBalance: owed', () => {
  const profile = makeProfile({ balanceMeans: 'owed', accountFamily: 'card', positiveMeans: 'money-spent' });
  it('owed balance (125000, none) -> -125000', () => {
    expect(convertBalance({ magnitude: minorUnits(125000), marker: 'none' }, profile, null)).toBe(-125000);
  });
  it('owed balance (1500, cr) -> +1500 (in credit after a refund)', () => {
    expect(convertBalance({ magnitude: minorUnits(1500), marker: 'cr' }, profile, null)).toBe(1500);
  });
  it('owed balance (500, dr) -> -500 (dr reinforces owed, independent of the formula)', () => {
    expect(convertBalance({ magnitude: minorUnits(500), marker: 'dr' }, profile, null)).toBe(-500);
  });
});

describe('convertBalance: available with a known limit', () => {
  const profile = makeProfile({ balanceMeans: 'available', accountFamily: 'card', positiveMeans: 'money-spent' });
  it('available (25000, none), limit 100000 -> -75000', () => {
    expect(convertBalance({ magnitude: minorUnits(25000), marker: 'none' }, profile, minorUnits(100000))).toBe(-75000);
  });
  it('available (25000, minus), limit 100000 -> -125000 (over limit)', () => {
    expect(convertBalance({ magnitude: minorUnits(25000), marker: 'minus' }, profile, minorUnits(100000))).toBe(
      -125000
    );
  });
});

describe('convertBalance: available with no known limit', () => {
  it('returns null so no limit is ever invented', () => {
    const profile = makeProfile({ balanceMeans: 'available' });
    expect(convertBalance({ magnitude: minorUnits(25000), marker: 'none' }, profile, null)).toBeNull();
  });
});

describe('convertBalance: balanceMeans none', () => {
  it('returns null -- nothing to convert', () => {
    const profile = makeProfile({ balanceMeans: 'none' });
    expect(convertBalance({ magnitude: minorUnits(1000), marker: 'none' }, profile, null)).toBeNull();
  });
});

describe('convertDraft: rows with a null magnitude', () => {
  it('keeps amount null and passes issues and raw strings through unchanged', () => {
    const profile = makeProfile();
    const draft = makeDraft({
      rows: [
        makeRow(0, {
          magnitude: null,
          marker: 'none',
          issues: ['bad-amount'],
          rawAmount: 'garbled',
          rawBalance: 'also garbled',
        }),
      ],
    });
    const result = convertDraft(draft, profile, { limit: null });
    expect(result.rows[0]?.amount).toBeNull();
    expect(result.rows[0]?.issues).toEqual(['bad-amount']);
    expect(result.rows[0]?.rawAmount).toBe('garbled');
    expect(result.rows[0]?.rawBalance).toBe('also garbled');
  });
});

describe('convertDraft: statedOpening/statedClosing/available conversion', () => {
  it('converts statedOpening and statedClosing with the same balance rule', () => {
    const profile = makeProfile({ balanceMeans: 'held' });
    const draft = makeDraft({
      statedOpening: { magnitude: minorUnits(1000), marker: 'minus', asOf: '2026-01-01', raw: '-10.00' },
      statedClosing: { magnitude: minorUnits(2000), marker: 'none', asOf: '2026-01-31', raw: '20.00' },
    });
    const result = convertDraft(draft, profile, { limit: null });
    expect(result.opening).toBe(-1000);
    expect(result.closing).toBe(2000);
  });

  it('converts OFX LEDGERBAL (statedClosing) under an owed balanceMeans', () => {
    const profile = makeProfile({ balanceMeans: 'owed', accountFamily: 'card', positiveMeans: 'money-spent' });
    const draft = makeDraft({
      source: 'ofx',
      statedClosing: { magnitude: minorUnits(50000), marker: 'none', asOf: '2026-01-31', raw: '500.00' },
    });
    const result = convertDraft(draft, profile, { limit: null });
    expect(result.closing).toBe(-50000);
  });

  it('converts the OFX AVAILBAL (available) figure with the same rule', () => {
    const profile = makeProfile({ balanceMeans: 'held' });
    const draft = makeDraft({
      source: 'ofx',
      available: { magnitude: minorUnits(3000), marker: 'minus', asOf: '2026-01-31', raw: '-30.00' },
    });
    const result = convertDraft(draft, profile, { limit: null });
    expect(result.available).toBe(-3000);
  });

  it('leaves opening/closing/available null when absent from the draft', () => {
    const profile = makeProfile();
    const draft = makeDraft();
    const result = convertDraft(draft, profile, { limit: null });
    expect(result.opening).toBeNull();
    expect(result.closing).toBeNull();
    expect(result.available).toBeNull();
  });
});

describe('convertDraft: available-credit balance with a known limit produces a per-row balance, not a delta', () => {
  it('available (25000, none), limit 100000 -> row.balance -75000, availableDelta null', () => {
    const profile = makeProfile({ balanceMeans: 'available', accountFamily: 'card', positiveMeans: 'money-spent' });
    const draft = makeDraft({
      rows: [makeRow(0, { balanceMagnitude: minorUnits(25000), balanceMarker: 'none' })],
    });
    const result = convertDraft(draft, profile, { limit: minorUnits(100000) });
    expect(result.rows[0]?.balance).toBe(-75000);
    expect(result.rows[0]?.availableDelta).toBeNull();
  });
});

describe('convertDraft: available-credit balance with no limit keeps a per-row availableDelta', () => {
  const profile = makeProfile({ balanceMeans: 'available', accountFamily: 'card', positiveMeans: 'money-spent' });

  it('first row: availableDelta is null, balance is null', () => {
    const draft = makeDraft({
      rows: [makeRow(0, { balanceMagnitude: minorUnits(25000), balanceMarker: 'none' })],
    });
    const result = convertDraft(draft, profile, { limit: null });
    expect(result.rows[0]?.balance).toBeNull();
    expect(result.rows[0]?.availableDelta).toBeNull();
  });

  it('second row: availableDelta is the held-view difference to the previous row', () => {
    const draft = makeDraft({
      rows: [
        makeRow(0, { balanceMagnitude: minorUnits(25000), balanceMarker: 'none' }),
        makeRow(1, { balanceMagnitude: minorUnits(20000), balanceMarker: 'none' }),
      ],
    });
    const result = convertDraft(draft, profile, { limit: null });
    // held view: +25000, then +20000 -> delta = 20000 - 25000 = -5000
    expect(result.rows[1]?.availableDelta).toBe(-5000);
    expect(result.rows[1]?.balance).toBeNull();
  });

  it('a gap (null balance) breaks the delta for the row right after it', () => {
    const draft = makeDraft({
      rows: [
        makeRow(0, { balanceMagnitude: minorUnits(25000), balanceMarker: 'none' }),
        makeRow(1, { balanceMagnitude: null, balanceMarker: 'none' }),
        makeRow(2, { balanceMagnitude: minorUnits(20000), balanceMarker: 'none' }),
      ],
    });
    const result = convertDraft(draft, profile, { limit: null });
    expect(result.rows[1]?.availableDelta).toBeNull();
    expect(result.rows[2]?.availableDelta).toBeNull(); // previous row (index 1) has no balance
  });
});

describe('convertDraft: held/owed rows carry a converted per-row balance when present', () => {
  it('a held row with a balance gets balance converted, availableDelta null', () => {
    const profile = makeProfile({ balanceMeans: 'held' });
    const draft = makeDraft({
      rows: [makeRow(0, { balanceMagnitude: minorUnits(500), balanceMarker: 'minus' })],
    });
    const result = convertDraft(draft, profile, { limit: null });
    expect(result.rows[0]?.balance).toBe(-500);
    expect(result.rows[0]?.availableDelta).toBeNull();
  });

  it('a row with no balance at all keeps balance and availableDelta both null', () => {
    const profile = makeProfile({ balanceMeans: 'held' });
    const draft = makeDraft({
      rows: [makeRow(0, { balanceMagnitude: null })],
    });
    const result = convertDraft(draft, profile, { limit: null });
    expect(result.rows[0]?.balance).toBeNull();
    expect(result.rows[0]?.availableDelta).toBeNull();
  });
});

// ---- Properties ----

function renderAmountMarker(a: number, profile: FormatProfile): AmountMarker {
  const s = signOfPositive(profile);
  const aSign = a < 0 ? -1 : 1;
  const rawSign = aSign * s;
  return rawSign === 1 ? 'none' : 'minus';
}

function renderBalanceMarker(value: number, balanceMeans: 'held' | 'owed'): AmountMarker {
  const target = balanceMeans === 'held' ? value : -value;
  const targetSign = target < 0 ? -1 : 1;
  return targetSign === 1 ? 'none' : 'minus';
}

describe('property: round-trip through render -> convert for a decided held/owed profile', () => {
  it('recovers every row amount and the opening/closing balances, and the amounts sum to closing - opening', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<FormatProfile['positiveMeans']>('money-in', 'money-spent'),
        fc.constantFrom<'held' | 'owed'>('held', 'owed'),
        fc.integer({ min: -100_000_00, max: 100_000_00 }),
        fc.array(fc.integer({ min: -100_000_00, max: 100_000_00 }), { minLength: 0, maxLength: 30 }),
        (positiveMeans, balanceMeans, openingRaw, rowAmountsRaw) => {
          const profile = makeProfile({ positiveMeans, balanceMeans });
          const closingRaw = rowAmountsRaw.reduce((acc, a) => acc + a, openingRaw);

          const rows: DraftRow[] = rowAmountsRaw.map((a, i) =>
            makeRow(i, {
              magnitude: minorUnits(Math.abs(a)),
              marker: renderAmountMarker(a, profile),
            })
          );

          const draft = makeDraft({
            rows,
            statedOpening: {
              magnitude: minorUnits(Math.abs(openingRaw)),
              marker: renderBalanceMarker(openingRaw, balanceMeans),
              asOf: null,
              raw: String(openingRaw),
            },
            statedClosing: {
              magnitude: minorUnits(Math.abs(closingRaw)),
              marker: renderBalanceMarker(closingRaw, balanceMeans),
              asOf: null,
              raw: String(closingRaw),
            },
          });

          const converted = convertDraft(draft, profile, { limit: null });

          expect(converted.opening).toBe(openingRaw);
          expect(converted.closing).toBe(closingRaw);
          converted.rows.forEach((r, i) => expect(r.amount).toBe(rowAmountsRaw[i]));

          const sum = converted.rows.reduce((acc: number, r) => acc + (r.amount ?? 0), 0);
          expect(sum).toBe(closingRaw - openingRaw);
        }
      )
    );
  });
});

describe('property: available-credit files without a limit -- consecutive differences equal held-view differences', () => {
  it('holds for any sequence of present/absent balance readings', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.option(
            fc.record({
              magnitude: fc.integer({ min: 0, max: 1_000_000_00 }),
              marker: fc.constantFrom<AmountMarker>('none', 'plus', 'minus', 'parens'),
            }),
            { nil: null }
          ),
          { minLength: 1, maxLength: 20 }
        ),
        (balanceReadings) => {
          const profile = makeProfile({ balanceMeans: 'available', accountFamily: 'card', positiveMeans: 'money-spent' });
          const rows: DraftRow[] = balanceReadings.map((reading, i) =>
            makeRow(i, {
              balanceMagnitude: reading === null ? null : minorUnits(reading.magnitude),
              balanceMarker: reading === null ? 'none' : reading.marker,
            })
          );
          const draft = makeDraft({ rows });
          const converted = convertDraft(draft, profile, { limit: null });

          const heldView: Array<number | null> = balanceReadings.map((r) =>
            r === null ? null : markerSign(r.marker) * r.magnitude
          );

          converted.rows.forEach((row, i) => {
            expect(row.balance).toBeNull();
            const prev = i > 0 ? heldView[i - 1] : null;
            const cur = heldView[i];
            const expected = cur === null || prev === null || prev === undefined ? null : cur - prev;
            expect(row.availableDelta).toBe(expected);
          });
        }
      )
    );
  });
});

describe('no-leak', () => {
  it('convertDraft never throws for any content, including every issue code and a mix of markers', () => {
    const profile = makeProfile();
    const draft = makeDraft({
      rows: [
        makeRow(0, { magnitude: null, issues: ['bad-amount', 'zero-amount', 'conflicting-markers'] }),
        makeRow(1, { marker: 'parens', balanceMagnitude: minorUnits(1), balanceMarker: 'od' }),
      ],
    });
    expect(() => convertDraft(draft, profile, { limit: null })).not.toThrow();
  });
});
