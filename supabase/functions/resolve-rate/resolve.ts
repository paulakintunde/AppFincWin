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
//
// Backfilled rows go through the same quarantine as fx-sync (MON-11, D-11,
// CR-B01): only rows for a quote this call asked for, dated on or before the
// transaction's local_date, with no open or dropped hold on the same
// (quote, date), and passing fx-sync's own classifyRates plausibility check
// against the nearest stored prior may enter the served fx_rates. A row that
// fails plausibility goes to fx_rate_holds (with a 'held' alert), exactly as
// an fx-sync hold would -- never to fx_rates.
import { FRANKFURTER_V2_RATES_URL, parseFrankfurterRates, type FxRow } from '../fx-sync/parse.ts';
import { classifyRates, type Classification, type StoredRate } from '../fx-sync/plausibility.ts';

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
  /** Admin: (quote, held_rate_date) of every fx_rate_holds row with status 'held' or 'dropped' for these quotes, any source. */
  blockedHolds(quotes: string[]): Promise<Array<{ quote: string; heldDate: string }>>;
  /**
   * Admin: stored EUR-based fx_rates rows for `quote` dated exactly `date`,
   * plus the single latest one dated strictly before `date` (no age window),
   * as classifyRates' history input.
   */
  storedRatesAround(quote: string, date: string): Promise<StoredRate[]>;
  /** Admin, source 'frankfurter-v2', ignoreDuplicates. */
  upsertRates(rows: FxRow[]): Promise<void>;
  /** Admin: fx_rate_holds insert, ignoreDuplicates (an existing hold's status is never overwritten). */
  upsertHolds(rows: Classification['hold']): Promise<void>;
  /** Admin: fx_alerts insert. */
  insertAlerts(alerts: Array<{ kind: string; quote?: string; detail?: Record<string, unknown> }>): Promise<void>;
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

const BACKFILL_SOURCE = 'frankfurter-v2';

/**
 * CR-B01: the backfill must never bypass the MON-11/D-11 quarantine.
 * Drops rows for an unrequested quote, rows dated after the transaction's
 * local_date, and rows whose (quote, date) already has an open or dropped
 * hold; then classifies the rest with fx-sync's classifyRates against the
 * nearest stored prior. No open holds are passed in, so a backfill can
 * never *confirm* a hold -- that stays fx-sync's and the operator's job.
 */
async function quarantineAndStore(
  deps: ResolveDeps,
  fxRows: FxRow[],
  quotesToFetch: Set<string>,
  localDate: string
): Promise<void> {
  const requested = fxRows.filter((r) => r.base === 'EUR' && quotesToFetch.has(r.quote) && r.date <= localDate);
  if (requested.length === 0) return;

  const blocked = await deps.blockedHolds([...quotesToFetch].sort());
  const candidates = requested.filter((r) => !blocked.some((h) => h.quote === r.quote && h.heldDate === r.date));
  if (candidates.length === 0) return;

  const history = (await Promise.all(candidates.map((r) => deps.storedRatesAround(r.quote, r.date)))).flat();
  const classified = classifyRates(candidates, history, [], BACKFILL_SOURCE);

  if (classified.accept.length > 0) {
    await deps.upsertRates(classified.accept);
  }
  if (classified.hold.length > 0) {
    await deps.upsertHolds(classified.hold);
    await deps.insertAlerts(
      classified.hold.map((h) => ({
        kind: 'held',
        quote: h.quote,
        detail: {
          heldRate: h.rate,
          priorRate: h.priorRate,
          changeRatio: h.changeRatio,
          source: h.source,
          via: 'resolve-rate',
        },
      }))
    );
  }
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

    await quarantineAndStore(deps, fxRows, quotesToFetch, row.local_date);
  }

  const restamped = await deps.restamp(transactionId);
  return {
    status: 200,
    body: { ok: true, pending: Boolean((restamped as { rate_pending?: boolean }).rate_pending), row: restamped },
  };
}
