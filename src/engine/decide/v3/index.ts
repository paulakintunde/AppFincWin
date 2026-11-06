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
export { homeThresholds, maxCheckPrice } from './bandEdges';
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
// 05.4 FIN-27 (D-19, ARC-25): the one owner of region tax defaults; the check sheet pre-fills the rate from it (screens in 08.1).
export { lookupTaxDefault, INCLUDED_COUNTRIES } from './tax/lookup';
export type { TaxDefaultLookup } from './tax/lookup';
export type { TaxBasis } from './tax/defaults';
export type { PlanCard, PlanCardInput } from './plan/planCard';
export { checkQuoted } from './plan/quoted';
export type { QuotedCheck, QuotedInput } from './plan/quoted';
export { evaluate } from './evaluate';
export { prepare, judgeCheck } from './prepare';
// 05.4 BO-05 (05.4-27, Variant C): what a purchase replaces, cash and installments from one input, and the save-for-it ready date.
export { judgeBoth } from './fullCost/cashAndPlan';
export type { BothResults } from './fullCost/cashAndPlan';
export { saveForItReadyDate } from './fullCost/saveForIt';
export { stoppedCostFlows, saleFlows } from './fullCost/replaces';
// 05.4 FIN-09 (05.4-24, D-22..D-24): Decide Home's month figure, the same one every answer's afterBuy starts from (screens in 08.1).
export { homeFigure, monthAfterPlans } from './afterBuy';
export type { Prepared } from './prepare';
export { unspentSum } from './funds/build';
export type { Evaluation } from './evaluate';
export { readStoredCheck, parseCheckV2, toStoredV2 } from './adapters/inputsV2';
export { upgradeInputs, legacyLimits, legacyStateOf } from './adapters/legacy';
export type { LegacyCheckInputsV1, LegacyLineSettings } from './adapters/legacy';
export { changeSinceLooked, seenOf } from './adapters/seen';
export type { SeenV3, ChangeReason } from './adapters/seen';
export { cheaperOption, insteadFutures, FUTURE_ORDER, OPTION_ORDER, orderOptions } from './instead/futures';
export type { CheaperOption, FutureKind, Futures } from './instead/futures';
export { explore } from './instead/explorer';
export { VERDICT_TABLE, verdictRowFor, NOTICE_KEYS, FACT_KEYS, MISSING_KEYS, READINESS_KEYS, FOOTER_KEY, FACT_VALUE_KEYS, NOTICE_VALUE_KEYS, COPY_RESOLVERS, DISCRIMINATOR_KEYS, AFTER_BUY_KEYS, MISSING_VALUE_SOURCE, BASIS_KEYS, BASIS_REASON_KEYS, BASIS_VALUE_KEYS, NEXT_STEP_KEYS, FACT_ACTION_KEYS, DISCLAIMER_KEYS, ABOUT_KEYS, INTRO_KEYS, TAX_KEYS, CAVEAT_KEYS, CAVEAT_VALUE_KEYS, CAVEAT_FIGURE_KEYS, CAVEAT_WRONG_FIGURE_KEY, PLAN_LABEL_KEYS } from './copy/verdictTable';
export { CAVEAT_ORDER, LONG_PLAN_MONTHS } from './caveats'; // 05.4-37 D-64 (4), D-119
export { FREE_HELP, freeHelpFor } from './help/freeHelp'; // 05.4-38 CMP-F04 (D-122..D-125): the About sheet reads the same table
export type { FreeHelpEntry } from './help/freeHelp';
// 05.4 FIN-25 / ENG-18: the reason weights and audiences, so screens show every 'answer' reason in the engine's order.
export { REASON_WEIGHT, REASON_AUDIENCE } from './confidence/reasons';
export type { VerdictRow } from './copy/verdictTable';
export { builtinLines } from './judge/lines';
export { cadenceOfFreq } from './plan/cadence';
// 05.3-13 (DSV-13): the same share rounding the ladder uses, so a recorded amount equals Purchase.dayOne exactly.
export { myPart as myShareOf } from '../share';
// 05.4 BO-08 (05.4-36; D-10..D-13, D-145..D-147): the quiet shadow run's revision, fixed samples and rounding.
export { DECIDE_ENGINE_REVISION } from './shadow/revision';
export { SHADOW_SAMPLE_IDS, shadowSamples } from './shadow/samples';
export type { ShadowSample, ShadowSampleId } from './shadow/samples';
export { roundForShadow, roundSig2, SHADOW_CODES_MAX } from './shadow/round';
export type { ShadowRound } from './shadow/round';
export { shadowRun } from './shadow/run';
export type { ShadowAnswer, ShadowRun } from './shadow/run';
