/**
 * Public API of `engine/decide/`. Phase 5 (Decide UI) is the consumer: it builds a DecideSnapshot outside engine/ and
 * maps every returned code to the i18n catalogue (D-21; DCU-09's no-advice rule is enforced there). Phase 6 reuses
 * engine/payoff directly. Keep this surface stable.
 */
export * from './types';
export * from './constants';
export * from './marketDefaults';
export * from './currency';
export * from './series';
export * from './money';
export { SOLE_SHARE, resolveShare, memberParts, myPart } from './share';
export type { ShareResolution } from './share';
export { ITEM_TYPES, cardEligibility, suggestItemType } from './cardRule';
export * from './secured';
export * from './plan';
export * from './checkInputs';
export * from './assess';
export * from './bisect';
export * from './options';
export * from './alternatives';
export * from './setbacks';
export * from './wait';
export { potSetAside, totalSetAside } from './pots';
export * from './firstRead';
export * from './projectionRates';
export * from './reserve';
export * from './confidence';
export * from './margins';
export * from './futureChanges';
export * from './runningCostPrompts';
export * from './estimateBias';
export * from './cashPath';
export * from './position';
export * from './stress';
export * from './payback';
export * from './decision';
export * from './investmentViews';
export * from './ownership';
export * from './incomeAtRisk';
export { percent, ZERO_PERCENT } from '../payoff/types';
export type { CurrencyCode, MinorUnits } from '../money/types';
