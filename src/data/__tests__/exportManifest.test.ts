import fs from 'fs';
import path from 'path';

import { DECIDE_ANSWER_COLUMNS } from '@/db/decideAnswers';
import { DECIDE_SETTINGS_COLUMNS } from '@/db/decideSettings';
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
      recurring_series: ['counts_as', 'income_kind', 'saving_mode', 'pay_group'],
      debts: ['pays_in_full'],
      accounts: ['use', 'use_purpose', 'use_envelope_id', 'use_extra_set_aside'],
      savings_goals: ['bucket', 'account_id', 'color_key'],
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

  it('excludes profiles.decide_v3 (an access switch, not user data)', () => {
    expect(EXPORT_MANIFEST.profiles).not.toContain('decide_v3');
  });

  it('never lists internal version columns', () => {
    for (const cols of Object.values(EXPORT_MANIFEST)) expect(cols).not.toContain('version');
  });
});
