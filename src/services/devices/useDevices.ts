// 10-12 (ACC-06/07): the signed-in devices list and its two revoke actions. Never persisted (queryKeys.devices).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { listMyDevices, revokeMySession } from '@/db/devices';
import { queryKeys } from '@/data/keys';

type DbClientLike = Parameters<typeof listMyDevices>[0];
export type GetClient = () => Promise<DbClientLike & { auth: { signOut(o: { scope: 'others' }): Promise<{ error: unknown }> } }>;

// Lazy: the real client reads its env at import time (see signOut.ts, T-00-18). Tests pass their own getClient.
const defaultClient: GetClient = async () => (await import('@/services/supabase')).supabase as never;

export function useDevices(userId?: string, client: GetClient = defaultClient) {
  return useQuery({
    queryKey: queryKeys.devices(userId ?? ''),
    queryFn: async () => listMyDevices(await client()),
    enabled: Boolean(userId),
    staleTime: 0,
  });
}

export function useRevokeDevice(userId?: string, client: GetClient = defaultClient) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (sessionId: string) => revokeMySession(await client(), sessionId),
    onSettled: () => qc.invalidateQueries({ queryKey: queryKeys.devices(userId ?? '') }),
  });
}

/** Signs out every session except this one. */
export function useSignOutOthers(userId?: string, client: GetClient = defaultClient) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const supabase = await client();
      const { error } = await supabase.auth.signOut({ scope: 'others' });
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: queryKeys.devices(userId ?? '') }),
  });
}
