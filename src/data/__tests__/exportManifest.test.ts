import fs from 'fs';
import path from 'path';

import { DECIDE_ANSWER_COLUMNS } from '@/db/decideAnswers';
import { DECIDE_SETTINGS_COLUMNS } from '@/db/decideSettings';
import { HOLDING_LOT_COLUMNS } from '@/db/holdingLots';
import { HOLDING_COLUMNS } from '@/db/holdings';
import { PAYER_PROMPT_COLUMNS } from '@/db/incomePayerPrompts';
import { DISMISSAL_COLUMNS } from '@/db/recurringDismissals';
import { EXPORT_MANIFEST, NOT_USER_DATA } from '../exportManifest';

const DB_DIR = path.resolve(__dirname, '../../db');

function tablesReadByDb(): string[] {
  const found = new Set<string>();
  for (const file of fs.readdirSync(DB_DIR).filter((f) => f.endsWith('.ts'))) {
    const text = fs.readFileSync(path.join(DB_DIR, file), 'utf8');
    for (const m of text.matchAll(/\.from\('([a-z_]+)'\)/g)) found.add(m[1] ?? '');
  }
  return [...found].sort();
}

const split = (cols: string): string[] => cols.split(',').map((c) => c.trim().split(':')[0] ?? '');

describe('export manifest (05.2 owner OQ3, C13)', () => {
  it('the scan finds the db tables', () => {
    expect(tablesReadByDb().length).toBeGreaterThan(15);
  });

  it('every table src/db reads is in the manifest or marked not user data', () => {
    const covered = new Set([...Object.keys(EXPORT_MANIFEST), ...NOT_USER_DATA]);
    const missing = tablesReadByDb().filter((t) => !covered.has(t));
    expect(missing).toEqual([]);
  });

  it('lists the 05.2 tables and columns explicitly', () => {
    for (const t of ['decide_answers', 'recurring_dismissals', 'income_payer_prompts']) {
      expect(Object.keys(EXPORT_MANIFEST)).toContain(t);
    }
    const expected: Record<string, string[]> = {
      transactions: ['income_kind', 'counts_as', 'refund_of'],
      recurring_series: ['counts_as', 'income_kind', 'saving_mode', 'pay_group', 'end_reason'],
      debts: ['pays_in_full', 'paid_off_on'],
      accounts: ['use', 'use_purpose', 'use_envelope_id', 'use_extra_set_aside'],
      savings_goals: ['bucket', 'account_id', 'color_key'],
      // 06
      holdings: ['name', 'type', 'value', 'value_as_of', 'opening_put_in', 'monthly_amount', 'rate'],
      holding_lots: ['holding_id', 'kind', 'amount', 'units', 'local_date', 'note'],
      decide_settings: split(DECIDE_SETTINGS_COLUMNS),
    };
    for (const [table, cols] of Object.entries(expected)) {
      for (const c of cols.filter((x) => x !== 'version')) expect(EXPORT_MANIFEST[table]).toContain(c);
    }
  });

  it('the new tables carry every column the db modules select (bar version)', () => {
    const pairs: [string, string][] = [
      ['decide_answers', DECIDE_ANSWER_COLUMNS],
      ['recurring_dismissals', DISMISSAL_COLUMNS],
      ['income_payer_prompts', PAYER_PROMPT_COLUMNS],
    ];
    for (const [table, cols] of pairs) {
      for (const c of split(cols).filter((x) => x !== 'version')) expect(EXPORT_MANIFEST[table]).toContain(c);
    }
  });

  it('06: holdings, entries and the new goal, debt, account and series columns are exported', () => {
    const expected: Record<string, string[]> = {
      savings_goals: ['is_safety_net', 'locked', 'protect', 'up_front_only', 'icon', 'net_confirmed_at'],
      debts: ['started_balance', 'payoff_order', 'payoff_extra', 'extra_series_id'],
      accounts: ['interest_rate'],
      recurring_series: ['goal_id'],
      transactions: ['debt_id'],
      holdings: split(HOLDING_COLUMNS),
      holding_lots: split(HOLDING_LOT_COLUMNS),
    };
    const internal = ['version', 'updated_by', 'is_sample'];
    for (const [table, cols] of Object.entries(expected)) {
      for (const c of cols.filter((x) => !internal.includes(x))) expect(EXPORT_MANIFEST[table]).toContain(c);
    }
  });

  it('261123 (DD-03): a debt exports its credit limit and whether it revolves', () => {
    expect(EXPORT_MANIFEST.debts).toEqual(expect.arrayContaining(['credit_limit', 'revolving', 'start_date']));
  });

  it('05.3 D-16: decide_checks exports answer_v3', () => {
    expect(EXPORT_MANIFEST.decide_checks).toContain('answer_v3');
  });

  // 08-15: sharing and settling data is exported (CMP-F18); settlement_nudges is server-only and never is.
  it('exports the sharing and settling tables and columns, and never settlement_nudges', () => {
    for (const t of [
      'transaction_splits', 'transaction_member_categories', 'household_split_defaults', 'settlements', 'settlement_lines',
      'household_former_members', 'member_departures',
    ]) {
      expect(Object.keys(EXPORT_MANIFEST)).toContain(t);
    }
    expect(Object.keys(EXPORT_MANIFEST)).not.toContain('settlement_nudges');
    for (const c of ['is_settlement', 'settlement_id', 'split_manual', 'copied_from', 'copy_share', 'paid_by_former_key', 'household_amount']) {
      expect(EXPORT_MANIFEST.transactions).toContain(c);
    }
    expect(EXPORT_MANIFEST.member_departures).not.toContain('prior');
    expect(EXPORT_MANIFEST.household_invites).not.toContain('code');
  });

  it('excludes profiles.decide_v3 (an access switch, not user data)', () => {
    expect(EXPORT_MANIFEST.profiles).not.toContain('decide_v3');
  });

  it('never lists internal version columns', () => {
    for (const cols of Object.values(EXPORT_MANIFEST)) expect(cols).not.toContain('version');
  });

  // 08-07 (CMP-F18, T-08-24): the SC7 two-user privacy suite names every exported table between two marker comments.
  it('every exported table is covered by the two-user privacy test', () => {
    const file = path.resolve(__dirname, '../../../supabase/tests/database/101_household_privacy_two_user.test.sql');
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    const start = lines.findIndex((l) => l.trim() === '-- export-tables:');
    const end = lines.findIndex((l) => l.trim() === '-- end-export-tables');
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const listed = new Set(
      lines
        .slice(start + 1, end)
        .map((l) => l.replace(/^--\s*/, '').replace(/\s*\(\d+\)\s*$/, '').trim())
        .filter((l) => l.length > 0),
    );
    const missing = Object.keys(EXPORT_MANIFEST).filter((t) => !listed.has(t));
    expect(missing).toEqual([]);
  });
});
