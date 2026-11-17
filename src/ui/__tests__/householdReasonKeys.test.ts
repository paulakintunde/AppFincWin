// 08-15: no household refusal shows a blank or a raw code. Every reason a 20261122 migration can answer maps to a copy key
// that exists in en, and the copy for the settle_departed notice is there.
import fs from 'fs';
import path from 'path';
import en from '@/i18n/locales/en';
import { failedReasonKey, HOUSEHOLD_REASON_KEYS, householdReasonKey, householdReasonKeyOrGeneric } from '../failedWriteLabels';

const MIGRATIONS = path.resolve(__dirname, '../../../supabase/migrations');

function lookup(key: string): unknown {
  return key.split('.').reduce<unknown>((node, part) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined), en);
}

/** Every reason code the household migrations can answer: jsonb refusals and HH001 split errors raised by message. */
function serverReasons(): Set<string> {
  const found = new Set<string>();
  const files = fs.readdirSync(MIGRATIONS).filter((f) => f.startsWith('20261122') && f.endsWith('.sql'));
  for (const f of files) {
    const sql = fs.readFileSync(path.join(MIGRATIONS, f), 'utf8').replace(/--[^\n]*/g, '');
    for (const m of sql.matchAll(/'reason',\s*'([a-z_0-9]+)'/g)) found.add(m[1] ?? '');
    for (const m of sql.matchAll(/errcode\s*=\s*'HH001',\s*message\s*=\s*'([a-z_0-9]+)'/g)) found.add(m[1] ?? '');
  }
  return found;
}

describe('household refusal copy (08-15)', () => {
  it('finds the server reasons to check', () => {
    expect(serverReasons().size).toBeGreaterThan(40);
  });

  it('maps every server reason to a key', () => {
    // 'changed' is the refusal marker inside an undo_log row (08-05, record changed since), not an RPC answer.
    const notRpcAnswers = new Set(['changed']);
    const missing = [...serverReasons()].filter((r) => !notRpcAnswers.has(r) && householdReasonKey(r) === null).sort();
    expect(missing).toEqual([]);
  });

  it('every mapped key, and the generic one, is a real non-empty string in en', () => {
    for (const [reason, key] of Object.entries(HOUSEHOLD_REASON_KEYS)) {
      expect({ reason, text: typeof lookup(key) === 'string' && (lookup(key) as string).length > 0 }).toEqual({ reason, text: true });
    }
    expect(typeof lookup(householdReasonKeyOrGeneric('something_new'))).toBe('string');
  });

  it('carries the carry-in, 08-14 and wave 6 reasons', () => {
    for (const r of [
      'not_owner', 'not_allowed', 'colour_taken', 'invalid_name', 'invalid_role', 'owner_label_fixed', 'members_mismatch',
      'invalid_weight', 'not_100', 'unknown_currency', 'all_zero', 'not_found', 'not_open', 'not_restorable', 'try_again',
      'slow_down', 'invalid', 'in_other_household', 'party_left', 'not_departed', 'nothing_owed', 'lines_changed',
      'payer_account_gone', 'alone', 'pick_new_owner', 'not_member', 'member_still_here', 'already_restored', 'window_closed', 'full',
    ]) {
      expect({ r, key: householdReasonKey(r) !== null }).toEqual({ r, key: true });
    }
    expect(householdReasonKey('version_conflict')).toBe('household.sharing.reasons.stale_version');
  });

  it('an unknown code reads as the generic line, never blank or raw', () => {
    expect(householdReasonKey('something_new')).toBeNull();
    expect(householdReasonKeyOrGeneric('something_new')).toBe('household.reasons.generic');
  });

  it('a parked household refusal reads in its own words, and SQL codes keep their old lines', () => {
    expect(failedReasonKey({ kind: 'rejected', code: 'line_locked', entity: 'transactions' })).toBe('household.sharing.reasons.settled_line');
    expect(failedReasonKey({ kind: 'rejected', code: 'joint_account_line', entity: 'transactions' })).toBe('household.reasons.joint_account_line');
    expect(failedReasonKey({ kind: 'rejected', code: '42501', entity: 'transactions' })).toBe('sync.failedSheet.reason.rejected');
    expect(failedReasonKey({ kind: 'conflict', code: 'version-conflict', entity: 'transactions' })).toBe('sync.failedSheet.reason.conflict');
  });

  it('has copy for the settle_departed notice and its three reasons', () => {
    const notices = en.household.notices;
    for (const k of ['settle_departed', 'settle_departed_left', 'settle_departed_removed', 'settle_departed_deleted'] as const) {
      expect(notices[k]).toContain('{{name}}');
      expect(notices[k]).toContain('{{amount}}');
    }
  });
});
