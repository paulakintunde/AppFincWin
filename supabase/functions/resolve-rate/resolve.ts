// Pure resolve-rate core: the single on-demand FX fetch path (02-DECISION-
// fx-on-demand.md; fx-sync and fx-monitor are gone). It backfills the rates
// that pending transactions, or an explicit `ensure` request, need and
// re-stamps the transactions (D-03, D-17, MON-05, MON-06). Zero runtime
// imports except the shared FX parsers/plausibility, so this file loads
// identically under Deno (the Edge Function) and Jest (resolve.test.ts).
//
// Request shapes (every response is JSON):
//   A { transactionId }                  -> { ok, pending, row }   (unchanged)
//   B { transactionIds: uuid[1..50] }    -> { ok, rows }
//   C { ensure: { date, currencies } }   -> { ok, stored }
//
// Fetch planning: per distinct date, at most ONE primary upstream request,
// covering only the quotes fx_quotes_needing_fetch reports (not yet covered,
// not failed recently). A rate is fetched once and reused by every user.
// Dates after today(UTC)+1 never fetch; the row stays pending until its day.
// Frankfurter v2 is primary; open.er-api (latest-only) is the fallback, and
// its rows dated after the requested date are discarded.
//
// The caller (index.ts) is responsible for the IDOR mitigation (T-01-11-01,
// T-02-44-01): readPending / readPendingMany must be backed by a user-scoped
// client reading under RLS, so a transaction id the caller's own household
// cannot see is never seen here, before any admin (service-role) action.
//
// Every accepted row goes through the MON-11 quarantine (CR-B01): only rows
// for a quote this call asked for, dated on or before the requested date,
// with no open or dropped hold on the same (quote, date), and passing
// classifyRates against the nearest stored prior may enter fx_rates. History
// older than PRIOR_WINDOW_DAYS before the row's date is ignored: with an
// on-demand feed there is no daily series, so "no prior within a week"
// accepts (MON-11 says day-on-day; WR-B04's any-age comparison assumed a
// daily feed).
import { FRANKFURTER_V2_RATES_URL, parseFrankfurterRates, type FxRow } from '../_shared/fx/parse.ts';
import { OPEN_ER_API_URL, parseOpenErApiRates } from '../_shared/fx/openErApi.ts';
import { classifyRates, type Classification, type OpenHold, type StoredRate } from '../_shared/fx/plausibility.ts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CODE_RE = /^[A-Z0-9]{2,4}$/;
const MIN_DATE = '1999-01-04';
const MAX_IDS = 50;

/** History older than this many days before a row's date is not a prior (see header). */
export const PRIOR_WINDOW_DAYS = 7;
/** open.er-api is latest-only, so it can witness a held value only this close to today(UTC). */
export const WITNESS_WINDOW_DAYS = 2;

export type FxSource = 'frankfurter-v2' | 'open-er-api';
export type FailureReason = 'both-sources-failed' | 'no-usable-rate' | 'held';

export interface PendingTransaction {
  id: string;
  original_currency: string;
  home_currency: string;
  local_date: string;
  rate_pending: boolean;
  created_by: string | null;
}

export interface LookupRow {
  quote: string;
  requestedDate: string;
  rateDate: string;
  source: FxSource;
}

