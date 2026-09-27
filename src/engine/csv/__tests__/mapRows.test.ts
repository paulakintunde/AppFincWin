import fc from 'fast-check';
import { csvToDraft, layoutSignatureOf, MAX_NAME_LENGTH, type CsvDraftOptions } from '../mapRows';
import type { ColumnMapping } from '../detectColumns';
import type { NumberNotation } from '../../money';
import * as csvBarrel from '../index';

const exponentFor = (code: string): number | null => {
  if (code === 'GBP' || code === 'EUR' || code === 'USD') return 2;
  if (code === 'JPY') return 0;
  return null;
};

const WEST: NumberNotation = { decimal: '.', group: ',', grouping: 'western' };

function baseOpts(overrides: Partial<CsvDraftOptions> = {}): CsvDraftOptions {
  return {
    mapping: {
      date: 0,
      description: 1,
      amount: 2,
      debit: null,
      credit: null,
      currency: null,
      balance: null,
      direction: null,
      limit: null,
    },
    dateFormat: 'YMD',
    notation: WEST,
    delimiter: ',',
    defaultCurrency: 'GBP',
    exponentFor,
    ...overrides,
  };
}

function mapping(overrides: Partial<ColumnMapping> = {}): ColumnMapping {
  return {
    date: 0,
    description: 1,
    amount: 2,
    debit: null,
    credit: null,
    currency: null,
    balance: null,
    direction: null,
    limit: null,
    ...overrides,
  };
}

describe('layoutSignatureOf', () => {
  it('joins normalised headers with the plan-specified separator shape', () => {
    expect(layoutSignatureOf(['Date', 'Description', 'Amount'], ',', '.')).toBe('date|description|amount||,|.');
  });

  it('strips diacritics and lower-cases each header', () => {
    expect(layoutSignatureOf(['Fecha', 'Descripción', 'Monto'], ';', ',')).toBe('fecha|descripcion|monto||;|,');
  });

  it('never exceeds 500 characters', () => {
    const longHeader = Array.from({ length: 200 }, (_, i) => `Column Number ${i}`);
    const sig = layoutSignatureOf(longHeader, ',', '.');
    expect(sig.length).toBeLessThanOrEqual(500);
  });
});

describe('csvToDraft: single signed-amount column', () => {
  it('reads a leading-minus amount', () => {
    const draft = csvToDraft(['Date', 'Description', 'Amount'], [['2026-09-01', 'Tesco', '-12.50']], baseOpts());
    expect(draft.rows).toEqual([
      {
        index: 0,
        localDate: '2026-09-01',
        description: 'Tesco',
        magnitude: 1250,
        marker: 'minus',
        rawAmount: '-12.50',
        balanceMagnitude: null,
        balanceMarker: 'none',
        rawBalance: null,
        currency: 'GBP',
        externalId: null,
        trnType: null,
        issues: [],
      },
    ]);
    expect(draft.source).toBe('csv');
    expect(draft.accountHint).toBeNull();
    expect(draft.currency).toBeNull();
  });

  it('reads a DR-suffixed amount', () => {
    const draft = csvToDraft(['Date', 'Description', 'Amount'], [['2026-09-01', 'Tesco', '12.50 DR']], baseOpts());
    expect(draft.rows[0]?.magnitude).toBe(1250);
    expect(draft.rows[0]?.marker).toBe('dr');
    expect(draft.rows[0]?.rawAmount).toBe('12.50 DR');
  });

  it('reads a parenthesised amount', () => {
    const draft = csvToDraft(['Date', 'Description', 'Amount'], [['2026-09-01', 'Tesco', '(12.50)']], baseOpts());
    expect(draft.rows[0]?.magnitude).toBe(1250);
    expect(draft.rows[0]?.marker).toBe('parens');
  });

  it('flags a zero amount', () => {
    const draft = csvToDraft(['Date', 'Description', 'Amount'], [['2026-09-01', 'Tesco', '0.00']], baseOpts());
    expect(draft.rows[0]?.magnitude).toBe(0);
    expect(draft.rows[0]?.issues).toEqual(['zero-amount']);
  });

  it('flags a too-large amount', () => {
    const draft = csvToDraft(['Date', 'Description', 'Amount'], [['2026-09-01', 'Tesco', '99999999999999.00']], baseOpts());
    expect(draft.rows[0]?.magnitude).toBeNull();
    expect(draft.rows[0]?.issues).toEqual(['amount-too-large']);
  });

  it('flags a self-conflicting amount cell', () => {
    const draft = csvToDraft(['Date', 'Description', 'Amount'], [['2026-09-01', 'Tesco', '-12.50 CR']], baseOpts());
    expect(draft.rows[0]?.magnitude).toBeNull();
    expect(draft.rows[0]?.issues).toEqual(['conflicting-markers']);
  });

  it('flags an unreadable amount as bad-amount', () => {
    const draft = csvToDraft(['Date', 'Description', 'Amount'], [['2026-09-01', 'Tesco', 'TESCO STORES 3021']], baseOpts());
    expect(draft.rows[0]?.magnitude).toBeNull();
    expect(draft.rows[0]?.issues).toEqual(['bad-amount']);
  });

  it('flags an ambiguous-separator amount as bad-amount too', () => {
    const draft = csvToDraft(['Date', 'Description', 'Amount'], [['2026-09-01', 'Tesco', '']], baseOpts());
    expect(draft.rows[0]?.issues).toEqual(['bad-amount']);
  });

  it('never lets an unmapped amount column crash -- falls back to bad-amount', () => {
    const draft = csvToDraft(
      ['Date', 'Description'],
      [['2026-09-01', 'Tesco']],
      baseOpts({ mapping: mapping({ amount: null }) })
    );
    expect(draft.rows[0]?.issues).toEqual(['bad-amount']);
  });
});

