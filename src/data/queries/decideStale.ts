/**
 * 06.1-46 (B-9): Decide's reads stay fresh for 5 minutes; a write still invalidates the keys it touches at once (an invalidated
 * read is stale whatever its staleTime). 06.1-72 (G-73-1) extends it from the history and upcoming reads to every read Decide
 * holds, so a Decide screen that mounts over another (the answer over Decide home) does not refetch reads home already has.
 */
export const DECIDE_READ_STALE_MS = 5 * 60_000;
