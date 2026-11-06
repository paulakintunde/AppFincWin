// APP-15: a sample (demo, review) household re-dates its sample data on sign-in when its newest month is
// older than the current month. Never blocks sign-in: every failure is swallowed.
import { redateSampleDataIfStale } from '@/db/samples';
import type { DbClient } from '@/db/rows';

export interface RedateDeps {
  client: DbClient;
  householdId: string | null | undefined;
  /** The user's local day, YYYY-MM-DD. */
  today: string;
  /** Whether this household holds sample data (the server re-checks; this saves a call). */
  hasSamples: boolean;
  /** Called after a re-date so cached reads can refresh. */
  onRedated?: () => void;
}

/** True when the sample data was re-dated. */
export async function redateOnSignIn(deps: RedateDeps): Promise<boolean> {
  if (!deps.householdId || !deps.hasSamples) return false;
  try {
    const redated = await redateSampleDataIfStale(deps.client, deps.householdId, deps.today);
    if (redated) deps.onRedated?.();
    return redated;
  } catch {
    return false;
  }
}
