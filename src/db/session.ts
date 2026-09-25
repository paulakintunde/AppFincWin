// WR-A01: the session preflight every queued write runs before it touches the network.
// Same client-injected shape as the rest of db/ -- never imports the real Supabase client.

import { SessionUnavailableError } from './errors';
import type { DbClient } from './rows';

/**
 * Resolves when the client holds a usable session, and throws SessionUnavailableError
 * otherwise. `auth.getSession()` refreshes an expired access token itself, so after a long
 * offline period this is also the step that performs that refresh. When the refresh fails
 * (no network yet, or the auth server is briefly unreachable) the write must wait, not go
 * out under the anon key and be rejected by the column grants (42501).
 */
export async function assertSession(client: DbClient): Promise<void> {
  const { data, error } = await client.auth.getSession();
  if (error) throw new SessionUnavailableError(error.message);
  if (!data.session) throw new SessionUnavailableError();
}
