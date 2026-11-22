// 09-13: the signed-in person's private setup row (level, answers, resume point).
import { useUserSetupQuery } from '@/data/queries/userSetup';
import { useAuth } from '@/features/auth/AuthProvider';
import type { UserSetup } from '@/db/userSetup';

export function useUserSetup(): { data: UserSetup | null; loading: boolean } {
  const { user } = useAuth();
  const q = useUserSetupQuery(user?.id);
  return { data: q.data ?? null, loading: Boolean(user?.id) && q.data === undefined && !q.isError };
}
