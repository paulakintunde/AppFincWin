// 10.1-14 (D-14, D-15): the SQL share maths (hh_item_shares in 20261127000400) gives the same cents as itemShares.
// pgTAP 135 writes each case as a '-- case:' JSON line; this test runs the engine on the same case.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { itemShares, type ItemSharesInput } from '../itemShares';

interface ParityCase extends ItemSharesInput { expected: Record<string, number> }

const sql = readFileSync(resolve(__dirname, '../../../../supabase/tests/database/135_split_by_item.test.sql'), 'utf8');
const cases: ParityCase[] = [...sql.matchAll(/^-- case: (.*)$/gm)].map((m) => JSON.parse(m[1] as string) as ParityCase);

describe('10.1-14 itemShares matches the SQL mirror', () => {
  it('finds the six cases in pgTAP 135', () => {
    expect(cases).toHaveLength(6);
  });
  it.each(cases.map((c, k) => [k + 1, c] as const))('case %i gives the same totals', (_n, c) => {
    const r = itemShares(c);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const got = Object.fromEntries(r.shares.map((s) => [s.memberId, s.total]));
    const want = Object.fromEntries(c.members.map((m) => [m, c.expected[m] ?? 0]));
    expect(got).toEqual(want);
  });
});
