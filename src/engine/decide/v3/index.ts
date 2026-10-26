/**
 * Public API of engine/decide/v3 (05.1). The only path features/ may import (depcruise decide-engine-barrel-only).
 * Never re-exported from ../index.ts: the old barrel surface is pinned by engineBarrel.test.ts and public-api.test.ts,
 * and the old engine is deleted 2 weeks after switch-on (D-16).
 * Named exports only (no `export *` of modules) so the surface is reviewable and pinned by barrel.test.ts.
 */
export type * from './types';
export * from './constants';

export { buildMonthModel } from './month/model';
export { detectCandidates } from './month/recurring';
export type { DetectContext, DetectRow } from './month/recurring';
export { seriesDrift } from './month/series';
export type { SeriesDrift } from './month/series';
export { homeThresholds } from './bandEdges';
export type { UsdRate } from './bandEdges';
export { bandOf, layersFor } from './judge/bands';
export { canUseEmergency, validateCustomOptions } from './judge/options';
export type { OptionsProblem, ResolvedItemType } from './judge/options';
export { PRESET_QUESTIONS, QUESTION_LIBRARY, V3_ITEM_TYPES } from './judge/presetQuestions';
export type { QuestionSpec } from './judge/presetQuestions';
export { buildSchedule } from './plan/schedule';
export type { ScheduleInput, ScheduleOutcome } from './plan/schedule';
export { monthlyEquivalentOf } from './plan/cadence';
export { planCard } from './plan/planCard';
export type { PlanCard, PlanCardInput } from './plan/planCard';
export { checkQuoted } from './plan/quoted';
export type { QuotedCheck, QuotedInput } from './plan/quoted';
