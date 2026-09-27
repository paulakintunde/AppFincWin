import { balanceLabelOf, detectColumns, validateMapping, type ColumnMapping } from '../detectColumns';
import * as csvBarrel from '../index';

function baseMapping(overrides: Partial<ColumnMapping> = {}): ColumnMapping {
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

describe('detectColumns', () => {
  it('detects a simple signed-amount header with high confidence', () => {
    const { mapping, confidence } = detectColumns(['Date', 'Description', 'Amount'], [
      ['2026-09-01', 'Tesco', '-12.50'],
    ]);
    expect(mapping).toEqual({
      date: 0,
      description: 1,
      amount: 2,
      debit: null,
      credit: null,
      currency: null,
      balance: null,
      direction: null,
      limit: null,
    });
    expect(confidence).toBe('high');
  });

  it('detects separate debit/credit columns and a balance column, leaving amount null', () => {
    const { mapping, confidence } = detectColumns(
      ['Transaction Date', 'Details', 'Paid out', 'Paid in', 'Balance'],
      [
        ['2026-09-01', 'Tesco', '12.50', '', '987.65'],
        ['2026-09-02', 'Salary', '', '2000.00', '2987.65'],
      ]
    );
    expect(mapping.date).toBe(0);
    expect(mapping.description).toBe(1);
    expect(mapping.debit).toBe(2);
    expect(mapping.credit).toBe(3);
    expect(mapping.balance).toBe(4);
    expect(mapping.amount).toBeNull();
    expect(confidence).toBe('high');
  });

  it('detects a Dutch header (Datum/Omschrijving/Bedrag/Valuta/Saldo)', () => {
    const { mapping } = detectColumns(['Datum', 'Omschrijving', 'Bedrag', 'Valuta', 'Saldo'], [
      ['2026-09-01', 'Albert Heijn', '-12,50', 'EUR', '987,65'],
    ]);
    expect(mapping.date).toBe(0);
    expect(mapping.description).toBe(1);
    expect(mapping.amount).toBe(2);
    expect(mapping.currency).toBe(3);
    expect(mapping.balance).toBe(4);
  });

  it('detects a Type column as direction only when its values are direction words', () => {
    const { mapping } = detectColumns(
      ['Date', 'Description', 'Amount', 'Type'],
      [
        ['2026-09-01', 'Coffee', '4.50', 'DEBIT'],
        ['2026-09-02', 'Salary', '2000.00', 'CREDIT'],
        ['2026-09-03', 'Groceries', '32.10', 'DEBIT'],
      ]
    );
    expect(mapping.direction).toBe(3);
    expect(mapping.amount).toBe(2);
  });

  it('does not accept a Type-headed column as direction when its content is not direction words', () => {
    const { mapping } = detectColumns(
      ['Date', 'Description', 'Amount', 'Type'],
      [
        ['2026-09-01', 'Coffee', '4.50', 'Groceries'],
        ['2026-09-02', 'Salary', '2000.00', 'Income'],
        ['2026-09-03', 'Rent', '850.00', 'Housing'],
      ]
    );
    expect(mapping.direction).toBeNull();
  });

  it('detects balance and limit columns on a card statement, never mistaking them for credit', () => {
    const { mapping } = detectColumns(
      ['Date', 'Merchant', 'Amount', 'Available credit', 'Credit limit'],
      [
        ['2026-09-01', 'Tesco', '-45.20', '1200.00', '2000.00'],
        ['2026-09-02', 'Amazon', '-15.00', '1185.00', '2000.00'],
      ]
    );
    expect(mapping.balance).toBe(3);
    expect(mapping.limit).toBe(4);
    expect(mapping.credit).toBeNull();
    expect(mapping.date).toBe(0);
    expect(mapping.description).toBe(1);
    expect(mapping.amount).toBe(2);
  });

  it('falls back to content sniffing with low confidence when headers carry no signal', () => {
    const { mapping, confidence } = detectColumns(['col1', 'col2', 'col3'], [
      ['2026-09-01', 'Tesco', '-12.50'],
    ]);
    expect(mapping.date).toBe(0);
    expect(mapping.description).toBe(1);
    expect(mapping.amount).toBe(2);
    expect(confidence).toBe('low');
  });

  it('never lets a header match consume the same column for two roles', () => {
    const { mapping } = detectColumns(['Date', 'Description', 'Amount', 'Balance'], [
      ['2026-09-01', 'Tesco', '-12.50', '987.65'],
    ]);
    const used = [mapping.date, mapping.description, mapping.amount, mapping.balance].filter(
      (i): i is number => i !== null
    );
    expect(new Set(used).size).toBe(used.length);
  });
});

describe('balanceLabelOf', () => {
  it.each<[string, 'held' | 'owed' | 'available' | null]>([
    ['Available credit', 'available'],
    ['Balance due', 'owed'],
    ['Statement balance', 'owed'],
    ['Balance', null],
    ['Saldo', null],
  ])('%s -> %s', (header, expected) => {
    expect(balanceLabelOf(header)).toBe(expected);
  });

  it('never infers "held" from a header, even for an explicit "held" word', () => {
    expect(balanceLabelOf('Held balance')).not.toBe('held');
  });
});

describe('validateMapping', () => {
  it('returns no errors for a valid, non-duplicated mapping', () => {
    expect(validateMapping(baseMapping())).toEqual([]);
  });

  it('flags a missing date', () => {
    expect(validateMapping(baseMapping({ date: null }))).toEqual(['no-date']);
  });

  it('flags a missing description', () => {
    expect(validateMapping(baseMapping({ description: null }))).toEqual(['no-description']);
  });

  it('flags amount and debit both set', () => {
    expect(validateMapping(baseMapping({ debit: 3 }))).toEqual(['amount-and-debit-credit']);
  });

  it('accepts debit without credit as valid', () => {
    expect(validateMapping(baseMapping({ amount: null, debit: 3 }))).toEqual([]);
  });

  it('flags a direction column with no amount and no debit/credit', () => {
    expect(validateMapping(baseMapping({ amount: null, direction: 3 }))).toEqual(['no-amount']);
  });

  it('flags the same column index used twice', () => {
    expect(validateMapping(baseMapping({ description: 0 }))).toEqual(['duplicate-column']);
  });

  it('flags neither amount nor debit/credit present', () => {
    expect(validateMapping(baseMapping({ amount: null }))).toEqual(['no-amount']);
  });

  it('returns every applicable error in type-declared order', () => {
    const mapping: ColumnMapping = {
      date: null,
      description: null,
      amount: null,
      debit: null,
      credit: null,
      currency: null,
      balance: null,
      direction: null,
      limit: null,
    };
    expect(validateMapping(mapping)).toEqual(['no-date', 'no-description', 'no-amount']);
  });
});

describe('barrel', () => {
  it('re-exports detectColumns, validateMapping and balanceLabelOf', () => {
    expect(typeof csvBarrel.detectColumns).toBe('function');
    expect(typeof csvBarrel.validateMapping).toBe('function');
    expect(typeof csvBarrel.balanceLabelOf).toBe('function');
  });
});
