/**
 * Custom options and the emergency-purpose rule (05.1, D-19, I38). Custom options are plain data; their names never
 * reach the engine. A deleted custom option resolves to a preset fallback with a reason and never throws, so a recorded
 * decision is never recomputed differently (I42).
 */
import { CADENCE_EVERY_MAX, CADENCE_EVERY_MIN, EMERGENCY_PURPOSES, MAX_CUSTOM_OPTIONS, MAX_OWN_QUESTIONS } from '../constants';
import type { Cadence, CountsAs, CustomOptions, IncomeKind, ItemTypeRef, OwnQuestion, Purpose, QuestionId, ReasonCode, V3PresetItemType } from '../types';
import { PRESET_QUESTIONS, questionSpec } from './presetQuestions';

/** I38: only the preset purposes necessity and for_work can use the emergency fund; a custom purpose never can. */
export function canUseEmergency(p: Purpose | null): boolean {
  return p !== null && p.kind === 'preset' && (EMERGENCY_PURPOSES as readonly string[]).includes(p.value);
}

export type OptionsProblem =
  | 'too_many_item_types'
  | 'too_many_purposes'
  | 'too_many_cadences'
  | 'too_many_income_kinds'
  | 'too_many_own_questions'
  | 'own_question_invalid'
  | 'cadence_out_of_range'
  | 'duplicate_id'
  | 'unknown_question';

const OWN_CADENCES: readonly string[] = ['monthly', 'yearly', 'one_off'];

function cadenceInRange(c: Cadence): boolean {
  return (c.unit === 'week' || c.unit === 'month') && Number.isInteger(c.every) && c.every >= CADENCE_EVERY_MIN && c.every <= CADENCE_EVERY_MAX;
}

function hasDuplicate(ids: readonly string[]): boolean {
  return new Set(ids).size !== ids.length;
}

/** [] = valid. Reports each problem once. */
export function validateCustomOptions(c: CustomOptions): readonly OptionsProblem[] {
  const out = new Set<OptionsProblem>();
  if (c.itemTypes.length > MAX_CUSTOM_OPTIONS) out.add('too_many_item_types');
  if (c.purposes.length > MAX_CUSTOM_OPTIONS) out.add('too_many_purposes');
  if (c.cadences.length > MAX_CUSTOM_OPTIONS) out.add('too_many_cadences');
  if (c.incomeKinds.length > MAX_CUSTOM_OPTIONS) out.add('too_many_income_kinds');
  if (c.cadences.some((x) => !cadenceInRange(x))) out.add('cadence_out_of_range');
  if (hasDuplicate(c.itemTypes.map((t) => t.id)) || hasDuplicate(c.purposes.map((p) => p.id)) || hasDuplicate(c.incomeKinds.map((k) => k.id))) out.add('duplicate_id');
  for (const t of c.itemTypes) {
    if (t.ownQuestions.length > MAX_OWN_QUESTIONS) out.add('too_many_own_questions');
    for (const id of t.questionIds) if (questionSpec(id) === null) out.add('unknown_question');
    for (const o of t.ownQuestions) {
      if (o.label.trim() === '' || !OWN_CADENCES.includes(o.cadence) || typeof o.cash !== 'boolean') out.add('own_question_invalid');
    }
    const ids = [...t.questionIds, ...t.ownQuestions.map((o) => o.id)];
    if (hasDuplicate(ids)) out.add('duplicate_id');
  }
  return [...out];
}

export interface ResolvedItemType {
  readonly base: V3PresetItemType;
  readonly questionIds: readonly QuestionId[];
  readonly ownQuestions: readonly OwnQuestion[];
  readonly reasons: readonly ReasonCode[];
}

/** Presets and missing customs return no own questions. A missing custom falls back to 'general' with its questions. */
export function resolveItemType(ref: ItemTypeRef, c: CustomOptions): ResolvedItemType {
  if (ref.kind === 'preset') return { base: ref.value, questionIds: PRESET_QUESTIONS[ref.value], ownQuestions: [], reasons: [] };
  const found = c.itemTypes.find((t) => t.id === ref.id);
  if (!found) return { base: 'general', questionIds: PRESET_QUESTIONS.general, ownQuestions: [], reasons: ['custom_option_missing'] };
  return {
    base: found.base,
    questionIds: found.questionIds.filter((id) => questionSpec(id) !== null),
    ownQuestions: found.ownQuestions,
    reasons: [],
  };
}

const FALLBACK_CADENCE: Cadence = Object.freeze({ unit: 'month', every: 1 });

/** Custom cadences carry no id, so they are referenced by position. A missing or out-of-range one falls back to monthly. */
export function resolveCadence(index: number, c: CustomOptions): { readonly cadence: Cadence; readonly reasons: readonly ReasonCode[] } {
  const found = Number.isInteger(index) && index >= 0 ? c.cadences[index] : undefined;
  if (!found || !cadenceInRange(found)) return { cadence: FALLBACK_CADENCE, reasons: ['custom_option_missing'] };
  return { cadence: found, reasons: [] };
}

/**
 * An explicit line or series countsAs wins; otherwise a custom kind's countsAs; otherwise null (not counted until
 * the user marks it, v3 §4.2).
 */
export function resolveIncomeKind(k: IncomeKind | null, lineCountsAs: CountsAs, c: CustomOptions): { readonly countsAs: CountsAs; readonly reasons: readonly ReasonCode[] } {
  if (lineCountsAs !== null) return { countsAs: lineCountsAs, reasons: [] };
  if (k === null) return { countsAs: null, reasons: [] };
  if (k.kind === 'custom') {
    const found = c.incomeKinds.find((x) => x.id === k.id);
    if (!found) return { countsAs: null, reasons: ['custom_option_missing'] };
    if (found.countsAs !== null) return { countsAs: found.countsAs, reasons: [] };
  }
  return { countsAs: null, reasons: ['income_kind_unmarked'] };
}
