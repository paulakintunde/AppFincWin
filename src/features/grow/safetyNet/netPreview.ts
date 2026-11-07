// 06-16 (G04a, criterion 7, T-06-16-01): what Decide's open checks would read with a different safety-net size. PURE: no React, no I/O.
// It re-judges each open check with the same computeV3 Decide uses, on a copy of the snapshot source whose flagged goal has the
// new size (06-10 reads the net from the flagged goal), so the preview and the next real answer cannot differ.
import { readStoredCheck, type Result } from '@/engine/decide/v3';
import type { SnapshotSource } from '@/features/decide/snapshot/buildSnapshot';
import { computeV3, preparedV3 } from '@/features/decide/snapshot/v3/computeV3';
import type { V3SettingsSource } from '@/features/decide/snapshot/v3/types';

/** The short state a check reads as. 'dips' = the answer uses the safety net; 'notYet' covers every answer that is not a fit. */
export type NetStateCode = 'fits' | 'tight' | 'dips' | 'notYet' | 'needsInput';

export function netStateOf(result: Pick<Result, 'code' | 'variant'>): NetStateCode {
  switch (result.code) {
    case 'needs_input':
      return 'needsInput';
    case 'not_yet':
    case 'monthly_short':
      return 'notYet';
    case 'emergency_use':
    case 'fits_uses_net':
      return 'dips';
    default:
      return result.variant === 'tight' ? 'tight' : 'fits';
  }
}

export interface PreviewCheck {
  id: string;
  name: string;
  inputs: unknown;
}

export interface NetPreviewRow {
  id: string;
  name: string;
  /** The price as stored (minor units), or null when the check has none yet. */
  price: number | null;
  before: NetStateCode;
  after: NetStateCode;
}

/** The source with the flagged goal at `size`; with no flagged goal a locked, protected one is added (what "Set a size" makes). */
export function withNetSize(source: SnapshotSource, size: number): SnapshotSource {
  const has = source.goals.some((g) => g.is_safety_net === true && g.deleted_at === null);
  if (has) {
    return { ...source, goals: source.goals.map((g) => (g.is_safety_net === true && g.deleted_at === null ? { ...g, target: size } : g)) };
  }
  const added = {
    id: 'preview-safety-net',
    kind: 'pot' as const,
    check_id: null,
    currency: source.homeCurrency,
    target: size,
    monthly_amount: null,
    ready_by: null,
    opening_saved: 0,
    done_at: null,
    deleted_at: null,
    name: 'Safety net',
    is_safety_net: true,
    locked: true,
    protect: true,
  };
  return { ...source, goals: [...source.goals, added] };
}

export interface PreviewArgs {
  source: SnapshotSource;
  v3: V3SettingsSource | null;
  checks: readonly PreviewCheck[];
  newSize: number;
}

function priceOf(inputs: unknown): number | null {
  const price = readStoredCheck(inputs).check.price;
  return price === null ? null : Number(price);
}

export function previewNetSize({ source, v3, checks, newSize }: PreviewArgs): NetPreviewRow[] {
  const changed = withNetSize(source, newSize);
  return checks.map((c) => ({
    id: c.id,
    name: c.name,
    price: priceOf(c.inputs),
    before: netStateOf(computeV3(source, v3, c.inputs, undefined, c.id).result),
    after: netStateOf(computeV3(changed, v3, c.inputs, undefined, c.id).result),
  }));
}

/** One usual month of essential costs: the engine's own starter size (minor units), or null when it cannot be read. */
export function essentialMonthOf(source: SnapshotSource, v3: V3SettingsSource | null): number | null {
  const reading = preparedV3(source, v3).prepared.readings[0];
  return reading === undefined ? null : Number(reading.net.starter);
}

/** Weeks of a usual month that `amount` covers, rounded to the nearest half week (a month is 52/12 weeks). Null when no month is known. */
export function coverWeeks(amount: number, monthly: number | null): number | null {
  if (monthly === null || monthly <= 0 || amount < 0) return null;
  return Math.round(((amount / monthly) * (52 / 12)) * 2) / 2;
}