describe('csvToDraft: debit/credit columns', () => {
  const opts = baseOpts({ mapping: mapping({ amount: null, debit: 2, credit: 3 }) });
  const header = ['Date', 'Description', 'Debit', 'Credit'];

  it('reads a debit-only row as dr', () => {
    const draft = csvToDraft(header, [['2026-09-01', 'Tesco', '12.50', '']], opts);
    expect(draft.rows[0]).toMatchObject({ magnitude: 1250, marker: 'dr', rawAmount: '12.50' });
  });

  it('reads a credit-only row as cr', () => {
    const draft = csvToDraft(header, [['2026-09-01', 'Salary', '', '2000.00']], opts);
    expect(draft.rows[0]).toMatchObject({ magnitude: 200000, marker: 'cr', rawAmount: '2000.00' });
  });

  it('flags both columns empty as bad-amount, with no raw text', () => {
    const draft = csvToDraft(header, [['2026-09-01', 'Fee', '', '']], opts);
    expect(draft.rows[0]?.issues).toEqual(['bad-amount']);
    expect(draft.rows[0]?.rawAmount).toBeNull();
  });

  it('nets credit minus debit when both are filled, marker cr when >= 0', () => {
    const draft = csvToDraft(header, [['2026-09-01', 'Mixed', '20.00', '50.00']], opts);
    expect(draft.rows[0]).toMatchObject({ magnitude: 3000, marker: 'cr' });
  });

  it('nets credit minus debit when both are filled, marker dr when negative', () => {
    const draft = csvToDraft(header, [['2026-09-01', 'Mixed', '50.00', '20.00']], opts);
    expect(draft.rows[0]).toMatchObject({ magnitude: 3000, marker: 'dr' });
  });

  it('nets to exactly zero and flags zero-amount', () => {
    const draft = csvToDraft(header, [['2026-09-01', 'Wash', '20.00', '20.00']], opts);
    expect(draft.rows[0]).toMatchObject({ magnitude: 0, marker: 'cr' });
    expect(draft.rows[0]?.issues).toEqual(['zero-amount']);
  });

  it('treats the debit column as authoritative when an inner minus agrees', () => {
    const draft = csvToDraft(header, [['2026-09-01', 'Tesco', '-12.50', '']], opts);
    expect(draft.rows[0]).toMatchObject({ magnitude: 1250, marker: 'dr' });
    expect(draft.rows[0]?.issues).toEqual([]);
  });

  it('flags conflicting-markers when an inner plus contradicts the debit column', () => {
    const draft = csvToDraft(header, [['2026-09-01', 'Tesco', '+12.50', '']], opts);
    expect(draft.rows[0]?.magnitude).toBeNull();
    expect(draft.rows[0]?.issues).toEqual(['conflicting-markers']);
  });

  it('flags conflicting-markers when an inner minus contradicts the credit column', () => {
    const draft = csvToDraft(header, [['2026-09-01', 'Refund', '', '-12.50']], opts);
    expect(draft.rows[0]?.magnitude).toBeNull();
    expect(draft.rows[0]?.issues).toEqual(['conflicting-markers']);
  });

  it('surfaces an unreadable debit cell as bad-amount when both columns are filled', () => {
    const draft = csvToDraft(header, [['2026-09-01', 'Tesco', 'garbage', '50.00']], opts);
    expect(draft.rows[0]?.issues).toEqual(['bad-amount']);
  });

  it('surfaces an unreadable credit cell as bad-amount when both columns are filled and debit parses fine', () => {
    const draft = csvToDraft(header, [['2026-09-01', 'Tesco', '50.00', 'garbage']], opts);
    expect(draft.rows[0]?.issues).toEqual(['bad-amount']);
  });

  it('applies the debit-credit-columns label', () => {
    const draft = csvToDraft(header, [['2026-09-01', 'Tesco', '12.50', '']], opts);
    expect(draft.labels).toContain('debit-credit-columns');
  });
});