export interface ResolveDeps {
  /**
   * RD-05: per-user throttle (~60/hour), backed by fx_resolve_calls
   * (service-role, atomic increment -- 20260924000600_fx_monitoring.sql).
   * true = under the limit, this call counts against it (one per call,
   * whatever the shape); false = reject with 429 before any other work.
   */
  checkRateLimit(): Promise<boolean>;
  /** UTC YYYY-MM-DD (injected; this file reads no clock). */
  today(): string;
  /** The caller's auth user id, or null. Owner of the custom currencies in shape C. */
  callerId(): Promise<string | null>;
  /** User-scoped read (RLS decides visibility) -- the IDOR mitigation. */
  readPending(id: string): Promise<PendingTransaction | null>;
  /** User-scoped `.in('id', ids)` under RLS; invisible ids are simply absent. */
  readPendingMany(ids: string[]): Promise<PendingTransaction[]>;
  /** Admin: custom_currencies.reference_currency for (ownerId, code), or null if code isn't a registered custom currency for that owner. */
  customReference(ownerId: string | null, code: string): Promise<string | null>;
  fetchJson(url: string): Promise<unknown>;
  /** rpc fx_quotes_needing_fetch: the subset of `quotes` neither covered for `date` nor failed recently. */
  quotesNeedingFetch(quotes: string[], date: string): Promise<string[]>;
  /** Admin: open ('held') and operator-dropped holds for these quotes, any date and source. */
  openHolds(quotes: string[]): Promise<OpenHold[]>;
  /** Admin: (quote, held_rate_date) of every fx_rate_holds row with status 'held' or 'dropped' for these quotes, any source. */
  blockedHolds(quotes: string[]): Promise<Array<{ quote: string; heldDate: string }>>;
  /**
   * Admin: stored EUR-based fx_rates rows for `quote` dated exactly `date`,
   * plus the single latest one dated strictly before `date`, as
   * classifyRates' history input (the prior window is applied here).
   */
  storedRatesAround(quote: string, date: string): Promise<StoredRate[]>;
  /** Admin: fx_rates upsert under `source`, ignoreDuplicates. */
  upsertRates(rows: FxRow[], source: FxSource): Promise<void>;
  /** Admin: fx_rate_lookups upsert on (base, quote, requested_date); refreshes fetched_at. */
  upsertLookups(rows: LookupRow[]): Promise<void>;
  /** Admin: fx_rate_fetch_failures upsert (failed_at now). */
  recordFailures(date: string, quotes: string[], reason: FailureReason): Promise<void>;
  /** Admin: delete fx_rate_fetch_failures for (date, quotes). */
  clearFailures(date: string, quotes: string[]): Promise<void>;
  /** Admin: fx_rate_holds insert, ignoreDuplicates (an existing hold's status is never overwritten). */
  upsertHolds(rows: Classification['hold']): Promise<void>;
  /** Admin: status 'confirmed', resolved_at now(). */
  confirmHolds(ids: number[]): Promise<void>;
  /** Admin: rpc fx_auto_accept_holds -- the holds it accepted. */
  autoAcceptHolds(): Promise<Array<{ quote: string; heldDate: string }>>;
  /** Admin: fx_rate_lookups.fetched_at = now() for each (quote, rate_date = heldDate). */
  refreshLookupsFor(accepted: Array<{ quote: string; heldDate: string }>): Promise<void>;
  /** Admin: fx_alerts insert. */
  insertAlerts(alerts: Array<{ kind: string; quote?: string; detail?: Record<string, unknown> }>): Promise<void>;
  /** A 'sync-failed' alert for the same (date, quotes) exists in the last 24 hours. */
  recentFailureAlert(date: string, quotes: string[]): Promise<boolean>;
  /** Throttled operator email. Never throws. */
  notify(): Promise<void>;
  /**
   * Admin: rpc('restamp_transaction', { p_id: id, p_relax_quotes }). Only
   * the quotes in relaxQuotes -- the ones this backfill actually stored --
   * may use a rate older than 7 days (WR-B01).
   */
  restamp(id: string, relaxQuotes: string[]): Promise<Record<string, unknown>>;
}

export type ResolveResult =
  | { status: 200; body: { ok: true; pending: boolean; row: Record<string, unknown> | null } }
  | { status: 200; body: { ok: true; rows: Array<Record<string, unknown>> } }
  | { status: 200; body: { ok: true; stored: string[] } }
  | { status: 400 | 404 | 429 | 500 | 502; body: { ok: false; error: string } };

