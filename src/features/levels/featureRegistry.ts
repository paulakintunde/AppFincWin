// Pure (no React or I/O). Port of the prototype levelFor/applyOnb (FincWin United.dc.html ~3618-3640); tax rule dropped (D-26); cut features removed (D-32).
// Transcribed from the owner-signed 09-LEVEL-MAP.md (2026-11-19). A test parses that file and fails on drift.
// Labels and subs come from copy keys features.items.<id>.label|sub (plan 09-12).
import type { IconName } from '@/ui/icons/iconData';

export type FeatureArea = 'Recording' | 'Accounts' | 'Planning' | 'Grow' | 'System' | 'Sharing';
export type Level = 1 | 2 | 3 | 4;

export interface FeatureDef {
  id: string;
  area: FeatureArea;
  minLevel: Level;
  needsHousehold: boolean;
  /** Plain-words probe id for "holds your records" (D-34); null when there is nothing to hold. */
  holdsData: string | null;
  glyph: IconName;
}

export const LEVELS = [
  { level: 1, key: 'basics' },
  { level: 2, key: 'everyday' },
  { level: 3, key: 'fullPicture' },
  { level: 4, key: 'everything' },
] as const;

export const FEATURES = [
  { id: 'moneyInOut', area: 'Recording', minLevel: 1, needsHousehold: false, holdsData: null, glyph: 'add' },
  { id: 'categories', area: 'Recording', minLevel: 1, needsHousehold: false, holdsData: null, glyph: 'categories' },
  { id: 'search', area: 'Recording', minLevel: 1, needsHousehold: false, holdsData: null, glyph: 'search' },
  { id: 'monthView', area: 'Recording', minLevel: 1, needsHousehold: false, holdsData: null, glyph: 'calendar' },
  { id: 'balances', area: 'Accounts', minLevel: 1, needsHousehold: false, holdsData: null, glyph: 'accounts' },
  { id: 'recurring', area: 'Recording', minLevel: 2, needsHousehold: false, holdsData: 'recurringSeries', glyph: 'payBills' },
  { id: 'cloneMonth', area: 'Recording', minLevel: 2, needsHousehold: false, holdsData: null, glyph: 'calendar' },
  { id: 'refunds', area: 'Recording', minLevel: 2, needsHousehold: false, holdsData: 'refundLinks', glyph: 'undo' },
  { id: 'bulkSelect', area: 'Recording', minLevel: 3, needsHousehold: false, holdsData: null, glyph: 'checkIt' },
  { id: 'searchAllMonths', area: 'Recording', minLevel: 4, needsHousehold: false, holdsData: null, glyph: 'history' },
  { id: 'multiAccount', area: 'Accounts', minLevel: 2, needsHousehold: false, holdsData: 'multipleAccounts', glyph: 'acctCurrent' },
  { id: 'transfers', area: 'Accounts', minLevel: 2, needsHousehold: false, holdsData: 'transfers', glyph: 'transfer' },
  { id: 'reconcile', area: 'Accounts', minLevel: 3, needsHousehold: false, holdsData: 'statementPeriods', glyph: 'checkBuy' },
  { id: 'multiCurrency', area: 'Accounts', minLevel: 3, needsHousehold: false, holdsData: 'foreignCurrency', glyph: 'acctOther' },
  { id: 'caps', area: 'Planning', minLevel: 2, needsHousehold: false, holdsData: 'categoryCaps', glyph: 'stateOverCap' },
  { id: 'comingUp', area: 'Planning', minLevel: 2, needsHousehold: false, holdsData: null, glyph: 'stateDue' },
  { id: 'goals', area: 'Grow', minLevel: 2, needsHousehold: false, holdsData: 'savingsGoals', glyph: 'savings' },
  { id: 'goalContributions', area: 'Grow', minLevel: 2, needsHousehold: false, holdsData: 'goalContributions', glyph: 'acctSavings' },
  { id: 'debts', area: 'Grow', minLevel: 3, needsHousehold: false, holdsData: 'debts', glyph: 'debt' },
  { id: 'payoffPlan', area: 'Grow', minLevel: 3, needsHousehold: false, holdsData: 'debtPlan', glyph: 'acctLoan' },
  { id: 'investing', area: 'Grow', minLevel: 3, needsHousehold: false, holdsData: 'holdings', glyph: 'acctInvestment' },
  { id: 'lots', area: 'Grow', minLevel: 4, needsHousehold: false, holdsData: 'holdingLots', glyph: 'acctPension' },
  { id: 'growthIllustration', area: 'Grow', minLevel: 3, needsHousehold: false, holdsData: null, glyph: 'stateUp' },
  { id: 'calculators', area: 'Grow', minLevel: 3, needsHousehold: false, holdsData: null, glyph: 'view' },
  { id: 'import', area: 'System', minLevel: 3, needsHousehold: false, holdsData: 'importedLines', glyph: 'import' },
  { id: 'pdfImport', area: 'System', minLevel: 3, needsHousehold: false, holdsData: null, glyph: 'download' },
  { id: 'undoHistory', area: 'System', minLevel: 4, needsHousehold: false, holdsData: null, glyph: 'somethingChanged' },
  { id: 'hh.weightSplit', area: 'Sharing', minLevel: 2, needsHousehold: true, holdsData: 'weightSplits', glyph: 'household' },
  { id: 'hh.amountSplit', area: 'Sharing', minLevel: 2, needsHousehold: true, holdsData: 'amountSplits', glyph: 'household' },
  { id: 'hh.categoryDefaults', area: 'Sharing', minLevel: 2, needsHousehold: true, holdsData: 'categoryDefaultSplits', glyph: 'categories' },
  { id: 'hh.sharedAccounts', area: 'Sharing', minLevel: 2, needsHousehold: true, holdsData: 'sharedAccounts', glyph: 'housing' },
  { id: 'hh.settleUp', area: 'Sharing', minLevel: 2, needsHousehold: true, holdsData: 'settlements', glyph: 'settlement' },
] as const satisfies readonly FeatureDef[];

export type FeatureId = (typeof FEATURES)[number]['id'];

const BY_ID = new Map<string, FeatureDef>(FEATURES.map((f) => [f.id, f]));

export function featureById(id: string): FeatureDef | undefined {
  return BY_ID.get(id);
}

/** Ids on by default at a level: every feature at that level or below. */
export function defaultOnAtLevel(level: Level): FeatureId[] {
  return FEATURES.filter((f) => f.minLevel <= level).map((f) => f.id);
}
