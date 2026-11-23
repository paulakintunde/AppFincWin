/**
 * 10-17 (DAT-06): builds the support file. Pure: every value arrives through `DiagnosticDeps`, which has no place for a
 * record (no amounts, payees, notes, names or other people's ids). The preview text and the sent text are the same string.
 */
import type { QueryClient } from '@tanstack/react-query';
import { DIAGNOSTIC_FIELDS, MAX_ERROR_CODES, type DiagnosticKey } from './diagnosticFields';

export interface DiagnosticDeps {
  appVersion: string;
  buildNumber: string;
  os: string;
  deviceModel: string;
  locale: string;
  region: string | null;
  featureLevel: number | null;
  planState: string;
  queueSize: number;
  queueOldestAgeMinutes: number | null;
  failedWrites: number;
  lastSyncedAt: number | null;
  onlineNow: boolean;
  recentErrorCodes: readonly string[];
  rowCounts: Readonly<Record<string, number>>;
}

export interface Diagnostic {
  fields: Partial<Record<DiagnosticKey, string>>;
  text: string;
}

/** Plain label text only: no control characters, short. Version, model and locale strings are device facts, never records. */
function plain(value: string | null | undefined, max = 60): string {
  if (!value) return 'unknown';
  return value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) || 'unknown';
}

function whole(n: number | null): string {
  return n === null || !Number.isFinite(n) ? 'none' : String(Math.max(0, Math.round(n)));
}

const CODE = /^[A-Za-z0-9_.:-]{1,40}$/;
const TABLE = /^[a-z][a-z0-9_-]{0,40}$/;

export function buildDiagnostic(deps: DiagnosticDeps): Diagnostic {
  const codes = deps.recentErrorCodes.filter((c) => CODE.test(c)).slice(0, MAX_ERROR_CODES);
  const counts = Object.entries(deps.rowCounts)
    .filter(([name, n]) => TABLE.test(name) && Number.isInteger(n) && n >= 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, n]) => `${name}=${n}`);

  const all: Record<DiagnosticKey, string> = {
    appVersion: plain(deps.appVersion),
    buildNumber: plain(deps.buildNumber),
    os: plain(deps.os),
    deviceModel: plain(deps.deviceModel),
    locale: plain(deps.locale),
    region: plain(deps.region),
    featureLevel: whole(deps.featureLevel),
    planState: plain(deps.planState),
    queueSize: whole(deps.queueSize),
    queueOldestAgeMinutes: whole(deps.queueOldestAgeMinutes),
    failedWrites: whole(deps.failedWrites),
    lastSyncedAt: deps.lastSyncedAt === null ? 'never' : new Date(deps.lastSyncedAt).toISOString(),
    onlineNow: deps.onlineNow ? 'yes' : 'no',
    recentErrorCodes: codes.length > 0 ? codes.join(', ') : 'none',
    rowCounts: counts.length > 0 ? counts.join(', ') : 'none',
  };

  const fields: Partial<Record<DiagnosticKey, string>> = {};
  for (const key of DIAGNOSTIC_FIELDS) fields[key] = all[key];
  const text = DIAGNOSTIC_FIELDS.map((key) => `${key}: ${all[key]}`).join('\n');
  return { fields, text };
}

/** Counts of cached rows per kind of record, from the query cache. Reads array lengths only, never row contents. */
export function rowCountsFromCache(qc: QueryClient): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const query of qc.getQueryCache().getAll()) {
    const head = query.queryKey[0];
    const data = query.state.data;
    if (typeof head !== 'string' || !Array.isArray(data)) continue;
    counts[head] = (counts[head] ?? 0) + data.length;
  }
  return counts;
}
