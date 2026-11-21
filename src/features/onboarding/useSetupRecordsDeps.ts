// 09-23 (owner P3): the real dependencies for applyOnboardingRecords, used by LockHost. The adds go through the existing
// queued mutations (accounts add, goal plan save), so they replay in order after a restart like any other write.
import { useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AccountRow, DbClient } from '@/db/rows';
import { setupRowExists } from '@/db/setupRecords';
import { mutationKeys, WRITE_SCOPE } from '@/data/keys';
import type { AddAccountVars } from '@/data/mutations/accounts';
import { useSaveGoalPlan } from '@/data/mutations/growGoals';
import { useSaveUserSetup } from '@/data/mutations/userSetup';
import { useMoneyPrefs } from '@/data/queries/moneyPrefs';
import { useAuth } from '@/features/auth/AuthProvider';
import { useUserSetup } from '@/features/levels/useUserSetup';
import { queuedAddHasId, type ApplyRecordsDeps } from './applyOnboardingRecords';

function readClient(): DbClient {
  // Lazily required, as in writeClient: the client module reads env at load, which tests do not have.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return (require('@/services/supabase') as typeof import('@/services/supabase')).supabase;
}

/** Everything but `plan`, which LockHost already holds. */
export type SetupRecordsDeps = Omit<ApplyRecordsDeps, 'plan'>;

export function useSetupRecordsDeps(): SetupRecordsDeps {
  const qc = useQueryClient();
  const { user } = useAuth();
  const userId = user?.id ?? '';
  const { data: setup } = useUserSetup();
  const { prefs } = useMoneyPrefs(userId || undefined);
  const addAccount = useMutation<AccountRow, unknown, AddAccountVars>({ mutationKey: mutationKeys.addAccount, scope: WRITE_SCOPE });
  const { save } = useSaveGoalPlan();
  const { saveUserSetup } = useSaveUserSetup();
  const addAccountMutate = addAccount.mutate;

  return useMemo<SetupRecordsDeps>(
    () => ({
      setup,
      userId,
      homeCurrency: prefs.home_currency,
      recordExists: async (kind, id) => {
        const queued = qc.getMutationCache().getAll().map((m) => ({ state: { status: m.state.status, variables: m.state.variables } }));
        if (queuedAddHasId(queued, id)) return true;
        // A failed lookup throws, so nothing is added when the answer is unknown; the next trigger tries again.
        return setupRowExists(readClient(), kind, id);
      },
      addAccount: (vars) => addAccountMutate(vars),
      addGoal: (input) => {
        save(input);
      },
      saveUserSetup: (patch) => {
        if (userId === '') return;
        saveUserSetup({ userId, patch, baseVersion: setup?.version ?? 0 });
      },
    }),
    [qc, setup, userId, prefs.home_currency, addAccountMutate, save, saveUserSetup]
  );
}