function invalidInput(): ResolveResult {
  return { status: 400, body: { ok: false, error: 'invalid-input' } };
}
const upstream = (): ResolveResult => ({ status: 502, body: { ok: false, error: 'upstream' } });

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function isRealDate(date: string): boolean {
  return DATE_RE.test(date) && !Number.isNaN(Date.parse(`${date}T00:00:00Z`)) && addDays(date, 0) === date;
}

/**
 * Resolves `code` (one leg of a pending transaction) to the Frankfurter
 * quote that must be present in fx_rates, adding it to `quotes`. 'EUR'
 * needs no lookup; a custom currency resolves through its user-declared
 * reference currency (D-07) -- if that is EUR, nothing is needed either. An
 * ISO currency (customReference returns null) is fetched directly.
 */
async function resolveQuote(deps: ResolveDeps, ownerId: string | null, code: string, quotes: Set<string>): Promise<void> {
  if (code === 'EUR') return;
  const reference = await deps.customReference(ownerId, code);
  if (reference !== null) {
    if (reference !== 'EUR') quotes.add(reference);
    return;
  }
  quotes.add(code);
}

interface Ctx {
  deps: ResolveDeps;
  autoAcceptDone: boolean;
  notifyNeeded: boolean;
}

type Outcome = 'none-needed' | 'stored' | 'nothing-usable' | 'both-failed';
interface DateResult {
  relax: string[];
  outcome: Outcome;
}

async function recordFailure(ctx: Ctx, date: string, quotes: string[], reason: FailureReason): Promise<void> {
  if (quotes.length === 0) return;
  const { deps } = ctx;
  await deps.recordFailures(date, quotes, reason);
  ctx.notifyNeeded = true;
  // A held value already wrote its own 'held' alert.
  if (reason === 'held') return;
  if (!(await deps.recentFailureAlert(date, quotes))) {
    await deps.insertAlerts([{ kind: 'sync-failed', detail: { via: 'resolve-rate', date, quotes, reason } }]);
  }
}

async function resolveDate(ctx: Ctx, date: string, wantedQuotes: Iterable<string>): Promise<DateResult> {
  const { deps } = ctx;
  const none: DateResult = { relax: [], outcome: 'none-needed' };

  if (date > addDays(deps.today(), 1)) return none;
  const wanted = [...new Set(wantedQuotes)].filter((q) => q !== 'EUR').sort();
  if (wanted.length === 0) return none;
  const needed = [...new Set(await deps.quotesNeedingFetch(wanted, date))].filter((q) => wanted.includes(q)).sort();
  if (needed.length === 0) return none;

  // Lazy auto-accept (no cron): once per request, before the first fetch.
  if (!ctx.autoAcceptDone) {
    ctx.autoAcceptDone = true;
    const accepted = await deps.autoAcceptHolds();
    if (accepted.length > 0) {
      await deps.refreshLookupsFor(accepted);
      ctx.notifyNeeded = true;
    }
  }

  let rows: FxRow[];
  let source: FxSource;
  try {
    rows = parseFrankfurterRates(
      await deps.fetchJson(`${FRANKFURTER_V2_RATES_URL}?date=${date}&base=EUR&quotes=${needed.join(',')}`)
    );
    source = 'frankfurter-v2';
  } catch {
    try {
      rows = parseOpenErApiRates(await deps.fetchJson(`${OPEN_ER_API_URL}/EUR`));
      source = 'open-er-api';
    } catch {
      await recordFailure(ctx, date, needed, 'both-sources-failed');
      return { relax: [], outcome: 'both-failed' };
    }
  }

  const candidatesIn = rows.filter((r) => r.base === 'EUR' && needed.includes(r.quote) && r.date <= date);
  const stored = await quarantineAndStore(ctx, date, needed, candidatesIn, source);

  const missing = needed.filter((q) => !stored.relax.includes(q) && !stored.held.includes(q));
  await recordFailure(ctx, date, missing, 'no-usable-rate');
  await recordFailure(ctx, date, stored.held, 'held');

  return { relax: stored.relax, outcome: stored.relax.length > 0 ? 'stored' : 'nothing-usable' };
}

