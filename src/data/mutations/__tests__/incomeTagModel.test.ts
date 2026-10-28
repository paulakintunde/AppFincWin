import { normaliseDescription } from '@/engine/categorize';
import type { TransactionRow } from '@/db/rows';
import { earlierUntagged, payerKeyOf } from '../incomeTagModel';

const tx = (id: string, o: Partial<TransactionRow> = {}): TransactionRow =>
  ({
    id,
    name: 'Acme Ltd',
    original_amount: 5000,
    deleted_at: null,
    transfer_id: null,
    income_kind: null,
    ...o,
  }) as TransactionRow;

describe('payerKeyOf', () => {
  it('is the normalised name', () => {
    expect(payerKeyOf('ACME LTD PAYROLL 1234')).toBe(normaliseDescription('ACME LTD PAYROLL 1234'));
  });
  it('is at most 60 characters and never ends in a space', () => {
    const key = payerKeyOf('a'.repeat(59) + ' ' + 'b'.repeat(20));
    expect(key).toBe('a'.repeat(59));
    expect(payerKeyOf('x'.repeat(100))!.length).toBe(60);
  });
  it('is null for null, empty or blank', () => {
    expect(payerKeyOf(null)).toBeNull();
    expect(payerKeyOf('')).toBeNull();
    expect(payerKeyOf('   ')).toBeNull();
  });
});

describe('earlierUntagged', () => {
  const key = payerKeyOf('Acme Ltd')!;
  it('keeps same-payer untagged live money in', () => {
    const rows = [tx('a'), tx('b', { name: 'ACME  ltd' })];
    expect(earlierUntagged(rows, key, 'none').map((r) => r.id)).toEqual(['a', 'b']);
  });
  it('excludes the row itself, tagged rows, outflows, transfers, deleted rows and other payers', () => {
    const rows = [
      tx('self'),
      tx('tagged', { income_kind: 'salary' }),
      tx('out', { original_amount: -5000 }),
      tx('xfer', { transfer_id: 't1' }),
      tx('gone', { deleted_at: '2026-01-01T00:00:00Z' }),
      tx('other', { name: 'Someone else' }),
      tx('noname', { name: null }),
      tx('ok'),
    ];
    expect(earlierUntagged(rows, key, 'self').map((r) => r.id)).toEqual(['ok']);
  });
  it('treats a missing income_kind as untagged', () => {
    const row = tx('u');
    delete (row as { income_kind?: unknown }).income_kind;
    expect(earlierUntagged([row], key, 'x')).toHaveLength(1);
  });
});
