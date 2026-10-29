// PURE. The single v3 compute function (S9: one Result). Home, the check screen and saved plans all call computeV3 through the
// three one-line delegates below; there is no second path. Nothing in the app calls this in 05.1: DECIDE_OPEN and DECIDE_V3
// stay false and the switch is read only in decideEngine() (D-15). Barrel imports only (the v3 engine barrel).
import {
  changeSinceLooked,
  type AccountUse,
  evaluate,
  readStoredCheck,
  type ChangeReason,
  type CheckV2,
  type Evaluation,
  type LegacyState,
  type Result,
  type SeenV3,
} from '@/engine/decide/v3';
import { currencyCode, minorUnits, type MinorUnits } from '@/engine/money';
import { buildDecideSnapshot, type SnapshotSource } from '../buildSnapshot';
import { parseCheckInputs } from '../checkInputs';
import { converter, inHomeCurrency } from '../checkCurrency';
import type { SnapshotResult } from '../types';
import { buildV3Inputs } from './buildV3Inputs';
import type { V3SettingsSource } from './types';
import { stripRefunds } from './stripRefunds';

/**
 * The stored check as a CheckV2. A v2 reads as stored; a v1 is upgraded. A v1 typed in another currency is converted with the
 * existing converter at the latest stored rate and marked foreign at today's rate (D-09); with no stored rate it carries no
 * price, so it reads as needing input rather than a guessed figure (D-37).
 */
function checkOf(storedInputs: unknown, source: SnapshotSource, built: SnapshotResult): CheckV2 {
  const stored = typeof storedInputs === 'object' && storedInputs !== null ? (storedInputs as { v?: unknown }) : {};
  if (stored.v === 2) return foreignV2(readStoredCheck(storedInputs).check, built);
  const view = inHomeCurrency(parseCheckInputs(storedInputs, source.today), built, { isSample: false });
  if (view.kind === 'home') return readStoredCheck(storedInputs).check;
  if (view.kind === 'converted') {
    const check = readStoredCheck(view.inputs).check;
    return { ...check, foreign: { currency: currencyCode(view.note.from), atTodaysRate: true } };
  }
  const check = readStoredCheck(storedInputs).check;
  return { ...check, price: null, foreign: { currency: currencyCode(view.unconverted.currencies[0] as string), atTodaysRate: true } };
}

/**
 * L-09 (05.3): a stored v2 check typed in a foreign currency is converted at the latest stored rate, as a v1 check is. Every
 * money amount moves together, in integer minor units; with no stored rate the price is null (needs input), never 1:1.
 * A check with no foreign currency, or one already in the home currency, is returned unchanged.
 */
function foreignV2(check: CheckV2, built: SnapshotResult): CheckV2 {
  const f = check.foreign;
  if (f === null || f.currency === built.currency) return check;
  const conv = converter(built, f.currency, built.currency);
  if (conv === null || conv(check.price ?? 0) === null) return { ...check, price: null };
  // a rate exists: it converts every amount
  const m = (n: number): MinorUnits => minorUnits(conv(n) as number);
  const mo = (n: number | null): MinorUnits | null => (n === null ? null : m(n));
  const pay = check.pay.mode === 'once'
    ? check.pay
    : { ...check.pay, deposit: m(check.pay.deposit), tradeIn: m(check.pay.tradeIn), quotedPayment: mo(check.pay.quotedPayment), fees: { setup: m(check.pay.fees.setup), perPeriod: m(check.pay.fees.perPeriod), end: m(check.pay.fees.end) } };
  const extras = Object.fromEntries(Object.entries(check.extras).map(([k, v]) => [k, m(v)]));
  const value = { ...check.value, earnsMonthly: mo(check.value.earnsMonthly), savesMonthly: mo(check.value.savesMonthly), cheaperPrice: mo(check.value.cheaperPrice) };
  return { ...check, price: mo(check.price), oneOffFees: m(check.oneOffFees), pay, extras, value };
}

