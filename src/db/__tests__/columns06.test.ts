// 06-08: the client write-key lists must equal the SQL grants in the Grow migration (T-06-08-01), and the select
// strings must carry every new Grow column. A key the SQL never granted (or a grant with no key) fails.

import * as fs from 'fs';
import * as path from 'path';
import { ACCOUNT_INSERT_KEYS, ACCOUNT_PATCH_KEYS, ACCOUNT_COLUMNS } from '../accounts';
import { DEBT_COLUMNS, DEBT_INSERT_KEYS, DEBT_PATCH_KEYS } from '../debts';
import { HOLDING_INSERT_KEYS, HOLDING_PATCH_KEYS } from '../holdings';
import { HOLDING_LOT_INSERT_KEYS, HOLDING_LOT_PATCH_KEYS } from '../holdingLots';
import { RECURRING_SERIES_COLUMNS } from '../rows';
import { TRANSACTION_COLUMNS, TRANSACTION_INSERT_KEYS, TRANSACTION_PATCH_KEYS } from '../transactions';
import { SAVINGS_GOAL_COLUMNS, SAVINGS_GOAL_INSERT_KEYS, SAVINGS_GOAL_PATCH_KEYS } from '../savingsGoals';

const MIGRATION = path.resolve(__dirname, '../../../supabase/migrations/20261106000100_grow_schema.sql');
const sql = fs.readFileSync(MIGRATION, 'utf8').replace(/--[^\n]*/g, '');

function grants(verb: 'insert' | 'update'): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const re = new RegExp(`grant\\s+${verb}\\s*\\(([^)]+)\\)\\s+on\\s+public\\.(\\w+)`, 'gi');
  for (const m of sql.matchAll(re)) {
    const [, cols = '', table = ''] = m;
    (out[table] ??= []).push(...cols.split(',').map((c) => c.trim()));
  }
  return out;
}

const inserts = grants('insert');
const updates = grants('update');
const sorted = (keys: readonly string[]) => [...keys].sort();

describe('06 key lists mirror the Grow migration grants', () => {
  it('reads grants from the migration', () => {
    expect(inserts['holdings']).toBeDefined();
    expect(updates['holding_lots']).toBeDefined();
  });

  it.each([
    ['savings_goals', SAVINGS_GOAL_INSERT_KEYS, SAVINGS_GOAL_PATCH_KEYS],
    ['holdings', HOLDING_INSERT_KEYS, HOLDING_PATCH_KEYS],
    ['holding_lots', HOLDING_LOT_INSERT_KEYS, HOLDING_LOT_PATCH_KEYS],
  ] as [string, readonly string[], readonly string[]][])('%s insert and patch keys equal the grants', (table, insertKeys, patchKeys) => {
    expect(sorted(insertKeys)).toEqual(sorted(inserts[table] ?? []));
    expect(sorted(patchKeys)).toEqual(sorted(updates[table] ?? []));
  });

  it('accounts and debts carry every column the migration grants', () => {
    for (const c of inserts['accounts'] ?? []) expect(ACCOUNT_INSERT_KEYS).toContain(c);
    for (const c of updates['accounts'] ?? []) expect(ACCOUNT_PATCH_KEYS).toContain(c);
    for (const c of inserts['debts'] ?? []) expect(DEBT_INSERT_KEYS).toContain(c);
    for (const c of updates['debts'] ?? []) expect(DEBT_PATCH_KEYS).toContain(c);
  });

  it('debts never list the server-written payoff columns as write keys', () => {
    for (const keys of [DEBT_INSERT_KEYS, DEBT_PATCH_KEYS] as readonly (readonly string[])[]) {
      expect(keys).not.toContain('payoff_extra');
      expect(keys).not.toContain('extra_series_id');
    }
  });
});

describe('06 select strings carry the Grow columns', () => {
  it('savings_goals', () => {
    for (const c of ['is_safety_net', 'locked', 'protect', 'up_front_only', 'icon', 'net_confirmed_at']) {
      expect(SAVINGS_GOAL_COLUMNS).toContain(c);
    }
  });

  it('debts', () => {
    for (const c of ['started_balance', 'payoff_order', 'payoff_extra', 'extra_series_id']) expect(DEBT_COLUMNS).toContain(c);
  });

  it('accounts', () => {
    expect(ACCOUNT_COLUMNS).toContain('interest_rate');
  });

  it('recurring_series is read-only here', () => {
    expect(RECURRING_SERIES_COLUMNS).toContain('goal_id');
  });

  it('transactions select debt_id (06-30, D-33) but never write it (only record_debt_one_off sets it)', () => {
    expect(TRANSACTION_COLUMNS.split(',').map((c) => c.trim())).toContain('debt_id');
    expect(TRANSACTION_INSERT_KEYS as readonly string[]).not.toContain('debt_id');
    expect(TRANSACTION_PATCH_KEYS as readonly string[]).not.toContain('debt_id');
  });
});