describe('csvToDraft: direction column', () => {
  const opts = baseOpts({ mapping: mapping({ direction: 3 }) });
  const header = ['Date', 'Description', 'Amount', 'Type'];

  it('reads DEBIT as dr on an unsigned amount, and sets trnType', () => {
    const draft = csvToDraft(header, [['2026-09-01', 'Coffee', '4.50', 'DEBIT']], opts);
    expect(draft.rows[0]).toMatchObject({ magnitude: 450, marker: 'dr', trnType: 'DEBIT' });
  });

  it('reads CREDIT as cr, and sets trnType', () => {
    const draft = csvToDraft(header, [['2026-09-01', 'Salary', '2000.00', 'CREDIT']], opts);
    expect(draft.rows[0]).toMatchObject({ magnitude: 200000, marker: 'cr', trnType: 'CREDIT' });
  });

  it('reads Sale as dr via the direction word table', () => {
    const draft = csvToDraft(header, [['2026-09-01', 'Shop', '10.00', 'Sale']], opts);
    expect(draft.rows[0]).toMatchObject({ marker: 'dr', trnType: 'DEBIT' });
  });

  it('reads Refund as cr via the direction word table', () => {
    const draft = csvToDraft(header, [['2026-09-01', 'Shop', '10.00', 'Refund']], opts);
    expect(draft.rows[0]).toMatchObject({ marker: 'cr', trnType: 'CREDIT' });
  });

  it('flags a contradicting signed amount as conflicting-markers', () => {
    const draft = csvToDraft(header, [['2026-09-01', 'Coffee', '+4.50', 'DEBIT']], opts);
    expect(draft.rows[0]?.magnitude).toBeNull();
    expect(draft.rows[0]?.issues).toEqual(['conflicting-markers']);
  });

  it('flags zero-amount on a direction-derived zero', () => {
    const draft = csvToDraft(header, [['2026-09-01', 'Nothing', '0.00', 'DEBIT']], opts);
    expect(draft.rows[0]?.issues).toEqual(['zero-amount']);
  });

  it('falls through to the plain reading when the direction cell matches no word, with no trnType', () => {
    const draft = csvToDraft(header, [['2026-09-01', 'Rent', '850.00', 'Housing']], opts);
    expect(draft.rows[0]).toMatchObject({ magnitude: 85000, marker: 'none', trnType: null });
  });

  it('surfaces a parse error even with a direction column present', () => {
    const draft = csvToDraft(header, [['2026-09-01', 'Bad', 'nonsense', 'DEBIT']], opts);
    expect(draft.rows[0]?.issues).toEqual(['bad-amount']);
  });

  it('applies the direction-column and dr-cr-markers labels', () => {
    const draft = csvToDraft(header, [['2026-09-01', 'Coffee', '4.50', 'DEBIT']], opts);
    expect(draft.labels).toEqual(expect.arrayContaining(['direction-column', 'dr-cr-markers']));
  });
});

