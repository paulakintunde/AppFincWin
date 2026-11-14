import { createContext, useContext } from 'react';

/**
 * 06.1-46 (B-9): Decide's reads stay fresh for 5 minutes; a write still invalidates the keys it touches at once (an invalidated
 * read is stale whatever its staleTime). 06.1-72 (G-73-1) extends it from the history and upcoming reads to every read Decide
 * holds, so a Decide screen that mounts over another (the answer over Decide home) does not refetch reads home already has.
 */
export const DECIDE_READ_STALE_MS = 5 * 60_000;

/**
 * 06.1-78 (G-72-2): the read freshness of the screen a hook runs in. Every Decide screen's DecideV3Scope provides
 * DECIDE_READ_STALE_MS, so the shared record-context reads (money prefs, record prefs, the horizon, sample data) do not refetch
 * when the answer mounts over Decide home. Elsewhere it is undefined and those reads keep the app default.
 */
export const DecideReadStaleContext = createContext<number | undefined>(undefined);

export function useDecideReadStale(): number | undefined {
  return useContext(DecideReadStaleContext);
}
