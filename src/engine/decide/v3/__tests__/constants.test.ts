import { readFileSync } from 'fs';
import { join } from 'path';
import { PAY_MATCH_AFTER_DAYS } from '../../../recurring/payMatch';
import {
  BAND_EDGES_USD,
  CODE_PRECEDENCE,
  INCOME_SWING_CV_PERCENT,
  INCOME_VOLATILE_CV_PERCENT,
  LEGACY_STATE_OF_CODE,
  MATCH_DAYS,
  MISSED_PAY_GRACE_DAYS,
  MISSING_PRIORITY,
  PAY_MATCH_DAYS,
  RECONFIRM_MIN_MONTHS,
  RECURRING_WINDOWS,
  SEASON_CYCLE_MONTHS,
  TWO_DATE_TOLERANCE_DAYS,
  V3_HISTORY_MONTHS,
  V3_VARIABLE_HISTORY_MONTHS,
} from '../constants';
import type { MissingCode } from '../types';

describe('v3 constants.ts citations', () => {
  const lines = readFileSync(join(__dirname, '..', 'constants.ts'), 'utf8')
    .replace(/\r\n/g, '\n')
    .split('\n');

  /** The contiguous // comment lines directly above the line index. */
  function blockAbove(index: number): string[] {
    const block: string[] = [];
    for (let i = index - 1; i >= 0 && lines[i]!.startsWith('//'); i -= 1) block.unshift(lines[i]!);
    return block;
  }

  it('I27 every v3 constant carries its citation', () => {
    const exportIndexes = lines.map((l, i) => (/^export (const|\{)/.test(l) ? i : -1)).filter((i) => i >= 0);
    expect(exportIndexes.length).toBeGreaterThanOrEqual(25);
    for (const i of exportIndexes) {
      const cited = blockAbove(i).some((l) => l.startsWith('// Cite:'));
      expect({ line: lines[i], cited }).toEqual({ line: lines[i], cited: true });
    }
  });

  it('D-23 legacyState table', () => {
    expect(LEGACY_STATE_OF_CODE).toEqual({
      fits_month: 'fits',
      fits_unspent: 'fits',
      monthly_short: 'adjust',
      emergency_use: 'adjust',
      not_yet: 'no',
      needs_input: 'missing',
    });
  });

  it('UP 5.3 precedence', () => {
    expect([...CODE_PRECEDENCE]).toEqual([
      'needs_input',
      'not_yet',
      'monthly_short',
      'emergency_use',
      'fits_unspent',
      'fits_month',
    ]);
  });

  it('D-02 windows ascending and disjoint', () => {
    const windows = [
      RECURRING_WINDOWS.weekly,
      RECURRING_WINDOWS.fortnightly,
      RECURRING_WINDOWS.monthly,
      RECURRING_WINDOWS.quarterly,
      RECURRING_WINDOWS.yearly,
    ];
    for (const [lo, hi] of windows) expect(lo).toBeLessThanOrEqual(hi);
    for (let i = 1; i < windows.length; i += 1) {
      expect(windows[i]![0]).toBeGreaterThan(windows[i - 1]![1]);
    }
  });

  it('O11 14 strictly increasing band edges', () => {
    expect(BAND_EDGES_USD).toHaveLength(14);
    for (let i = 1; i < BAND_EDGES_USD.length; i += 1) {
      expect(BAND_EDGES_USD[i]!).toBeGreaterThan(BAND_EDGES_USD[i - 1]!);
    }
  });

  it('A7 grace equals PAY_MATCH_AFTER_DAYS', () => {
    expect(MISSED_PAY_GRACE_DAYS).toBe(PAY_MATCH_AFTER_DAYS);
  });

  it('gap-closure constants stay tied to the ones they cite', () => {
    expect(PAY_MATCH_DAYS).toBe(MISSED_PAY_GRACE_DAYS);
    expect(RECONFIRM_MIN_MONTHS).toBe(V3_VARIABLE_HISTORY_MONTHS);
    expect(SEASON_CYCLE_MONTHS).toBe(V3_VARIABLE_HISTORY_MONTHS);
    expect(INCOME_VOLATILE_CV_PERCENT).toBeGreaterThan(INCOME_SWING_CV_PERCENT);
    expect(MATCH_DAYS).toBe(TWO_DATE_TOLERANCE_DAYS);
    expect(V3_VARIABLE_HISTORY_MONTHS).toBeGreaterThan(V3_HISTORY_MONTHS);
  });

  it('D-59 MISSING_PRIORITY lists every missing code exactly once', () => {
    const all: Record<MissingCode, true> = {
      no_income_figures: true,
      unspent_not_confirmed: true,
      records_look_behind: true,
      no_price: true,
      plan_count_missing: true,
      first_payment_not_chosen: true,
      pause_interest_not_answered: true,
      plan_rate_missing: true,
      everyday_unknown: true,
      legacy_invest_check: true,
      share_invalid: true,
      income_pattern_unconfirmed: true,
      expected_income_needed: true,
      first_payment_passed: true,
      volatile_cover_question: true,
      unexplained_money_question: true,
      account_use_question: true,
      pay_arrival_question: true,
    };
    expect([...MISSING_PRIORITY].sort()).toEqual(Object.keys(all).sort());
    expect(new Set(MISSING_PRIORITY).size).toBe(MISSING_PRIORITY.length);
  });
});
