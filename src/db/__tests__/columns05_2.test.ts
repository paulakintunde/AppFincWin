// 05.2-10: the client write-key lists must equal the SQL `grant update (...)` columns, table by table.
// Reads every migration, so earlier grants count; a key the SQL never granted (or a grant with no key) fails.

import * as fs from 'fs';
import * as path from 'path';
import { ACCOUNT_PATCH_KEYS } from '../accounts';
import { DEBT_PATCH_KEYS } from '../debts';
import { DECIDE_SETTINGS_PATCH_KEYS } from '../decideSettings';
import { RECURRING_SERIES_COLUMNS } from '../rows';
import { SAVINGS_GOAL_PATCH_KEYS } from '../savingsGoals';
import { TRANSACTION_COLUMNS, TRANSACTION_PATCH_KEYS } from '../transactions';

const MIGRATIONS = path.resolve(__dirname, '../../../supabase/migrations');

function grantedUpdateColumns(): Record<string, Set<string>> {
  const out: Record<string, Set<string>> = {};
  const re = /grant\s+update\s*\(([^)]+)\)\s+on\s+public\.(\w+)/gi;
  for (const file of fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql'))) {
    const sql = fs.readFileSync(path.join(MIGRATIONS, file), 'utf8').replace(/--[^\n]*/g, '');
    for (const m of sql.matchAll(re)) {
      const [, cols = '', table = ''] = m;
      const set = (out[table] ??= new Set<string>());
      for (const col of cols.split(',')) set.add(col.trim());
    }
  }
  return out;
}

const granted = grantedUpdateColumns();

describe('patch keys mirror the SQL update grants', () => {
  // user_id is granted on decide_settings only so ON CONFLICT DO UPDATE works (20261021000100); the client
  // builds its payload with user_id separately and never lists it as a patch key.
  const cases: [string, readonly string[], string[]][] = [
    ['decide_settings', DECIDE_SETTINGS_PATCH_KEYS, ['user_id']],
    ['accounts', ACCOUNT_PATCH_KEYS, []],
    ['debts', DEBT_PATCH_KEYS, []],
    ['savings_goals', SAVINGS_GOAL_PATCH_KEYS, []],
    ['transactions', TRANSACTION_PATCH_KEYS, []],
  ];

  it.each(cases)('%s', (table, keys, serverOnlyGranted) => {
    const sql = [...(granted[table] ?? [])].filter((c) => !serverOnlyGranted.includes(c)).sort();
    expect([...keys].sort()).toEqual(sql);
  });

  it('decide_settings never lists id as a patch key', () => {
    expect(DECIDE_SETTINGS_PATCH_KEYS).not.toContain('id');
  });
});

describe('select strings carry the 05.2 columns', () => {
  it('transactions', () => {
    for (const c of ['income_kind', 'counts_as', 'refund_of']) expect(TRANSACTION_COLUMNS).toContain(c);
  });

  it('recurring_series is read-only here', () => {
    for (const c of ['counts_as', 'income_kind', 'saving_mode', 'pay_group']) expect(RECURRING_SERIES_COLUMNS).toContain(c);
  });
});
