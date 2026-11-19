// 09-23 (owner P3): the setup account (Q3) and goal (Q11) live only in user_setup.answers until the household is covered.
// Once the plan is writable this makes them real records, once. Idempotence survives a kill between steps:
//   - both rows use stable ids derived from the user id, so every session and device computes the same two ids;
//   - each add is skipped when that id already exists (a server row, or a not-yet-sent add in the mutation cache);
//   - records_applied_at is written last.
// Pure apart from the injected deps; no React.
import * as Crypto from 'expo-crypto';
import type { AddAccountVars } from '@/data/mutations/accounts';
import type { SaveGoalPlanInput } from '@/data/mutations/growGoals';
import type { UserSetup, UserSetupPatch } from '@/db/userSetup';

export type SetupRecordKind = 'account' | 'goal';

/**
 * A UUID-shaped id from SHA-256 of `fincwin-setup:{kind}:{userId}`: the first 32 hex characters, with the version nibble
 * set to 5 and the variant bits to 10xx. Same inputs, same id; 'account' and 'goal' differ.
 */
export async function setupRecordId(userId: string, kind: SetupRecordKind): Promise<string> {
  const hex = (await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `fincwin-setup:${kind}:${userId}`))
    .toLowerCase()
    .slice(0, 32)
    .split('');
  hex[12] = '5';
  hex[16] = ((parseInt(hex[16] as string, 16) & 0x3) | 0x8).toString(16);
  const h = hex.join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

export interface ApplyRecordsDeps {
  plan: { writable: boolean; loading?: boolean; householdId: string | null };
  setup: UserSetup | null;
  userId: string;
  /** The person's home currency; used when Q2 was skipped (and always for the partner version). */
  homeCurrency: string;
  recordExists(kind: SetupRecordKind, id: string): Promise<boolean>;
  addAccount(vars: AddAccountVars): void;
  addGoal(input: SaveGoalPlanInput): void;
  saveUserSetup(patch: UserSetupPatch): void;
}

export type ApplyRecordsResult = 'not-ready' | 'nothing-to-do' | 'applied';

/** Whether there is anything to apply at all (cheap check before any lookup). */
export function needsRecords(setup: UserSetup | null): boolean {
  if (setup === null || setup.completedAt === null || setup.recordsAppliedAt !== null) return false;
  return setup.answers.acct !== undefined || setup.answers.save !== undefined;
}

export async function applyOnboardingRecords(deps: ApplyRecordsDeps): Promise<ApplyRecordsResult> {
  const { plan, setup, userId } = deps;
  if (!plan.writable || plan.loading === true || plan.householdId === null || userId === '') return 'not-ready';
  if (!needsRecords(setup)) return 'nothing-to-do';
  const s = setup as UserSetup;
  const householdId = plan.householdId;
  const currency = s.answers.cur ?? deps.homeCurrency;

  const acct = s.answers.acct;
  if (acct !== undefined && acct.name.trim() !== '') {
    const id = await setupRecordId(userId, 'account');
    if (!(await deps.recordExists('account', id))) {
      try {
        deps.addAccount({
          row: {
            id,
            household_id: householdId,
            name: acct.name.trim(),
            kind: 'checking',
            currency,
            opening_balance: Math.trunc(acct.balanceMinor),
          },
        });
      } catch {
        // A row the server would refuse is not retried forever; the answer stays in user_setup.
      }
    }
  }

  const save = s.answers.save;
  if (save !== undefined && save.name.trim() !== '') {
    const id = await setupRecordId(userId, 'goal');
    if (!(await deps.recordExists('goal', id))) {
      try {
        deps.addGoal({
          ownerId: userId,
          householdId,
          id,
          fields: {
            name: save.name.trim(),
            currency,
            // D-23 asks this of the person in Grow; setup did not, so the goal counts in Decide's answers like any money.
            locked: false,
            target: save.targetMinor > 0 ? save.targetMinor : null,
            ready_by: null,
            monthly_amount: save.perMonthMinor > 0 ? save.perMonthMinor : null,
            opening_saved: 0,
          },
          series: null,
        });
      } catch {
        // As above: an invalid goal answer does not block the done-marker.
      }
    }
  }

  deps.saveUserSetup({ recordsAppliedAt: new Date().toISOString() });
  return 'applied';
}
