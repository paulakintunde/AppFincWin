import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ISO_CURRENCIES } from '@/engine/money';
import { POPULAR_CURRENCY_GROUPS } from '../popularCurrencies';

function activeServerCodes(): Set<string> {
  const sql = readFileSync(
    join(__dirname, '../../../../supabase/migrations/20260924000100_custom_currencies.sql'),
    'utf8'
  );
  const start = sql.indexOf('-- active (ISO 4217, 2025)');
  const end = sql.indexOf('-- withdrawn,');
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return new Set((sql.slice(start, end).match(/'[A-Z]{3}'/g) ?? []).map((s) => s.slice(1, 4)));
}

describe('built-in ISO currency list parity', () => {
  it('only offers codes in the active ISO 4217 block the server accepts', () => {
    const active = activeServerCodes();
    expect(active.size).toBeGreaterThan(100);
    for (const entry of ISO_CURRENCIES) expect(active.has(entry.code)).toBe(true);
  });

  it('contains every Popular code', () => {
    const codes = new Set(ISO_CURRENCIES.map((c) => c.code));
    for (const group of POPULAR_CURRENCY_GROUPS) {
      for (const code of group.codes) expect(codes.has(code)).toBe(true);
    }
  });
});
