// runFxSync: the testable orchestration behind the fx-sync Edge Function
// (MON-06, MON-11, MON-12). index.ts is a thin Deno.serve wrapper that
// builds the real fetch/db and calls this. Zero runtime imports beyond the
// local pure modules, so this is fully unit-testable in Jest with an
// in-memory fake FxSyncDb -- no Deno runtime, no real network, no database.
import { FRANKFURTER_V2_RATES_URL, parseFrankfurterRates, type FxRow } from './parse.ts';
import { OPEN_ER_API_URL, parseOpenErApiRates } from './openErApi.ts';
import { FRANKFURTER_V2_CURRENCIES_URL, parseFrankfurterCurrencies, type CurrencyMeta } from './currencies.ts';
import {
  classifyRates,
  CONFIRM_TOLERANCE,
  type Classification,
  type OpenHold,
  type StoredRate,
} from './plausibility.ts';

export interface FxSyncDb {
  recentRates(sinceDate: string): Promise<StoredRate[]>; // fx_rates base EUR, rate::text, rate_date >= sinceDate
  holds(): Promise<OpenHold[]>; // fx_rate_holds where status in ('held', 'dropped') -- a dropped tuple is terminal (CR-B02)
  upsertRates(rows: FxRow[], source: string): Promise<void>; // onConflict base,quote,rate_date,source
  upsertHolds(rows: Classification['hold']): Promise<void>; // onConflict quote,held_rate_date,source, ignoreDuplicates (never overwrites an existing hold)
  confirmHolds(ids: number[]): Promise<void>; // status 'confirmed', resolved_at now()
  insertAlerts(alerts: Array<{ kind: string; quote?: string; detail?: Record<string, unknown> }>): Promise<void>;
  upsertCurrencies(meta: CurrencyMeta[]): Promise<void>; // onConflict code; iso_numeric,name,symbol,start_date,end_date,synced_at
}

export interface FxSyncDeps {
  fetchJson(url: string): Promise<unknown>;
  db: FxSyncDb;
}

export interface FxSyncResult {
  ok: true;
  source: 'frankfurter-v2' | 'open-er-api';
  accepted: number;
  held: number;
  confirmed: number;
  currencies: number;
}

const HISTORY_WINDOW_DAYS = 14;

function minusDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function earliestDate(rows: FxRow[]): string {
  const today = new Date().toISOString().slice(0, 10);
  return rows.reduce((min, r) => (r.date < min ? r.date : min), rows[0]?.date ?? today);
}

// Frankfurter first; on any throw (fetch failure or a parse error, e.g. the
// v1 shape), fall back to open.er-api and leave a 'fallback-used' alert. If
// both fail, leave a 'sync-failed' alert and rethrow -- nothing else is
// written (T-01-08-04).
async function fetchRates(
  fetchJson: FxSyncDeps['fetchJson'],
  db: FxSyncDb
): Promise<{ rows: FxRow[]; source: 'frankfurter-v2' | 'open-er-api' }> {
  try {
    const rows = parseFrankfurterRates(await fetchJson(`${FRANKFURTER_V2_RATES_URL}?base=EUR`));
    return { rows, source: 'frankfurter-v2' };
  } catch {
    try {
      const rows = parseOpenErApiRates(await fetchJson(`${OPEN_ER_API_URL}/EUR`));
      await db.insertAlerts([
        { kind: 'fallback-used', detail: { reason: 'frankfurter-v2 unreachable or unparsable' } },
      ]);
      return { rows, source: 'open-er-api' };
    } catch (fallbackError) {
      await db.insertAlerts([{ kind: 'sync-failed', detail: { error: (fallbackError as Error).message } }]);
      throw fallbackError;
    }
  }
}

export async function runFxSync({ fetchJson, db }: FxSyncDeps): Promise<FxSyncResult> {
  const { rows, source } = await fetchRates(fetchJson, db);

  const history = await db.recentRates(minusDays(earliestDate(rows), HISTORY_WINDOW_DAYS));
  const holds = await db.holds();

  const classified = classifyRates(rows, history, holds, source);

  if (classified.accept.length > 0) {
    await db.upsertRates(classified.accept, source);
  }

  if (classified.hold.length > 0) {
    await db.upsertHolds(classified.hold);
    await db.insertAlerts(
      classified.hold.map((h) => ({
        kind: 'held',
        quote: h.quote,
        detail: { heldRate: h.rate, priorRate: h.priorRate, changeRatio: h.changeRatio, source: h.source },
      }))
    );
  }

  if (classified.confirm.length > 0) {
    // Group by each confirmation's own (held) source -- a single incoming
    // batch can confirm holds originally written under different sources.
    const bySource = new Map<string, FxRow[]>();
    for (const c of classified.confirm) {
      bySource.set(c.source, [...(bySource.get(c.source) ?? []), c.row]);
    }
    for (const [confirmSource, confirmRows] of bySource) {
      await db.upsertRates(confirmRows, confirmSource);
    }
    await db.confirmHolds(classified.confirm.map((c) => c.holdId));
  }

  // Second-source confirmation within the same run: only when the primary
  // source was Frankfurter and it produced new holds. open.er-api is
  // fetched once more as an independent witness for exactly those held
  // quotes -- its own reading is only a witness; the held Frankfurter row
  // (not the open.er-api value) is what enters fx_rates on confirmation
  // (D-12). Any failure here must never fail the whole run.
  let confirmedBySecondSource = 0;
  if (source === 'frankfurter-v2' && classified.hold.length > 0) {
    try {
      const witnessRows = parseOpenErApiRates(await fetchJson(`${OPEN_ER_API_URL}/EUR`));
      const heldQuotes = new Set(classified.hold.map((h) => h.quote));
      const freshHolds = (await db.holds()).filter((h) => (h.status ?? 'held') === 'held');

      const confirmedRows: FxRow[] = [];
      const confirmedIds: number[] = [];
      for (const witness of witnessRows) {
        if (!heldQuotes.has(witness.quote)) continue;
        const held = freshHolds.find((h) => h.quote === witness.quote);
        if (!held) continue;
        if (Math.abs(Number(witness.rate) / Number(held.heldRate) - 1) <= CONFIRM_TOLERANCE + 1e-9) {
          confirmedRows.push({ base: witness.base, quote: held.quote, rate: held.heldRate, date: held.heldDate });
          confirmedIds.push(held.id);
        }
      }

      if (confirmedRows.length > 0) {
        await db.upsertRates(confirmedRows, source); // source === 'frankfurter-v2' here: the held row's own source
        await db.confirmHolds(confirmedIds);
        confirmedBySecondSource = confirmedIds.length;
      }
    } catch {
      // Second-source failures never fail the run (T-01-08-04 backstop).
    }
  }

  // Currency metadata (D-08): a failure here never fails the rate sync.
  let currencies = 0;
  try {
    const meta = parseFrankfurterCurrencies(await fetchJson(FRANKFURTER_V2_CURRENCIES_URL));
    await db.upsertCurrencies(meta);
    currencies = meta.length;
  } catch {
    // no-op: metadata sync is best-effort
  }

  return {
    ok: true,
    source,
    accepted: classified.accept.length,
    held: classified.hold.length,
    confirmed: classified.confirm.length + confirmedBySecondSource,
    currencies,
  };
}
