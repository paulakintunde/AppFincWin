import { QueryClient } from '@tanstack/react-query';
import { buildDiagnostic, rowCountsFromCache, type DiagnosticDeps } from '../buildDiagnostic';
import { DIAGNOSTIC_FIELDS, DIAGNOSTIC_ROWS } from '../diagnosticFields';

const base: DiagnosticDeps = {
  appVersion: '1.4.0',
  buildNumber: '212',
  os: 'ios 18.1',
  deviceModel: 'iPhone XR',
  locale: 'en-US',
  region: 'US',
  featureLevel: 3,
  planState: 'active',
  queueSize: 2,
  queueOldestAgeMinutes: 14,
  failedWrites: 1,
  lastSyncedAt: Date.UTC(2026, 10, 22, 9, 30),
  onlineNow: true,
  recentErrorCodes: ['conflict', 'rejected'],
  rowCounts: { transactions: 12, accounts: 3 },
};

describe('buildDiagnostic (DAT-06)', () => {
  it('only allow-listed keys, and text is the same fields one per line', () => {
    const d = buildDiagnostic(base);
    expect(Object.keys(d.fields).every((k) => (DIAGNOSTIC_FIELDS as readonly string[]).includes(k))).toBe(true);
    expect(d.text.split('\n')).toEqual(DIAGNOSTIC_FIELDS.map((k) => `${k}: ${d.fields[k]}`));
    expect(d.fields.rowCounts).toBe('accounts=3, transactions=12');
    expect(d.fields.lastSyncedAt).toBe('2026-11-22T09:30:00.000Z');
  });

  it('every field has exactly one row in What is in it', () => {
    const rowFields = DIAGNOSTIC_ROWS.flatMap((r) => r.fields);
    expect([...rowFields].sort()).toEqual([...DIAGNOSTIC_FIELDS].sort());
  });

  it('caps error codes at 20 and drops anything that is not a code', () => {
    const many = Array.from({ length: 30 }, (_, i) => `E${i}`);
    const d = buildDiagnostic({ ...base, recentErrorCodes: [...many, 'has spaces and a note', 'Coffee at Joe 42.50'] });
    expect(d.fields.recentErrorCodes!.split(', ')).toHaveLength(20);
    expect(d.text).not.toContain('Coffee');
  });

  it('rowCounts carries only integers per table name', () => {
    const d = buildDiagnostic({ ...base, rowCounts: { transactions: 3, 'Bad Name': 4, accounts: 1.5, notes: -1 } });
    expect(d.fields.rowCounts).toBe('transactions=3');
  });

  it('sentinel: nothing from a cached record reaches the text', () => {
    const qc = new QueryClient();
    qc.setQueryData(['transactions', 'h1', '2026-10'], [{ id: 't1', note: 'SENTINEL-DIAG-91', payee: 'SENTINEL-DIAG-91', amount: 123456 }]);
    qc.setQueryData(['accounts', 'h1'], [{ id: 'a1', name: 'SENTINEL-DIAG-91' }]);
    const counts = rowCountsFromCache(qc);
    expect(counts).toEqual({ transactions: 1, accounts: 1 });
    const d = buildDiagnostic({ ...base, rowCounts: counts });
    expect(d.text).not.toContain('SENTINEL-DIAG-91');
    expect(d.text).not.toContain('123456');
  });
});