describe('csvToDraft: balance column', () => {
  const opts = baseOpts({ mapping: mapping({ balance: 3 }) });
  const header = ['Date', 'Description', 'Amount', 'Balance'];

  it('reads an OD-marked balance', () => {
    const draft = csvToDraft(header, [['2026-09-01', 'Tesco', '-12.50', '1,234.56 OD']], opts);
    expect(draft.rows[0]).toMatchObject({ balanceMagnitude: 123456, balanceMarker: 'od', rawBalance: '1,234.56 OD' });
    expect(draft.labels).toContain('od-marker');
  });

  it('flags an unreadable balance but still imports the row', () => {
    const draft = csvToDraft(header, [['2026-09-01', 'Tesco', '-12.50', 'N/A']], opts);
    expect(draft.rows[0]?.balanceMagnitude).toBeNull();
    expect(draft.rows[0]?.issues).toEqual(expect.arrayContaining(['bad-balance']));
    expect(draft.rows.length).toBe(1);
  });

  it('leaves the balance null when the cell is blank', () => {
    const draft = csvToDraft(header, [['2026-09-01', 'Tesco', '-12.50', '']], opts);
    expect(draft.rows[0]?.balanceMagnitude).toBeNull();
    expect(draft.rows[0]?.balanceMarker).toBe('none');
    expect(draft.rows[0]?.issues).toEqual([]);
  });

  it('reads balanceLabel from an available-credit header', () => {
    const draft = csvToDraft(
      ['Date', 'Description', 'Amount', 'Available credit'],
      [['2026-09-01', 'Tesco', '-12.50', '1200.00']],
      opts
    );
    expect(draft.balanceLabel).toBe('available');
    expect(draft.labels).toContain('available-balance-label');
  });

  it('reads balanceLabel from an owed header', () => {
    const draft = csvToDraft(['Date', 'Description', 'Amount', 'Balance due'], [['2026-09-01', 'Tesco', '-12.50', '1200.00']], opts);
    expect(draft.balanceLabel).toBe('owed');
    expect(draft.labels).toContain('owed-balance-label');
  });

  it('leaves balanceLabel null when no balance column is mapped', () => {
    const draft = csvToDraft(['Date', 'Description', 'Amount'], [['2026-09-01', 'Tesco', '-12.50']], baseOpts());
    expect(draft.balanceLabel).toBeNull();
  });
});

describe('csvToDraft: limit column', () => {
  it('reads the first non-empty limit cell as statedLimit', () => {
    const draft = csvToDraft(
      ['Date', 'Description', 'Amount', 'Limit'],
      [
        ['2026-09-01', 'Tesco', '-12.50', ''],
        ['2026-09-02', 'Amazon', '-8.00', '2000.00'],
      ],
      baseOpts({ mapping: mapping({ limit: 3 }) })
    );
    expect(draft.statedLimit).toBe(200000);
    expect(draft.labels).toContain('limit-label');
  });

  it('is null when no limit cell is ever readable', () => {
    const draft = csvToDraft(
      ['Date', 'Description', 'Amount', 'Limit'],
      [['2026-09-01', 'Tesco', '-12.50', 'n/a']],
      baseOpts({ mapping: mapping({ limit: 3 }) })
    );
    expect(draft.statedLimit).toBeNull();
  });

  it('is null when there is no limit column at all', () => {
    const draft = csvToDraft(['Date', 'Description', 'Amount'], [['2026-09-01', 'Tesco', '-12.50']], baseOpts());
    expect(draft.statedLimit).toBeNull();
  });
});

