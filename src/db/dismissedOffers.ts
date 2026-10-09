// Dismissed "make this recurring" offers, per user on the server (CONTEXT D-18). RLS scopes
// reads to the caller; owner_id defaults to auth.uid() and the insert grant is (offer_key).

import { toDbError } from './errors';
import type { DbClient } from './rows';

export const DISMISS_BATCH_MAX = 50;
export const DISMISS_KEY_MAX_LENGTH = 300;
const FETCH_LIMIT = 5000;

export async function fetchDismissedOfferKeys(client: DbClient): Promise<Set<string>> {
  const { data, error, status } = await client.from('dismissed_series_offers').select('offer_key').limit(FETCH_LIMIT);

  if (error) throw toDbError(error, status);
  return new Set(((data as { offer_key: string }[] | null) ?? []).map((row) => row.offer_key));
}

export async function insertDismissedOffers(client: DbClient, keys: readonly string[]): Promise<void> {
  if (keys.length === 0) return;
  if (keys.length > DISMISS_BATCH_MAX) {
    throw new RangeError(`insertDismissedOffers: at most ${DISMISS_BATCH_MAX} keys per call`);
  }
  if (keys.some((key) => key.length > DISMISS_KEY_MAX_LENGTH)) {
    throw new RangeError(`insertDismissedOffers: a key exceeds ${DISMISS_KEY_MAX_LENGTH} characters`);
  }

  const { error, status } = await client.from('dismissed_series_offers').upsert(
    keys.map((k) => ({ offer_key: k })),
    { onConflict: 'owner_id,offer_key', ignoreDuplicates: true }
  );

  if (error) throw toDbError(error, status);
}
