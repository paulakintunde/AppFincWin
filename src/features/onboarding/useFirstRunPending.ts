// 09-23 (ANL-07): true while the person's setup row is read and not finished, so they are on their way to (or inside) the
// onboarding questions, which ask analytics consent as their last step. The app layout skips its consent redirect then.
import { useUserSetupQuery } from '@/data/queries/userSetup';
import { useAuth } from '@/features/auth/AuthProvider';
import { setupDone } from './firstRun';

export function useFirstRunPending(): boolean {
  const { user } = useAuth();
  const q = useUserSetupQuery(user?.id);
  return q.data !== undefined && !setupDone(q.data);
}