describe('csvToDraft: currency', () => {
  const opts = baseOpts({ mapping: mapping({ currency: 3 }) });
  const header = ['Date', 'Description', 'Amount', 'Currency'];

  it('reads a known currency code, upper-cased', () => {
    const draft = csvToDraft(header, [['2026-09-01', 'Cafe', '-4.50', 'eur']], opts);
    expect(draft.rows[0]?.currency).toBe('EUR');
    expect(draft.rows[0]?.issues).toEqual([]);
  });

  it('falls back to the default currency and flags unknown-currency for an unrecognised code', () => {
    const draft = csvToDraft(header, [['2026-09-01', 'Cafe', '-4.50', 'ZZZ']], opts);
    expect(draft.rows[0]?.currency).toBe('GBP');
    expect(draft.rows[0]?.issues).toEqual(['unknown-currency']);
  });

  it('falls back silently to the default currency when the cell is blank', () => {
    const draft = csvToDraft(header, [['2026-09-01', 'Cafe', '-4.50', '']], opts);
    expect(draft.rows[0]?.currency).toBe('GBP');
    expect(draft.rows[0]?.issues).toEqual([]);
  });

  it('uses the default currency for every row when no currency column is mapped', () => {
    const draft = csvToDraft(['Date', 'Description', 'Amount'], [['2026-09-01', 'Cafe', '-4.50']], baseOpts());
    expect(draft.rows[0]?.currency).toBe('GBP');
  });

  it('throws a content-free RangeError when the default currency itself has no exponent', () => {
    expect(() =>
      csvToDraft(
        ['Date', 'Description', 'Amount'],
        [['2026-09-01', 'Cafe', '-4.50']],
        baseOpts({ defaultCurrency: 'ZZZ' })
      )
    ).toThrow(RangeError);
  });
});

describe('csvToDraft: dates', () => {
  it('flags an impossible calendar date as bad-date', () => {
    const draft = csvToDraft(
      ['Date', 'Description', 'Amount'],
      [['31/02/2026', 'Tesco', '-12.50']],
      baseOpts({ dateFormat: 'DMY' })
    );
    expect(draft.rows[0]?.localDate).toBeNull();
    expect(draft.rows[0]?.issues).toEqual(['bad-date']);
  });

  it('flags an empty date cell as bad-date', () => {
    const draft = csvToDraft(['Date', 'Description', 'Amount'], [['', 'Tesco', '-12.50']], baseOpts());
    expect(draft.rows[0]?.issues).toEqual(['bad-date']);
  });

  it('computes periodStart/periodEnd across rows', () => {
    const draft = csvToDraft(
      ['Date', 'Description', 'Amount'],
      [
        ['2026-09-05', 'B', '-1.00'],
        ['2026-09-01', 'A', '-2.00'],
        ['2026-09-10', 'C', '-3.00'],
      ],
      baseOpts()
    );
    expect(draft.periodStart).toBe('2026-09-01');
    expect(draft.periodEnd).toBe('2026-09-10');
  });

  it('leaves periodStart/periodEnd null when every date is unreadable', () => {
    const draft = csvToDraft(['Date', 'Description', 'Amount'], [['not-a-date', 'A', '-2.00']], baseOpts());
    expect(draft.periodStart).toBeNull();
    expect(draft.periodEnd).toBeNull();
  });
});

describe('csvToDraft: description handling', () => {
  it('collapses internal whitespace runs to one space', () => {
    const draft = csvToDraft(
      ['Date', 'Description', 'Amount'],
      [['2026-09-01', '  Tesco   Stores   3021  ', '-12.50']],
      baseOpts()
    );
    expect(draft.rows[0]?.description).toBe('Tesco Stores 3021');
  });

  it('flags an empty (whitespace-only) description', () => {
    const draft = csvToDraft(['Date', 'Description', 'Amount'], [['2026-09-01', '   ', '-12.50']], baseOpts());
    expect(draft.rows[0]?.description).toBe('');
    expect(draft.rows[0]?.issues).toEqual(expect.arrayContaining(['empty-description']));
  });

  it('truncates a description longer than MAX_NAME_LENGTH characters', () => {
    const long = 'x'.repeat(250);
    const draft = csvToDraft(['Date', 'Description', 'Amount'], [['2026-09-01', long, '-12.50']], baseOpts());
    expect(draft.rows[0]?.description.length).toBe(MAX_NAME_LENGTH);
  });

  it('truncates rawAmount longer than 64 characters', () => {
    const longRaw = `-12.50${' '.repeat(80)}DR`;
    const draft = csvToDraft(['Date', 'Description', 'Amount'], [['2026-09-01', 'Tesco', longRaw]], baseOpts());
    expect(draft.rows[0]?.rawAmount?.length).toBeLessThanOrEqual(64);
  });
});

