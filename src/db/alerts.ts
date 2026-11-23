// 10-03 (ALR-01..05): alert switches, delivery preferences and the alert log. Own rows only (RLS); settings, not lock-gated.
// Money thresholds are integer minor units. alert_log is written by the server only; the client reads it.
import { toDbError } from './errors';
import type { DbClient } from './rows';

export type AlertKind = 'bills_due' | 'over_cap' | 'goal_reached' | 'large_txn' | 'low_balance';

export const ALERT_KINDS: readonly AlertKind[] = ['bills_due', 'over_cap', 'goal_reached', 'large_txn', 'low_balance'];

export interface AlertSetting {
  kind: AlertKind;
  enabled: boolean;
  thresholdMinor: number | null;
  thresholdCurrency: string | null;
  leadDays: 0 | 1 | 3 | null;
  version: number;
}

export interface AlertPrefs {
  mode: 'instant' | 'digest';
  quietEnabled: boolean;
  /** 'HH:MM' */
  quietStart: string;
  quietEnd: string;
  timeZone: string;
  partnerAlerts: boolean;
  version: number;
}

export interface AlertLogEntry {
  id: string;
  kind: AlertKind | 'partner_large' | 'digest';
  params: Record<string, unknown>;
  refTable: string | null;
  refId: string | null;
  raisedAt: string;
  deliveredAt: string | null;
  heldForQuiet: boolean;
  delivery: 'pending' | 'sent' | 'digest' | 'no_device' | 'failed';
}

export const DEFAULT_ALERT_PREFS: AlertPrefs = {
  mode: 'instant',
  quietEnabled: true,
  quietStart: '22:00',
  quietEnd: '07:00',
  timeZone: 'UTC',
  partnerAlerts: true,
  version: 0,
};

/** D-09: what a missing row means. Bills due (1 day ahead) and goal reached are on; the rest are off. */
export const DEFAULT_ALERT_SETTINGS: Readonly<Record<AlertKind, AlertSetting>> = {
  bills_due: { kind: 'bills_due', enabled: true, thresholdMinor: null, thresholdCurrency: null, leadDays: 1, version: 0 },
  over_cap: { kind: 'over_cap', enabled: false, thresholdMinor: null, thresholdCurrency: null, leadDays: null, version: 0 },
  goal_reached: { kind: 'goal_reached', enabled: true, thresholdMinor: null, thresholdCurrency: null, leadDays: null, version: 0 },
  large_txn: { kind: 'large_txn', enabled: false, thresholdMinor: null, thresholdCurrency: null, leadDays: null, version: 0 },
  low_balance: { kind: 'low_balance', enabled: false, thresholdMinor: null, thresholdCurrency: null, leadDays: null, version: 0 },
};

export const ALERT_SETTINGS_COLUMNS = 'kind, enabled, threshold_minor, threshold_currency, lead_days, version';
export const ALERT_PREFS_COLUMNS = 'mode, quiet_enabled, quiet_start, quiet_end, time_zone, partner_alerts, version';
export const ALERT_LOG_COLUMNS = 'id, kind, params, ref_table, ref_id, raised_at, delivered_at, held_for_quiet, delivery';

interface AlertSettingDb {
  kind: AlertKind;
  enabled: boolean;
  threshold_minor: number | string | null;
  threshold_currency: string | null;
  lead_days: number | null;
  version: number;
}

interface AlertPrefsDb {
  mode: AlertPrefs['mode'];
  quiet_enabled: boolean;
  quiet_start: string;
  quiet_end: string;
  time_zone: string;
  partner_alerts: boolean;
  version: number;
}

interface AlertLogDb {
  id: string;
  kind: AlertLogEntry['kind'];
  params: Record<string, unknown> | null;
  ref_table: string | null;
  ref_id: string | null;
  raised_at: string;
  delivered_at: string | null;
  held_for_quiet: boolean;
  delivery: AlertLogEntry['delivery'];
}

/** A typed error for a value the layer refuses to send. */
export class AlertInputError extends TypeError {
  constructor(message: string) {
    super(message);
    this.name = 'AlertInputError';
  }
}

function leadOf(n: number | null): 0 | 1 | 3 | null {
  return n === 0 || n === 1 || n === 3 ? n : null;
}

function settingFromDb(r: AlertSettingDb): AlertSetting {
  // bigint can arrive as a string; the cap is 10^13, inside the safe integer range.
  const t = r.threshold_minor === null ? null : Number(r.threshold_minor);
  return {
    kind: r.kind,
    enabled: r.enabled,
    thresholdMinor: t,
    thresholdCurrency: r.threshold_currency,
    leadDays: leadOf(r.lead_days),
    version: r.version,
  };
}

