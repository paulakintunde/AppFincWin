import { useReopenFailed, useReopenRedirect } from '@/data/mutations/decideChecks';

/**
 * What became of a reopen copy opened on `id`: the live copy the server returned instead (redirectTo), or a copy that
 * could not be saved (failed). Both null/false for any other id.
 */
export function useReopenOutcome(id: string): { redirectTo: string | null; failed: boolean } {
  const redirectTo = useReopenRedirect(id);
  const failed = useReopenFailed(id);
  return { redirectTo, failed };
}
