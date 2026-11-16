// 08-22: the server's answer to "what happens to the household if I delete?" (account_deletion_preview, plan 08-14).
import { useQuery } from '@tanstack/react-query';
import { fetchAccountDeletionPreview } from '@/db/accountDeletion';
import { supabase } from '@/services/supabase';

export function useAccountDeletionPreview(userId: string | null | undefined) {
  return useQuery({
    queryKey: ['account-deletion-preview', userId ?? ''] as const,
    queryFn: () => fetchAccountDeletionPreview(supabase),
    enabled: Boolean(userId),
    staleTime: 0,
  });
}
