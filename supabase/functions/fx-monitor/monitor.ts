// runFxMonitor: the testable orchestration behind the fx-monitor Edge
// Function (MON-10, D-09, D-10, D-12, Pitfall 2). index.ts is a thin
// Deno.serve wrapper that builds the real admin client/Resend call and
// invokes this. Zero runtime imports beyond a type-only re-export, so this
// is fully unit-testable in Jest with in-memory fakes -- no Deno runtime, no
// real network, no database. Mirrors fx-sync's sync.ts pattern
// (01-08-SUMMARY.md).

export const STALENESS_DEFAULT_DAYS = 4;

export interface LatestRateRow {
  quote: string;
  rate_date: string;
}

export interface CurrencyRow {
  code: string;
  end_date: string | null;
  staleness_limit_days: number | null;
}

export interface StaleEntry {
  quote: string;
  rateDate: string;
  ageDays: number;
  limitDays: number;
}

export interface AlertInsert {
  kind: string;
  quote?: string | null;
  detail?: Record<string, unknown>;
}

export interface UnsentAlert {
  id: number;
  kind: string;
  quote: string | null;
  detail: Record<string, unknown>;
  created_at: string;
}

export interface MonitorDeps {
  today(): string;
  latestRates(): Promise<LatestRateRow[]>;
  currencies(): Promise<CurrencyRow[]>;
  insertAlerts(alerts: AlertInsert[]): Promise<void>;
  autoAcceptHolds(): Promise<number>;
  /** rpc('fx_restamp_pending'): re-stamps pending rows whose date has arrived; returns how many were re-stamped. */
  restampPending(): Promise<number>;
  pendingRowsCount(): Promise<number>;
  unsentAlerts(): Promise<UnsentAlert[]>;
  markEmailed(ids: number[]): Promise<void>;
  sendEmail(subject: string, text: string): Promise<void>;
}

export interface MonitorResult {
  ok: true;
  stale: number;
  autoAccepted: number;
  restamped: number;
  pendingRows: number;
  emailed: number;
}

/** Whole calendar days between two ISO dates, both read as UTC midnight. */
function daysBetween(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00Z`).getTime();
  const b = new Date(`${to}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

/**
 * A currency is stale when its latest stored rate is older than its limit:
 * the per-currency override if set (D-10), else STALENESS_DEFAULT_DAYS. A
 * currency with an end_date (discontinued) is never flagged -- it will
 * never publish again. A quote with no currencies row at all uses the
 * global default (Pitfall 4: currency metadata sync is best-effort and can
 * lag the rate it describes).
 */
export function findStale(latest: LatestRateRow[], currencies: CurrencyRow[], today: string): StaleEntry[] {
  const byCode = new Map(currencies.map((c) => [c.code, c] as const));
  const stale: StaleEntry[] = [];

  for (const r of latest) {
    const c = byCode.get(r.quote);
    if (c?.end_date) continue;

    const limitDays = c?.staleness_limit_days ?? STALENESS_DEFAULT_DAYS;
    const ageDays = daysBetween(r.rate_date, today);
    if (ageDays > limitDays) {
      stale.push({ quote: r.quote, rateDate: r.rate_date, ageDays, limitDays });
    }
  }

  return stale;
}

/**
 * One digest email per run (T-01-11-04): the subject groups every unsent
 * alert by kind with a count, and the body lists each alert's quote and
 * detail. Currency codes, rates, dates and counts only -- never a user
 * identifier, household id or amount.
 */
export function buildDigest(alerts: UnsentAlert[]): { subject: string; text: string } {
  const counts = new Map<string, number>();
  for (const a of alerts) counts.set(a.kind, (counts.get(a.kind) ?? 0) + 1);

  const subject = `FincWin FX: ${[...counts.entries()].map(([kind, count]) => `${count} ${kind}`).join(', ')}`;
  const text = alerts.map((a) => `[${a.kind}] ${a.quote ?? '-'} ${JSON.stringify(a.detail)}`).join('\n');

  return { subject, text };
}

export async function runFxMonitor(deps: MonitorDeps): Promise<MonitorResult> {
  const today = deps.today();
  const [latest, currencies] = await Promise.all([deps.latestRates(), deps.currencies()]);

  const stale = findStale(latest, currencies, today);
  if (stale.length > 0) {
    await deps.insertAlerts(
      stale.map((s) => ({
        kind: 'stale',
        quote: s.quote,
        detail: { rateDate: s.rateDate, ageDays: s.ageDays, limitDays: s.limitDays },
      }))
    );
  }

  const autoAccepted = await deps.autoAcceptHolds();

  // WR-B01: a future-dated row stays rate_pending until its own day. Re-stamp
  // every due pending row first, so the pending-rows count below only
  // reports rows that are genuinely stuck.
  const restamped = await deps.restampPending();

  const pendingRows = await deps.pendingRowsCount();
  if (pendingRows > 0) {
    await deps.insertAlerts([{ kind: 'pending-rows', detail: { count: pendingRows } }]);
  }

  const unsent = await deps.unsentAlerts();
  let emailed = 0;
  if (unsent.length > 0) {
    const { subject, text } = buildDigest(unsent);
    await deps.sendEmail(subject, text); // a non-2xx throw here propagates, and markEmailed is never reached (retried next day)
    await deps.markEmailed(unsent.map((a) => a.id));
    emailed = unsent.length;
  }

  return { ok: true, stale: stale.length, autoAccepted, restamped, pendingRows, emailed };
}
