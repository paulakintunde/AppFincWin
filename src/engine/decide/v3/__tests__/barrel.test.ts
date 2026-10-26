import * as v3 from '../index';
import type { V3Inputs, CheckV2, Result, MonthModel, Funds, Purchase, Schedule, Limits, HomeThresholds } from '../index';

// Later plans (05.1-16, 05.1-30) extend this list; nobody else edits it.
export const V3_RUNTIME_EXPORTS = [
  'AMOUNT_TOLERANCE_DIVISOR',
  'BAND_EDGES_USD',
  'CADENCE_EVERY_MAX',
  'CADENCE_EVERY_MIN',
  'CASH_PATH_DAYS_V3',
  'CODE_PRECEDENCE',
  'CONFIDENCE_FIRM_MIN_DAY',
  'CONFIDENCE_MIN_MONTHS',
  'EMERGENCY_PURPOSES',
  'LEGACY_STATE_OF_CODE',
  'LOW_MONTH_RANK',
  'MAX_BUILTIN_LINES',
  'MAX_CUSTOM_OPTIONS',
  'MAX_OWN_LINES',
  'MAX_OWN_QUESTIONS',
  'MAX_PLAN_PERIODS',
  'MISSED_PAY_GRACE_DAYS',
  'NEEDS_INPUT_ENTRY_AGE_DAYS',
  'NEEDS_INPUT_MIN_BAND',
  'QUOTED_TOLERANCE_USD',
  'RECURRING_MIN_REPEATS',
  'RECURRING_WINDOWS',
  'SERIES_DRIFT_DIVISOR',
  'SERIES_DRIFT_LAST',
  'TWO_DATE_TOLERANCE_DAYS',
  'UNDER_LOGGED_PACE_PERCENT',
  'UNSPENT_DRIFT_PERCENT_DIVISOR',
  'UNSPENT_DRIFT_USD',
  'UNSPENT_STALE_DAYS',
  'V3_HISTORY_MONTHS',
] as const;

// Compile-only: tsc fails if any of these types leaves the barrel.
type _Gate = [V3Inputs, CheckV2, Result, MonthModel, Funds, Purchase, Schedule, Limits, HomeThresholds];
export type { _Gate };

const surface = (m: object): string[] => Object.keys(m).filter((k) => k !== 'default' && k !== '__esModule').sort();

describe('v3 barrel', () => {
  it('v3 barrel exports exactly this surface', () => {
    expect(surface(v3)).toEqual([...V3_RUNTIME_EXPORTS]);
  });
});