describe('csvToDraft: summary lines', () => {
  const header = ['Date', 'Description', 'Amount', 'Balance'];
  const opts = baseOpts({ mapping: mapping({ balance: 3 }) });

  it('removes an explicit opening-balance line and captures statedOpening', () => {
    const draft = csvToDraft(
      header,
      [
        ['2026-09-01', 'Opening balance', '', '1000.00'],
        ['2026-09-02', 'Tesco', '-12.50', '987.50'],
      ],
      opts
    );
    expect(draft.rows).toHaveLength(1);
    expect(draft.rows[0]?.index).toBe(0);
    expect(draft.rows[0]?.description).toBe('Tesco');
    expect(draft.statedOpening).toEqual({ magnitude: 100000, marker: 'none', asOf: '2026-09-01', raw: '1000.00' });
    expect(draft.warnings).toContain('summary-lines-removed');
  });

  it('removes an explicit closing-balance line and captures statedClosing', () => {
    const draft = csvToDraft(
      header,
      [
        ['2026-09-01', 'Tesco', '-12.50', '987.50'],
        ['2026-09-02', 'Closing balance', '', '987.50'],
      ],
      opts
    );
    expect(draft.rows).toHaveLength(1);
    expect(draft.statedClosing).toEqual({ magnitude: 98750, marker: 'none', asOf: '2026-09-02', raw: '987.50' });
  });

  it('recognises "Balance brought forward" and "Balance carried forward"', () => {
    const draft = csvToDraft(
      header,
      [
        ['2026-09-01', 'Balance brought forward', '', '1000.00'],
        ['2026-09-02', 'Tesco', '-12.50', '987.50'],
        ['2026-09-03', 'Balance carried forward', '', '987.50'],
      ],
      opts
    );
    expect(draft.rows).toHaveLength(1);
    expect(draft.statedOpening?.magnitude).toBe(100000);
    expect(draft.statedClosing?.magnitude).toBe(98750);
  });

  it('treats a leading no-amount, has-balance row as an implicit opening line', () => {
    const draft = csvToDraft(
      header,
      [
        ['2026-09-01', 'Some balance note', '', '1000.00'],
        ['2026-09-02', 'Tesco', '-12.50', '987.50'],
        ['2026-09-03', 'Amazon', '-5.00', '982.50'],
      ],
      opts
    );
    expect(draft.rows).toHaveLength(2);
    expect(draft.statedOpening?.magnitude).toBe(100000);
    expect(draft.warnings).toContain('summary-lines-removed');
  });

  it('treats a trailing no-amount, has-balance row as an implicit closing line', () => {
    const draft = csvToDraft(
      header,
      [
        ['2026-09-01', 'Tesco', '-12.50', '987.50'],
        ['2026-09-02', 'Amazon', '-5.00', '982.50'],
        ['2026-09-03', 'Some balance note', '', '982.50'],
      ],
      opts
    );
    expect(draft.rows).toHaveLength(2);
    expect(draft.statedClosing?.magnitude).toBe(98250);
  });

  it('does not remove a no-amount/no-balance row (nothing to key on)', () => {
    const draft = csvToDraft(
      header,
      [
        ['2026-09-01', 'Mystery', '', ''],
        ['2026-09-02', 'Tesco', '-12.50', '987.50'],
      ],
      opts
    );
    expect(draft.rows).toHaveLength(2);
    expect(draft.warnings).not.toContain('summary-lines-removed');
  });

  it('leaves warnings empty and both stated balances null when there is nothing to remove', () => {
    const draft = csvToDraft(
      header,
      [
        ['2026-09-01', 'Tesco', '-12.50', '987.50'],
        ['2026-09-02', 'Amazon', '-5.00', '982.50'],
      ],
      opts
    );
    expect(draft.warnings).toEqual([]);
    expect(draft.statedOpening).toBeNull();
    expect(draft.statedClosing).toBeNull();
  });

  it('does not apply an implicit candidate as opening when a transaction row precedes it', () => {
    const draft = csvToDraft(
      header,
      [
        ['2026-09-01', 'Tesco', '-12.50', '987.50'],
        ['2026-09-02', 'Some balance note', '', '987.50'],
        ['2026-09-03', 'Amazon', '-5.00', '982.50'],
      ],
      opts
    );
    // The candidate sits in the middle -- it neither precedes every transaction
    // (the first row) nor follows every transaction (the third row), so it is
    // left in place rather than guessed as opening or closing.
    expect(draft.rows).toHaveLength(3);
  });
});