/**
 * CR-B01: the backfill must never bypass the MON-11/D-11 quarantine.
 * Candidates are already limited to requested quotes dated on or before the
 * requested date; rows whose (quote, date) has an open or dropped hold are
 * dropped here, and the rest are classified by classifyRates against the
 * nearest stored prior within PRIOR_WINDOW_DAYS.
 */
async function quarantineAndStore(
  ctx: Ctx,
  date: string,
  needed: string[],
  incoming: FxRow[],
  source: FxSource
): Promise<{ relax: string[]; held: string[] }> {
  const { deps } = ctx;
  const result = { relax: [] as string[], held: [] as string[] };
  if (incoming.length === 0) return result;

  const blocked = await deps.blockedHolds(needed);
  const candidates = incoming.filter((r) => !blocked.some((h) => h.quote === r.quote && h.heldDate === r.date));
  if (candidates.length === 0) return result;

  const history = (
    await Promise.all(
      candidates.map(async (r) => {
        const floor = addDays(r.date, -PRIOR_WINDOW_DAYS);
        return (await deps.storedRatesAround(r.quote, r.date)).filter((h) => h.date >= floor);
      })
    )
  ).flat();
  const classified = classifyRates(candidates, history, [], source);

  if (classified.accept.length > 0) {
    await deps.upsertRates(classified.accept, source);
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
          date: h.date,
          via: 'resolve-rate',
        },
      }))
    );
  }

  const lookups: LookupRow[] = [
    ...classified.accept.map((r) => ({ quote: r.quote, requestedDate: date, rateDate: r.date, source })),
    // A held value becomes coverage the moment it is accepted.
    ...classified.hold.map((h) => ({ quote: h.quote, requestedDate: date, rateDate: h.date, source: h.source as FxSource })),
  ];
  if (lookups.length > 0) await deps.upsertLookups(lookups);

  result.relax = [...new Set(classified.accept.map((r) => r.quote))].sort();
  result.held = [...new Set(classified.hold.map((h) => h.quote))].sort();
  if (result.relax.length > 0) await deps.clearFailures(date, result.relax);
  return result;
}

export async function resolveRate(deps: ResolveDeps, input: unknown): Promise<ResolveResult> {
  if (input === null || typeof input !== 'object') return invalidInput();
  const body = input as Record<string, unknown>;

  // Validate before the throttle: a malformed request costs nothing.
  let run: ((ctx: Ctx) => Promise<ResolveResult>) | null = null;
  if ('transactionId' in body) {
    const { transactionId } = body;
    if (typeof transactionId !== 'string' || !UUID_RE.test(transactionId)) return invalidInput();
    run = (ctx) => handleA(ctx, transactionId);
  } else if ('transactionIds' in body) {
    const { transactionIds } = body;
    if (
      !Array.isArray(transactionIds) ||
      transactionIds.length < 1 ||
      transactionIds.length > MAX_IDS ||
      !transactionIds.every((id) => typeof id === 'string' && UUID_RE.test(id)) ||
      new Set(transactionIds).size !== transactionIds.length
    ) {
      return invalidInput();
    }
    const ids = transactionIds as string[];
    run = (ctx) => handleB(ctx, ids);
  } else if ('ensure' in body) {
    const ensure = body.ensure;
    if (ensure === null || typeof ensure !== 'object') return invalidInput();
    const { date, currencies } = ensure as Record<string, unknown>;
    if (
      typeof date !== 'string' ||
      !isRealDate(date) ||
      date < MIN_DATE ||
      date > addDays(deps.today(), 1) ||
      !Array.isArray(currencies) ||
      currencies.length < 1 ||
      currencies.length > MAX_IDS ||
      !currencies.every((c) => typeof c === 'string' && CODE_RE.test(c))
    ) {
      return invalidInput();
    }
    const codes = currencies as string[];
    run = (ctx) => handleC(ctx, date, codes);
  } else {
    return invalidInput();
  }

  // IN-B01: any DB or RPC failure (including a read with an anon-key JWT)
  // answers with the same {ok:false} shape as every other failure, never a
  // bare 500 the client's D-19 classifier cannot read. The underlying
  // message is not echoed back.
  const ctx: Ctx = { deps, autoAcceptDone: false, notifyNeeded: false };
  let result: ResolveResult;
  try {
    // RD-05: checked before any other work; one count per call, whatever the shape.
    if (!(await deps.checkRateLimit())) return { status: 429, body: { ok: false, error: 'rate-limited' } };
    result = await run(ctx);
  } catch {
    result = { status: 500, body: { ok: false, error: 'internal' } };
  }

  if (ctx.notifyNeeded) {
    try {
      await deps.notify();
    } catch {
      // an email failure never fails the user's call
    }
  }
  return result;
}

