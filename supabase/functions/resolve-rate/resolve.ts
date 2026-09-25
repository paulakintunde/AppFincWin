// Pure resolve-rate core: backfills a pending transaction's historical FX
// rate from Frankfurter v2 and re-stamps it (D-03, D-17, MON-05). Zero
// runtime imports except the shared Frankfurter parser/type, so this file
// loads identically under Deno (the Edge Function) and Jest
// (resolve.test.ts) with no runtime-specific glue -- the same pattern
// fx-sync's own modules use (01-08-SUMMARY.md).
//
// The caller (index.ts) is responsible for the IDOR mitigation (T-01-11-01):
// readPending must be backed by a user-scoped client reading under RLS, so a
// transaction id the caller's own household cannot see returns null here
// before any admin (service-role) action ever runs.
import { FRANKFURTER_V2_RATES_URL, parseFrankfurterRates, type FxRow } from '../fx-sync/parse.ts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface PendingTransaction {
  id: string;
  original_currency: string;
  home_currency: string;
  local_date: string;
  rate_pending: boolean;
  created_by: string | null;
}

export interface ResolveDeps {
  /** User-scoped read (RLS decides visibility) -- the IDOR mitigation. */
  readPending(id: string): Promise<PendingTransaction | null>;
  /** Admin: custom_currencies.reference_currency for (ownerId, code), or null if code isn't a registered custom currency for that owner. */
  customReference(ownerId: string | null, code: string): Promise<string | null>;
  fetchJson(url: string): Promise<unknown>;
  /** Admin, source 'frankfurter-v2', ignoreDuplicates. */
  upsertRates(rows: FxRow[]): Promise<void>;
  /** Admin: rpc('restamp_transaction', { p_id: id }). */
  restamp(id: string): Promise<Record<string, unknown>>;
}

export type ResolveResult =
  | { status: 200; body: { ok: true; pending: boolean; row: Record<string, unknown> | null } }
  | { status: 400 | 404 | 502; body: { ok: false; error: string } };

function invalidInput(): ResolveResult {
  return { status: 400, body: { ok: false, error: 'invalid-input' } };
}

/**
 * Resolves `code` (one leg of a pending transaction) to the Frankfurter
 * quote that must be present in fx_rates, adding it to `quotesToFetch` when
 * a backfill fetch is actually needed. 'EUR' needs no lookup at all; a
 * custom currency resolves through its user-declared reference currency
 * (D-07) -- if that reference is EUR, nothing needs fetching for this leg
 * either. An ISO currency (customReference returns null) is fetched
 * directly.
 */
async function resolveQuote(
  deps: ResolveDeps,
  ownerId: string | null,
  code: string,
  quotesToFetch: Set<string>
): Promise<void> {
  if (code === 'EUR') return;

  const reference = await deps.customReference(ownerId, code);
  if (reference !== null) {
    if (reference !== 'EUR') quotesToFetch.add(reference);
    return;
  }

  quotesToFetch.add(code);
}

export async function resolveRate(deps: ResolveDeps, input: unknown): Promise<ResolveResult> {
  if (input === null || typeof input !== 'object') return invalidInput();

  const { transactionId } = input as Record<string, unknown>;
  if (typeof transactionId !== 'string' || !UUID_RE.test(transactionId)) return invalidInput();

  const row = await deps.readPending(transactionId);
  if (row === null) return { status: 404, body: { ok: false, error: 'not-found' } };

  if (!row.rate_pending) {
    return { status: 200, body: { ok: true, pending: false, row: row as unknown as Record<string, unknown> } };
  }

  const quotesToFetch = new Set<string>();
  await resolveQuote(deps, row.created_by, row.original_currency, quotesToFetch);
  await resolveQuote(deps, row.created_by, row.home_currency, quotesToFetch);

  if (quotesToFetch.size > 0) {
    const quotes = [...quotesToFetch].sort().join(',');
    const url = `${FRANKFURTER_V2_RATES_URL}?date=${row.local_date}&base=EUR&quotes=${quotes}`;

    let fxRows: FxRow[];
    try {
      const json = await deps.fetchJson(url);
      fxRows = parseFrankfurterRates(json);
    } catch {
      return { status: 502, body: { ok: false, error: 'upstream' } };
    }

    await deps.upsertRates(fxRows);
  }

  const restamped = await deps.restamp(transactionId);
  return {
    status: 200,
    body: { ok: true, pending: Boolean((restamped as { rate_pending?: boolean }).rate_pending), row: restamped },
  };
}