describe('csvToDraft: no-leak', () => {
  it('never lets raw cell content leak into issues or warnings', () => {
    const header = ['Date', 'Description', 'Amount', 'Balance'];
    const draft = csvToDraft(
      header,
      [['2026-09-01', 'Tesco', 'TESCO STORES 3021', 'DR JONES PHARMACY']],
      baseOpts({ mapping: mapping({ balance: 3 }) })
    );
    expect(draft.rows[0]?.issues).toEqual(expect.arrayContaining(['bad-amount', 'bad-balance']));
    const issueJson = JSON.stringify(draft.rows.map((r) => r.issues));
    const warningJson = JSON.stringify(draft.warnings);
    expect(issueJson).not.toContain('TESCO STORES 3021');
    expect(issueJson).not.toContain('DR JONES PHARMACY');
    expect(warningJson).not.toContain('TESCO STORES 3021');
    expect(warningJson).not.toContain('DR JONES PHARMACY');
    // Raw provenance fields are allowed to carry the original text (D-45).
    expect(draft.rows[0]?.rawAmount).toBe('TESCO STORES 3021');
    expect(draft.rows[0]?.rawBalance).toBe('DR JONES PHARMACY');
  });
});

// ---- round-trip property -----------------------------------------------

function decimalStringFromMinor(n: number, exponent: number): string {
  const digits = Math.abs(n).toString().padStart(exponent + 1, '0');
  if (exponent === 0) return digits;
  const cut = digits.length - exponent;
  return `${digits.slice(0, cut)}.${digits.slice(cut)}`;
}

function renderMagnitude(m: number, exponent: number, notation: NumberNotation): string {
  const decimalStr = decimalStringFromMinor(m, exponent);
  const locale = notation.grouping === 'indian' ? 'en-IN' : 'en-US';
  const formatted = new Intl.NumberFormat(locale, {
    minimumFractionDigits: exponent,
    maximumFractionDigits: exponent,
    useGrouping: true,
  }).format(decimalStr as unknown as number);
  let out = '';
  for (const ch of formatted) {
    if (ch === '.') out += notation.decimal;
    else if (ch === ',') out += notation.group;
    else out += ch;
  }
  return out;
}

const EU: NumberNotation = { decimal: ',', group: '.', grouping: 'western' };
const FR: NumberNotation = { decimal: ',', group: ' ', grouping: 'western' };
const CH: NumberNotation = { decimal: '.', group: "'", grouping: 'western' };
const IN: NumberNotation = { decimal: '.', group: ',', grouping: 'indian' };
const NOTATIONS: readonly NumberNotation[] = [WEST, EU, FR, CH, IN];

describe('csvToDraft: round-trip property', () => {
  it('recovers magnitude and minus-iff-negative marker for any notation, with or without a leading minus', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -100_000_000_000, max: 100_000_000_000 }),
        fc.constantFrom(...NOTATIONS),
        (a, notation) => {
          const magnitudeStr = renderMagnitude(Math.abs(a), 2, notation);
          const raw = a < 0 ? `-${magnitudeStr}` : magnitudeStr;
          const draft = csvToDraft(['Date', 'Description', 'Amount'], [['2026-09-01', 'Row', raw]], baseOpts({ notation }));
          const row = draft.rows[0];
          if (a === 0) {
            expect(row?.magnitude).toBe(0);
            expect(row?.issues).toEqual(['zero-amount']);
          } else {
            expect(row?.magnitude).toBe(Math.abs(a));
            expect(row?.marker).toBe(a < 0 ? 'minus' : 'none');
            expect(row?.issues).toEqual([]);
          }
        }
      ),
      { numRuns: 200 }
    );
  });
});

describe('barrel', () => {
  it('re-exports csvToDraft, layoutSignatureOf and MAX_NAME_LENGTH', () => {
    expect(typeof csvBarrel.csvToDraft).toBe('function');
    expect(typeof csvBarrel.layoutSignatureOf).toBe('function');
    expect(csvBarrel.MAX_NAME_LENGTH).toBe(200);
  });

  it('never re-exports the removed parseSignedAmount/negate surface', () => {
    expect((csvBarrel as Record<string, unknown>)['parseSignedAmount']).toBeUndefined();
    expect((csvBarrel as Record<string, unknown>)['negate']).toBeUndefined();
  });
});
