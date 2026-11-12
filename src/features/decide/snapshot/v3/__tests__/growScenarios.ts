// 06-10: scenarios shared by the growConnect baseline and its comparison. None of them involves a safety net, so the same
// source builds the same inputs before and after the builder reads Grow through the connection points.
import { demoSource } from '../../../__tests__/helpers/demoScenario';
import type { AccountUse } from '@/engine/decide/v3';
import type { SnapshotSource } from '../../buildSnapshot';
import { v3s } from './v3Fixtures';

export const TODAY = '2026-10-03';

/** Stated uses and a confirmed unspent figure, so the answers are real verdicts and not "needs input". */
export const USES: Readonly<Record<string, AccountUse>> = {
  'demo-acct-everyday': { kind: 'everyday' },
  'demo-acct-cash': { kind: 'everyday' },
  'demo-acct-savings': { kind: 'untouched' },
  'demo-acct-investments': { kind: 'untouched' },
};
export const SETTINGS = v3s({ income_types: ['salary'], unspent_anchor: 200000, unspent_anchor_at: TODAY, income_pattern: 'steady', income_pattern_confirmed: true });

type Goal = SnapshotSource['goals'][number];
const goal = (over: Partial<Goal> & Pick<Goal, 'id'>): Goal => ({
  kind: 'pot', check_id: null, currency: 'USD', target: null, monthly_amount: null, ready_by: null, opening_saved: 0, done_at: null, deleted_at: null, ...over,
});

/** Tags the incoming leg of every demo transfer into the savings account with a goal (one leg only, as the app writes it). */
function tagSavingsLegs(source: SnapshotSource, goalId: string): SnapshotSource {
  const rows = source.rows.map((r) => (r.transfer_id !== null && r.account_id === 'demo-acct-savings' && r.original_amount > 0 ? { ...r, goal_id: goalId } : r));
  return { ...source, rows };
}

export function scenarios(): { name: string; source: SnapshotSource }[] {
  const base = demoSource(TODAY);
  const lisbon = goal({ id: 'g-lisbon', target: 640000, monthly_amount: 5000, opening_saved: 64000 });
  return [
    { name: 'no goals', source: base },
    { name: 'a pot with no account', source: { ...base, goals: [lisbon] } },
    { name: 'a pot kept in savings and a wait goal', source: { ...base, goals: [{ ...lisbon, account_id: 'demo-acct-savings' }, goal({ id: 'g-wait', kind: 'wait', target: 90000, ready_by: '2027-03-01', opening_saved: 20000 })] } },
    { name: 'a bucket goal', source: { ...base, goals: [goal({ id: 'g-bucket', target: 300000, monthly_amount: 10000, opening_saved: 0, bucket: 'trip' })] } },
    { name: 'a pot with tagged savings legs', source: tagSavingsLegs({ ...base, goals: [{ ...lisbon, account_id: 'demo-acct-savings' }] }, 'g-lisbon') },
    { name: 'a done and a deleted goal', source: { ...base, goals: [{ ...lisbon, done_at: '2026-09-01T00:00:00Z' }, goal({ id: 'g-gone', deleted_at: '2026-09-02T00:00:00Z', opening_saved: 1000 })] } },
  ];
}
