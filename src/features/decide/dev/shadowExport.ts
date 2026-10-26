// D-27: development-only. Never reachable in release: the only caller is ShadowExportDevMenu, mounted behind __DEV__.
// PURE. The owner-local shadow source (D-17): the signed-in household's SnapshotSource, its v3 settings and its checks, as one
// JSON string. No auth tokens, emails or other households. The file is written to the device by the dev menu, pulled by hand
// and read only by the owner-local Jest tier; the name matches the .gitignore patterns and it is never committed.
import type { DecideCheckRow } from '@/db/decideChecks';
import type { SnapshotSource } from '../snapshot/buildSnapshot';
import type { V3SettingsSource } from '../snapshot/v3/types';

export const SHADOW_SOURCE_FORMAT = 'fincwin-shadow-source';
export const SHADOW_SOURCE_VERSION = 1;

export interface ShadowCheck {
  id: string;
  kind: 'buy' | 'invest';
  name: string;
  status: DecideCheckRow['status'];
  inputs: Record<string, unknown>;
  last_seen_state: DecideCheckRow['last_seen_state'];
}

export interface ShadowSourceFile {
  format: typeof SHADOW_SOURCE_FORMAT;
  version: typeof SHADOW_SOURCE_VERSION;
  householdId: string;
  today: string;
  source: SnapshotSource;
  v3Settings: V3SettingsSource | null;
  checks: ShadowCheck[];
}

export interface ShadowExportArgs {
  source: SnapshotSource;
  v3Settings: V3SettingsSource | null;
  checks: readonly DecideCheckRow[];
  householdId: string;
  today: string;
}

/** Open and saved (not deleted) checks of the one household, reduced to the fields the comparison reads. */
export function serializeShadowSource(args: ShadowExportArgs): string {
  const checks: ShadowCheck[] = args.checks
    .filter((c) => c.deleted_at == null && c.household_id === args.householdId)
    .map((c) => ({
      id: c.id,
      kind: c.kind,
      name: c.name,
      status: c.status,
      inputs: c.inputs,
      last_seen_state: c.last_seen_state,
    }));
  const file: ShadowSourceFile = {
    format: SHADOW_SOURCE_FORMAT,
    version: SHADOW_SOURCE_VERSION,
    householdId: args.householdId,
    today: args.today,
    source: args.source,
    v3Settings: args.v3Settings,
    checks,
  };
  return JSON.stringify(file);
}

/** Round-trips serializeShadowSource; any other format, version or malformed text returns null. Never throws. */
export function parseShadowSource(text: string): ShadowSourceFile | null {
  try {
    const o = JSON.parse(text) as Partial<ShadowSourceFile> | null;
    if (o === null || typeof o !== 'object') return null;
    if (o.format !== SHADOW_SOURCE_FORMAT || o.version !== SHADOW_SOURCE_VERSION) return null;
    if (typeof o.householdId !== 'string' || typeof o.today !== 'string') return null;
    if (typeof o.source !== 'object' || o.source === null || !Array.isArray(o.checks)) return null;
    return o as ShadowSourceFile;
  } catch {
    return null;
  }
}
