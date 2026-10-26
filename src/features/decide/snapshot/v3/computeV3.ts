// PURE. The single v3 compute function (S9: one Result). Home, the check screen and saved plans all call computeV3 through the
// three one-line delegates below; there is no second path. Nothing in the app calls this in 05.1: DECIDE_OPEN and DECIDE_V3
// stay false and the switch is read only in decideEngine() (D-15). Barrel imports only (the v3 engine barrel).
import {
  changeSinceLooked,
  evaluate,
  readStoredCheck,
  type ChangeReason,
  type CheckV2,
  type Evaluation,
  type LegacyState,
  type Result,
  type SeenV3,
} from '@/engine/decide/v3';
import { currencyCode } from '@/engine/money';
import { buildDecideSnapshot, type SnapshotSource } from '../buildSnapshot';
import { parseCheckInputs } from '../checkInputs';
import { inHomeCurrency } from '../checkCurrency';
import type { SnapshotResult } from '../types';
import { buildV3Inputs } from './buildV3Inputs';
import type { V3SettingsSource } from './types';

/**
 * The stored check as a CheckV2. A v2 reads as stored; a v1 is upgraded. A v1 typed in another currency is converted with the
 * existing converter at the latest stored rate and marked foreign at today's rate (D-09); with no stored rate it carries no
 * price, so it reads as needing input rather than a guessed figure (D-37).
 */
function checkOf(storedInputs: unknown, source: SnapshotSource, built: SnapshotResult): CheckV2 {
  const stored = typeof storedInputs === 'object' && storedInputs !== null ? (storedInputs as { v?: unknown }) : {};
  if (stored.v === 2) return readStoredCheck(storedInputs).check;
  const view = inHomeCurrency(parseCheckInputs(storedInputs, source.today), built, { isSample: false });
  if (view.kind === 'home') return readStoredCheck(storedInputs).check;
  if (view.kind === 'converted') {
    const check = readStoredCheck(view.inputs).check;
    return { ...check, foreign: { currency: currencyCode(view.note.from), atTodaysRate: true } };
  }
  const check = readStoredCheck(storedInputs).check;
  return { ...check, price: null, foreign: { currency: currencyCode(view.unconverted.currencies[0] as string), atTodaysRate: true } };
}

export function computeV3(source: SnapshotSource, v3: V3SettingsSource | null, storedInputs: unknown): Evaluation {
  const built = buildDecideSnapshot(source);
  return evaluate(buildV3Inputs(source, v3, built), checkOf(storedInputs, source, built));
}

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
  storedInputs: unknown
): { readonly result: Result; readonly changed: boolean; readonly reasons: readonly ChangeReason[]; readonly seen: SeenV3 } {
  const result = computeV3(source, v3, storedInputs).result;
  return { result, ...changeSinceLooked(prev, result) };
}