/** Postgres `time` comes back as 'HH:MM:SS'; the app keeps 'HH:MM'. */
function hhmm(t: string): string {
  return t.length >= 5 ? t.slice(0, 5) : t;
}

function prefsFromDb(r: AlertPrefsDb): AlertPrefs {
  return {
    mode: r.mode,
    quietEnabled: r.quiet_enabled,
    quietStart: hhmm(r.quiet_start),
    quietEnd: hhmm(r.quiet_end),
    timeZone: r.time_zone,
    partnerAlerts: r.partner_alerts,
    version: r.version,
  };
}

/** All five kinds, in order; a kind with no row gets its default. */
export async function fetchAlertSettings(client: DbClient, userId: string): Promise<AlertSetting[]> {
  const { data, error, status } = await client.from('alert_settings').select(ALERT_SETTINGS_COLUMNS).eq('user_id', userId);
  if (error) throw toDbError(error, status);
  const byKind = new Map<AlertKind, AlertSetting>();
  for (const r of (data ?? []) as AlertSettingDb[]) byKind.set(r.kind, settingFromDb(r));
  return ALERT_KINDS.map((k) => byKind.get(k) ?? DEFAULT_ALERT_SETTINGS[k]);
}

export async function upsertAlertSetting(
  client: DbClient,
  userId: string,
  setting: AlertSetting,
  nextVersion: number
): Promise<AlertSetting> {
  if (setting.thresholdMinor !== null && !Number.isSafeInteger(setting.thresholdMinor)) {
    throw new AlertInputError('alert_settings: threshold must be a whole number of minor units');
  }
  const row = {
    user_id: userId,
    kind: setting.kind,
    enabled: setting.enabled,
    threshold_minor: setting.thresholdMinor,
    threshold_currency: setting.thresholdCurrency,
    lead_days: setting.leadDays,
    version: nextVersion,
    updated_at: new Date().toISOString(),
  };
  const { data, error, status } = await client
    .from('alert_settings')
    .upsert(row, { onConflict: 'user_id,kind' })
    .select(ALERT_SETTINGS_COLUMNS)
    .single();
  if (error) throw toDbError(error, status);
  return settingFromDb(data as AlertSettingDb);
}

export async function fetchAlertPrefs(client: DbClient, userId: string): Promise<AlertPrefs> {
  const { data, error, status } = await client.from('alert_prefs').select(ALERT_PREFS_COLUMNS).eq('user_id', userId).maybeSingle();
  if (error) throw toDbError(error, status);
  return data ? prefsFromDb(data as AlertPrefsDb) : { ...DEFAULT_ALERT_PREFS };
}

export async function upsertAlertPrefs(
  client: DbClient,
  userId: string,
  prefs: AlertPrefs,
  nextVersion: number
): Promise<AlertPrefs> {
  const row = {
    user_id: userId,
    mode: prefs.mode,
    quiet_enabled: prefs.quietEnabled,
    quiet_start: prefs.quietStart,
    quiet_end: prefs.quietEnd,
    time_zone: prefs.timeZone,
    partner_alerts: prefs.partnerAlerts,
    version: nextVersion,
    updated_at: new Date().toISOString(),
  };
  const { data, error, status } = await client
    .from('alert_prefs')
    .upsert(row, { onConflict: 'user_id' })
    .select(ALERT_PREFS_COLUMNS)
    .single();
  if (error) throw toDbError(error, status);
  return prefsFromDb(data as AlertPrefsDb);
}

export async function fetchAlertLog(client: DbClient, userId: string, sinceIso: string): Promise<AlertLogEntry[]> {
  const { data, error, status } = await client
    .from('alert_log')
    .select(ALERT_LOG_COLUMNS)
    .eq('user_id', userId)
    .gte('raised_at', sinceIso)
    .order('raised_at', { ascending: false })
    .limit(200);
  if (error) throw toDbError(error, status);
  return ((data ?? []) as AlertLogDb[]).map((r) => ({
    id: r.id,
    kind: r.kind,
    params: r.params ?? {},
    refTable: r.ref_table,
    refId: r.ref_id,
    raisedAt: r.raised_at,
    deliveredAt: r.delivered_at,
    heldForQuiet: r.held_for_quiet,
    delivery: r.delivery,
  }));
}
