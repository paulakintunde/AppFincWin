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
export { everydayByMonth } from './month/typical';
export type { EverydayMonth } from './month/typical';
export type { DetectContext, DetectRow } from './month/recurring';
export { seriesDrift } from './month/series';
export type { SeriesDrift } from './month/series';
export { refine, refineNoise } from './month/refine';
export { cardPaidInFullHistory } from './month/cardStatements';
export type { CardLedgerInput } from './month/cardStatements';
export type { RefineCard, RefineCardKind, RefineInput, RefineResult, RefineTrigger } from './month/refine';
export { homeThresholds } from './bandEdges';
export type { UsdRate } from './bandEdges';
export { bandOf, layersFor, insteadLinkFor, stagedRequired, layerOfAnswerKey, visibleLayerAnswers } from './judge/bands';
export { isNeedPurpose, validateCustomOptions } from './judge/options';
export { liveEmergencyOf, withLiveEmergency } from './funds/emergency';
export type { OptionsProblem, ResolvedItemType } from './judge/options';
export { PRESET_QUESTIONS, QUESTION_LIBRARY, V3_ITEM_TYPES, questionSpec } from './judge/presetQuestions';
export type { QuestionSpec } from './judge/presetQuestions';
// 05.3-44: the card-eligibility rule is shared with the old engine; v3 screens reach it here so they never import the old barrel (P-01).
export { cardEligibility } from '../cardRule';
export type { ItemType, CardRule } from '../cardRule';
export { buildSchedule } from './plan/schedule';
export type { ScheduleInput, ScheduleOutcome } from './plan/schedule';
export { monthlyEquivalentOf } from './plan/cadence';
export { planCard, salesTaxOf } from './plan/planCard';
export type { PlanCard, PlanCardInput } from './plan/planCard';
export { checkQuoted } from './plan/quoted';
export type { QuotedCheck, QuotedInput } from './plan/quoted';
export { evaluate } from './evaluate';
export { prepare, judgeCheck } from './prepare';
export type { Prepared } from './prepare';
export { unspentSum } from './funds/build';
export type { Evaluation } from './evaluate';
export { readStoredCheck, parseCheckV2, toStoredV2 } from './adapters/inputsV2';
export { upgradeInputs, legacyLimits, legacyStateOf } from './adapters/legacy';
export type { LegacyCheckInputsV1, LegacyLineSettings } from './adapters/legacy';
export { changeSinceLooked, seenOf } from './adapters/seen';
export type { SeenV3, ChangeReason } from './adapters/seen';
export { insteadFutures, FUTURE_ORDER } from './instead/futures';
export type { Futures } from './instead/futures';
export { explore } from './instead/explorer';
export { VERDICT_TABLE, verdictRowFor, NOTICE_KEYS, FACT_KEYS, MISSING_KEYS, READINESS_KEYS, FOOTER_KEY, FACT_VALUE_KEYS, NOTICE_VALUE_KEYS, COPY_RESOLVERS, DISCRIMINATOR_KEYS, MISSING_VALUE_SOURCE, BASIS_KEYS, BASIS_REASON_KEYS, BASIS_VALUE_KEYS, NEXT_STEP_KEYS, FACT_ACTION_KEYS } from './copy/verdictTable';
// 05.4 FIN-25 / ENG-18: the reason weights and audiences, so screens show every 'answer' reason in the engine's order.
export { REASON_WEIGHT, REASON_AUDIENCE } from './confidence/reasons';
export type { VerdictRow } from './copy/verdictTable';
export { builtinLines } from './judge/lines';
export { cadenceOfFreq } from './plan/cadence';
// 05.3-13 (DSV-13): the same share rounding the ladder uses, so a recorded amount equals Purchase.dayOne exactly.
export { myPart as myShareOf } from '../share';