/** D-48: the user's saved answer to "can you cover it in your low months" for this check, when there is one. */
function volatileCoverOf(v3: V3SettingsSource | null, checkId: string | null | undefined): boolean | null {
  if (checkId === null || checkId === undefined) return null;
  const hit = (v3?.answers ?? []).find((a) => a.kind === 'volatile_cover' && a.check_id === checkId && a.bool_value !== null);
  return hit === undefined ? null : hit.bool_value;
}

export function computeV3(
  source: SnapshotSource,
  v3: V3SettingsSource | null,
  storedInputs: unknown,
  uses?: Readonly<Record<string, AccountUse>>,
  checkId?: string | null,
  pendingWrites = 0 // L-09: queued, not yet saved writes; above 0 the answer carries the unsaved_changes notice
): Evaluation {
  const built = buildDecideSnapshot(source);
  const check = checkOf(storedInputs, source, built);
  const cover = volatileCoverOf(v3, checkId);
  return evaluate(buildV3Inputs(source, v3, built, uses, pendingWrites), cover === null ? check : { ...check, volatileCover: cover });
}

export interface StoredCheckRef {
  readonly id: string;
  readonly inputs: unknown;
}

/** S9 / criterion 1: one snapshot and one input build for every check on screen; each result equals computeV3 for that check. */
export function computeV3Many(source: SnapshotSource, v3: V3SettingsSource | null, rows: readonly StoredCheckRef[], pendingWrites = 0): ReadonlyMap<string, Evaluation> {
  const out = new Map<string, Evaluation>();
  if (rows.length === 0) return out;
  const built = buildDecideSnapshot(source);
  const inputs = buildV3Inputs(source, v3, built, {}, pendingWrites);
  for (const r of rows) {
    const check = checkOf(r.inputs, source, built);
    const cover = volatileCoverOf(v3, r.id);
    out.set(r.id, evaluate(inputs, cover === null ? check : { ...check, volatileCover: cover }));
  }
  return out;
}

/** D-13: the same check judged on records with every refund link cleared; compared with computeV3 to attribute a better code to a refund. */
export function computeV3WithoutRefunds(source: SnapshotSource, v3: V3SettingsSource | null, storedInputs: unknown, checkId: string | null, pendingWrites = 0): Evaluation {
  const built = buildDecideSnapshot(source);
  const check = checkOf(storedInputs, source, built);
  const cover = volatileCoverOf(v3, checkId);
  return evaluate(stripRefunds(buildV3Inputs(source, v3, built, {}, pendingWrites)), cover === null ? check : { ...check, volatileCover: cover });
}

// v3 screens call computeV3 / computeV3Many with the check id; these three names stay for the follow-up to remove.
// S9: three thin names for 05.3 to call; each is the same function, so the same check gives the same Result everywhere.
export const resultForHome = (source: SnapshotSource, v3: V3SettingsSource | null, storedInputs: unknown): Result => computeV3(source, v3, storedInputs).result;
export const resultForCheck = (source: SnapshotSource, v3: V3SettingsSource | null, storedInputs: unknown): Result => computeV3(source, v3, storedInputs).result;
export const resultForSavedPlan = (source: SnapshotSource, v3: V3SettingsSource | null, storedInputs: unknown): Result => computeV3(source, v3, storedInputs).result;

/**
 * D-20, I42: re-answer a saved plan today. Returns what changed since the user last looked; a legacy or missing previous state
 * re-baselines (C7). The recorded decision (verdict_at_decision) is never an input here, so it can never be touched.
 */
export function reanswerSaved(
  prev: SeenV3 | LegacyState | null,
  source: SnapshotSource,
  v3: V3SettingsSource | null,
  storedInputs: unknown,
  checkId: string | null = null,
  pendingWrites = 0
): { readonly result: Result; readonly changed: boolean; readonly reasons: readonly ChangeReason[]; readonly seen: SeenV3 } {
  const result = computeV3(source, v3, storedInputs, undefined, checkId, pendingWrites).result;
  return { result, ...changeSinceLooked(prev, result) };
}
