// 10-review-2 (D-1, owner 2026-11-28): Export writes normal amounts plus the marker; Import reads them back exactly.
import fc from 'fast-check';
import { exponentWith } from '../amount';
import { exportColumns, isDataTable, toExportRow } from '../exportRow';
import { parseDataCsv } from '../parse';
import { DATA_CSV_SCHEMAS, type DataTable } from '../schemas';

const exp = exponentWith([{ code: 'GLD1', decimals: 4 }]);

describe('toExportRow', () => {
  it('writes each money column in the row currency decimals and adds the marker', () => {
    expect(toExportRow('accounts', { name: 'A', currency: 'USD', opening_balance: 2500, overdraft_limit: '-150', credit_limit: null }, exp)).toEqual({
      name: 'A', currency: 'USD', opening_balance: '25.00', overdraft_limit: '-1.50', credit_limit: null, amount_format: 'decimal',
    });
    expect(toExportRow('debts', { currency: 'JPY', balance: 2500 }, exp)).toMatchObject({ balance: '2500' });
    expect(toExportRow('holdings', { currency: 'KWD', value: 1250 }, exp)).toMatchObject({ value: '1.250' });
    expect(toExportRow('savings_goals', { currency: 'GLD1', target: 5 }, exp)).toMatchObject({ target: '0.0005' });
  });
  it('leaves anything that is not a whole minor-unit number alone', () => {
    expect(toExportRow('holdings', { currency: 7, value: '1.5', opening_put_in: 'x', monthly_amount: 1e20 }, exp)).toMatchObject({
      value: '1.5', opening_put_in: 'x', monthly_amount: 1e20,
    });
  });
  it('exportColumns puts the marker last; isDataTable knows the four tables', () => {
    expect(exportColumns(['a', 'b'])).toEqual(['a', 'b', 'amount_format']);
    expect(isDataTable('debts')).toBe(true);
    expect(isDataTable('transactions')).toBe(false);
    expect(isDataTable('toString')).toBe(false);
  });
});

describe('export then import is identity (fast-check)', () => {
  const currencies = ['USD', 'JPY', 'KWD', 'CLF', 'GLD1'];
  it('every exponent, negatives included', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            currency: fc.constantFrom(...currencies),
            target: fc.integer({ min: -10_000_000_000_000, max: 10_000_000_000_000 }),
            monthly_amount: fc.integer({ min: 0, max: 10_000_000 }),
          }),
          { minLength: 1, maxLength: 6 },
        ),
        (rows) => {
          const cols = exportColumns(['name', 'currency', 'target', 'monthly_amount']);
          const lines = [cols.join(',')];
          for (const r of rows) {
            const out = toExportRow('savings_goals', { name: 'G', ...r }, exp);
            lines.push(cols.map((c) => String(out[c])).join(','));
          }
          const res = parseDataCsv('savings_goals', `${lines.join('\r\n')}\r\n`, { exponentOf: exp });
          if (!res.ok || res.unitReason !== 'marker') return false;
          return res.rows.every(
            (row, i) => row.issues.length === 0 && row.money.target === rows[i]!.target && row.money.monthly_amount === rows[i]!.monthly_amount,
          );
        },
      ),
    );
  });
  it('every schema money column is converted', () => {
    for (const t of Object.keys(DATA_CSV_SCHEMAS) as DataTable[]) {
      const row: Record<string, unknown> = { currency: 'USD' };
      for (const c of DATA_CSV_SCHEMAS[t].money) row[c] = 100;
      const out = toExportRow(t, row, exp);
      for (const c of DATA_CSV_SCHEMAS[t].money) expect(out[c]).toBe('1.00');
    }
  });
});
