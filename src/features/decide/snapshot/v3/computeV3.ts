// PURE. The single v3 compute function (S9: one Result). Home, the check screen and saved plans all call computeV3 through the
// three one-line delegates below; there is no second path. Since 05.4-33 the inputs are prepared once per data change
// (preparedV3) and each check is judged on the held Prepared. Nothing in the app calls this in 05.1: DECIDE_OPEN and DECIDE_V3
// stay false and the switch is read only in decideEngine() (D-15). Barrel imports only (the v3 engine barrel).
import {
  changeSinceLooked,
  type AccountUse,
  judgeCheck,
  prepare,
  readStoredCheck,
  type ChangeReason,
  type CheckV2,
  type Evaluation,
  type LegacyState,
  type Prepared,
  type Result,
  type SeenV3,
  type V3Inputs,
} from '@/engine/decide/v3';
import { currencyCode } from '@/engine/money';
import { perfMark } from '@/features/decide/perf/perfMarks';
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

/** D-48: the user's saved answer to "can you cover it in your low months" for this check, when there is one. */
function volatileCoverOf(v3: V3SettingsSource | null, checkId: string | null | undefined): boolean | null {
  if (checkId === null || checkId === undefined) return null;
  const hit = (v3?.answers ?? []).find((a) => a.kind === 'volatile_cover' && a.check_id === checkId && a.bool_value !== null);
  return hit === undefined ? null : hit.bool_value;
}

/** One build of the v3 inputs: the old snapshot it parses through, the inputs and the check-independent engine work. */
export interface PreparedV3 {
  readonly built: SnapshotResult;
  readonly inputs: V3Inputs;
  readonly prepared: Prepared;
}

interface PreparedEntry extends PreparedV3 {
  readonly v3: V3SettingsSource | null;
  readonly uses: Readonly<Record<string, AccountUse>> | undefined;
  /** 06.1-46 (B-1): the empty-check evaluation, judged once per entry on first ask and shared by every hook. */
  empty?: Evaluation;
}

// 05.4 ENG-13 / APP-03 (05.4-33): build and prepare once per data change. The read hooks memoise `source` and the settings
// source on the query data references, so the same identities mean the same data. Keyed weakly on the source (a dropped
// source frees its entries); a few settings / uses variants are kept per source.
const PREPARED_PER_SOURCE = 4;
const preparedBySource = new WeakMap<SnapshotSource, PreparedEntry[]>();

export function preparedV3(source: SnapshotSource, v3: V3SettingsSource | null, uses?: Readonly<Record<string, AccountUse>>): PreparedV3 {
  const list = preparedBySource.get(source) ?? [];
  const hit = list.find((e) => e.v3 === v3 && e.uses === uses);
  if (hit !== undefined) return hit;
  return preparedMiss(source, v3, uses, list);
}

function preparedMiss(
  source: SnapshotSource,
  v3: V3SettingsSource | null,
  uses: Readonly<Record<string, AccountUse>> | undefined,
  list: PreparedEntry[]
): PreparedEntry {
  perfMark('decide.prepare:start'); // 06.1-46: a miss is the whole build; a hit costs nothing
  const built = buildDecideSnapshot(source);
  const inputs = buildV3Inputs(source, v3, built, uses);
  const entry: PreparedEntry = { v3, uses, built, inputs, prepared: prepare(inputs) };
  perfMark('decide.prepare:end');
  preparedBySource.set(source, [entry, ...list].slice(0, PREPARED_PER_SOURCE));
  return entry;
}

/**
 * 06.1-46 (B-1): the evaluation of an empty check (the home and setup reading), judged once per prepared entry and shared by
 * every hook that asks with the same source and settings. Equal to `computeV3(source, v3, {})`.
 */
export function emptyCheckEvaluation(source: SnapshotSource, v3: V3SettingsSource | null): Evaluation {
  const entry = preparedV3(source, v3) as PreparedEntry;
  if (entry.empty === undefined) entry.empty = computeV3(source, v3, {});
  return entry.empty;
}

/** Judges one stored check on the held Prepared (per key press: only the check-dependent part runs). */
export function computeV3(
  source: SnapshotSource,
  v3: V3SettingsSource | null,
  storedInputs: unknown,
  uses?: Readonly<Record<string, AccountUse>>,
  checkId?: string | null
): Evaluation {
  const { built, prepared } = preparedV3(source, v3, uses);
  const check = checkOf(storedInputs, source, built);
  const cover = volatileCoverOf(v3, checkId);
  return judgeCheck(prepared, cover === null ? check : { ...check, volatileCover: cover });
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