async function handleA(ctx: Ctx, transactionId: string): Promise<ResolveResult> {
  const { deps } = ctx;
  const row = await deps.readPending(transactionId);
  if (row === null) return { status: 404, body: { ok: false, error: 'not-found' } };

  if (!row.rate_pending) {
    return { status: 200, body: { ok: true, pending: false, row: row as unknown as Record<string, unknown> } };
  }

  const quotes = new Set<string>();
  await resolveQuote(deps, row.created_by, row.original_currency, quotes);
  await resolveQuote(deps, row.created_by, row.home_currency, quotes);

  // WR-B01: only the quotes whose backfilled row actually reached fx_rates
  // may be stamped exact from a rate older than 7 days.
  const { relax, outcome } = await resolveDate(ctx, row.local_date, quotes);
  if (outcome === 'both-failed') return upstream();

  const restamped = await deps.restamp(transactionId, relax);
  return {
    status: 200,
    body: { ok: true, pending: Boolean((restamped as { rate_pending?: boolean }).rate_pending), row: restamped },
  };
}

async function handleB(ctx: Ctx, ids: string[]): Promise<ResolveResult> {
  const { deps } = ctx;
  const visible = await deps.readPendingMany(ids);
  if (visible.length === 0) return { status: 404, body: { ok: false, error: 'not-found' } };

  const byId = new Map<string, Record<string, unknown>>(visible.map((r) => [r.id, r as unknown as Record<string, unknown>]));
  const pendingByDate = new Map<string, PendingTransaction[]>();
  for (const r of visible) {
    if (!r.rate_pending) continue;
    pendingByDate.set(r.local_date, [...(pendingByDate.get(r.local_date) ?? []), r]);
  }

  let fetched = 0;
  let failed = 0;
  for (const date of [...pendingByDate.keys()].sort()) {
    const group = pendingByDate.get(date)!;
    const quotes = new Set<string>();
    for (const r of group) {
      await resolveQuote(deps, r.created_by, r.original_currency, quotes);
      await resolveQuote(deps, r.created_by, r.home_currency, quotes);
    }
    const { relax, outcome } = await resolveDate(ctx, date, quotes);
    if (outcome !== 'none-needed') fetched += 1;
    if (outcome === 'both-failed') {
      failed += 1;
      continue; // not restamped: returned as read
    }
    for (const r of group) byId.set(r.id, await deps.restamp(r.id, relax));
  }

  if (fetched > 0 && failed === fetched) return upstream();
  return { status: 200, body: { ok: true, rows: ids.filter((id) => byId.has(id)).map((id) => byId.get(id)!) } };
}

async function handleC(ctx: Ctx, date: string, currencies: string[]): Promise<ResolveResult> {
  const { deps } = ctx;
  const owner = await deps.callerId();
  const quotes = new Set<string>();
  for (const code of new Set(currencies)) await resolveQuote(deps, owner, code, quotes);

  const { relax, outcome } = await resolveDate(ctx, date, quotes);
  if (outcome === 'both-failed' || outcome === 'nothing-usable') return upstream();
  return { status: 200, body: { ok: true, stored: relax } };
}
