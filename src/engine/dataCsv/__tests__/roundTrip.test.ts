import fc from 'fast-check';
import { formatExportAmount } from '../amount';
import { parseDataCsv } from '../parse';

// Local copy of src/features/export/csvSerialize.ts rules (engine tests may not import src/features).
const PLAIN_NUMBER = /^-?\d+(\.\d+)?$/;
const INJECTION_LEAD = /^[=+\-@\t\r]/;
function escapeCell(value: string | number | null): string {
  let text = value === null ? '' : String(value);
  if (INJECTION_LEAD.test(text) && !(typeof value === 'number' || PLAIN_NUMBER.test(text))) text = `'${text}`;
  else if (/^'+[=+\-@\t\r]/.test(text)) text = `'${text}`; // 10-30: keep leading 's that import would strip
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
function toCsvLike(cols: readonly string[], rows: Record<string, string | number | null>[]): string {
  const lines = [cols.join(',')];
  for (const r of rows) lines.push(cols.map((c) => escapeCell(r[c] ?? null)).join(','));
  return `${lines.join('\r\n')}\r\n`;
}

// Names: non-blank, no stray CR (CRLF inside quotes is preserved, a lone CR is too, but keep generator readable).
const nameArb = fc
  .oneof(
    fc.string({ minLength: 1, maxLength: 20 }),
    fc.constantFrom('=SUM(A1)', '+1', '-x', '@a', 'a,b', 'q"q', 'l1\nl2', 'é日本', '-5', '+7.5', "'=!", "''+1", "'@a", '\tTab', "'\tx", '\rcr', "'\rcr")
  )
  // 10-review (D-8): the leading tab / CR constants are kept on purpose; they exercise the guard.
  .filter((s) => s.trim() !== '' && (s === s.trim() || /^'?[\t\r]/.test(s)) && !/[\u0000-\u0008]/.test(s) && !/\r(?!cr)/.test(s));

describe('export then import is exact', () => {
  it('goals: names and negative amounts survive (10-review-2 D-1: normal amounts plus the marker)', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ name: nameArb, target: fc.integer({ min: -1_000_000, max: 1_000_000 }) }), { minLength: 1, maxLength: 8 }),
        (rows) => {
          const csv = toCsvLike(['name', 'currency', 'target', 'amount_format'], rows.map((r) => ({ ...r, currency: 'USD', target: formatExportAmount(r.target, 2), amount_format: 'decimal' })));
          const res = parseDataCsv('savings_goals', csv);
          if (!res.ok) return false;
          return (
            res.rows.length === rows.length &&
            res.rows.every((row, i) => row.values.name === rows[i]!.name && row.money.target === rows[i]!.target && row.issues.length === 0)
          );
        }
      )
    );
  });
});
