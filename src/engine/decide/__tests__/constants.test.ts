import { readFileSync } from 'fs';
import { join } from 'path';
import { percent } from '../../payoff/types';
import {
  AVERAGING_WINDOW_MONTHS,
  MIN_MONTHS_FOR_STEADINESS,
  STEADY_CV_BELOW,
  VARIABLE_CV_BELOW,
  SIMULATION_MONTH_CAP,
  DEFAULT_RESERVE_MONTHS,
  DEFAULT_DSR_LINE,
  DEFAULT_HOUSING_LINE,
  DEFAULT_UNSECURED_INCOME_MULTIPLE,
  BILLS_DUE_HORIZON_DAYS,
  WEEKS_PER_YEAR,
  FORTNIGHTS_PER_YEAR,
  MONTHS_PER_YEAR,
  MONTHS_PER_QUARTER,
  WARNING_ORDER,
  DEFAULT_SETBACKS,
  LONGER_TERM_STEP_MONTHS,
  CUT_LINE_FRACTION_PERCENT,
  CUT_LINE_COUNT,
  DO_WITHOUT_FALLBACK_HORIZON_MONTHS,
  ALTERNATIVES_HORIZON_MIN,
  ALTERNATIVES_HORIZON_MAX,
  ALTERNATIVES_HORIZON_FALLBACK,
  DEFAULT_CHEAPER_RATIO_PERCENT,
  LATE_INVOICE_DAYS_PER_MONTH,
  RESERVE_HALF_MONTHS,
  HALF_MONTHS_PER_MONTH,
  EDGE_MARGIN_PERCENT,
  CASH_PATH_DAYS,
  DAYS_PER_YEAR,
  FUTURE_CHANGE_MONTHS,
  CONFIDENCE_STRONG_MIN_MONTHS,
  STRESS_OFFSETS,
  LATE_PAYMENT_COUNTS,
  MAX_PROJECTION_RATES,
  DEFAULT_PROJECTION_HORIZON_MONTHS,
  ESTIMATE_BIAS_MIN_DECISIONS,
  BASIS_POINTS_PER_UNIT,
} from '../constants';

describe('decide behaviour constants', () => {
  it('averaging and steadiness constants (D-09, D-12)', () => {
    expect(AVERAGING_WINDOW_MONTHS).toBe(6);
    expect(MIN_MONTHS_FOR_STEADINESS).toBe(3);
    expect(STEADY_CV_BELOW).toBe(percent('6'));
    expect(VARIABLE_CV_BELOW).toBe(percent('22'));
    expect(SIMULATION_MONTH_CAP).toBe(600);
  });

  it('limit defaults (D-01, D-04)', () => {
    expect(DEFAULT_RESERVE_MONTHS).toBe(3);
    expect(DEFAULT_DSR_LINE).toBe(percent('36'));
    expect(DEFAULT_HOUSING_LINE).toBe(percent('28'));
    expect(DEFAULT_UNSECURED_INCOME_MULTIPLE).toBe(12);
  });

  it('bills window and smoothing factors (D-23, D-24)', () => {
    expect(BILLS_DUE_HORIZON_DAYS).toBe(90);
    expect(WEEKS_PER_YEAR).toBe(52);
    expect(FORTNIGHTS_PER_YEAR).toBe(26);
    expect(MONTHS_PER_YEAR).toBe(12);
    expect(MONTHS_PER_QUARTER).toBe(3);
  });

  it('warning order', () => {
    expect(WARNING_ORDER).toEqual(['month', 'cash', 'cash_dip', 'dsr', 'housing', 'owe', 'inv']);
  });

  it('default setbacks (prototype DSB, no currency amount)', () => {
    expect(DEFAULT_SETBACKS).toEqual([
      { code: 'unexpected_expense', enabled: false, amount: null },
      { code: 'income_drop', enabled: false, percentDrop: 20, months: 2 },
      { code: 'job_loss', enabled: false, months: 8 },
      { code: 'late_invoice', enabled: false, daysLate: 30 },
    ]);
  });

  it('option and alternative constants', () => {
    expect(LONGER_TERM_STEP_MONTHS).toBe(24);
    expect(CUT_LINE_FRACTION_PERCENT).toBe(20);
    expect(CUT_LINE_COUNT).toBe(2);
    expect(DO_WITHOUT_FALLBACK_HORIZON_MONTHS).toBe(60);
    expect(ALTERNATIVES_HORIZON_MIN).toBe(12);
    expect(ALTERNATIVES_HORIZON_MAX).toBe(120);
    expect(ALTERNATIVES_HORIZON_FALLBACK).toBe(36);
    expect(DEFAULT_CHEAPER_RATIO_PERCENT).toBe(65);
    expect(LATE_INVOICE_DAYS_PER_MONTH).toBe(30);
  });
});

describe('depth-expansion constants (D-42..D-56)', () => {
  it('cushion half-months follow steadiness; insufficient history is 3 months (D-42 amended)', () => {
    expect(RESERVE_HALF_MONTHS).toEqual({ steady: 6, variable: 9, volatile: 12, insufficient: 6 });
    expect(HALF_MONTHS_PER_MONTH).toBe(2);
    expect(DEFAULT_RESERVE_MONTHS).toBe(3);
  });

  it('edge margin, cash path and horizon constants', () => {
    expect(EDGE_MARGIN_PERCENT).toBe(5);
    expect(CASH_PATH_DAYS).toBe(90);
    expect(CASH_PATH_DAYS).toBe(BILLS_DUE_HORIZON_DAYS);
    expect(DAYS_PER_YEAR).toBe(365);
    expect(FUTURE_CHANGE_MONTHS).toBe(12);
    expect(CONFIDENCE_STRONG_MIN_MONTHS).toBe(6);
  });

  it('stress offsets are percentage points, not fractions', () => {
    expect(STRESS_OFFSETS).toEqual([percent('2'), percent('4')]);
    expect(STRESS_OFFSETS[0]).toBe(20_000_000_000n);
  });

  it('late-payment counts, projection and estimate-bias constants', () => {
    expect(LATE_PAYMENT_COUNTS).toEqual([1, 2]);
    expect(MAX_PROJECTION_RATES).toBe(3);
    expect(DEFAULT_PROJECTION_HORIZON_MONTHS).toBe(60);
    expect(ESTIMATE_BIAS_MIN_DECISIONS).toBe(3);
    expect(BASIS_POINTS_PER_UNIT).toBe(10_000);
  });
});

describe('constants.ts citations', () => {
  const lines = readFileSync(join(__dirname, '..', 'constants.ts'), 'utf8')
    .replace(/\r\n/g, '\n')
    .split('\n');

  /** The contiguous // comment lines directly above the line index. */
  function blockAbove(index: number): string[] {
    const block: string[] = [];
    for (let i = index - 1; i >= 0 && lines[i]!.startsWith('//'); i -= 1) block.unshift(lines[i]!);
    return block;
  }
  function citeOf(name: string): string {
    const index = lines.findIndex((l) => l.startsWith(`export const ${name}`));
    expect(index).toBeGreaterThanOrEqual(0);
    return blockAbove(index).join(' ');
  }
  // 05.1 (D-16): the three D-11 line defaults moved to the leaf lineDefaults.ts with their citations.
  const lineDefaultLines = readFileSync(join(__dirname, '..', 'lineDefaults.ts'), 'utf8')
    .replace(/\r\n/g, '\n')
    .split('\n');
  function citeOfLineDefault(name: string): string {
    const index = lineDefaultLines.findIndex((l) => l.startsWith(`export const ${name}`));
    expect(index).toBeGreaterThanOrEqual(0);
    const block: string[] = [];
    for (let i = index - 1; i >= 0 && lineDefaultLines[i]!.startsWith('//'); i -= 1) block.unshift(lineDefaultLines[i]!);
    return block.join(' ');
  }
  const BEHAVIOUR_LABEL = 'FincWin behaviour constant (no published source; see 04-RESEARCH addendum §A)';
  const USER_CONFIRMED = 'FincWin behaviour line (user-confirmed 2026-10-15, D-04 confirmed after research)';

  it('D-58: every constant carries its citation in constants.ts', () => {
    const exportIndexes = lines.map((l, i) => (/^export (const|\{)/.test(l) ? i : -1)).filter((i) => i >= 0);
    expect(exportIndexes.length).toBeGreaterThan(25);
    for (const i of exportIndexes) {
      const block = blockAbove(i);
      expect({ line: lines[i], cited: block.some((l) => l.startsWith('// Cite:')) }).toEqual({
        line: lines[i],
        cited: true,
      });
    }
  });

  it('names the user-confirmed behaviour lines (D-04 confirmed)', () => {
    expect(citeOfLineDefault('DEFAULT_DSR_LINE')).toContain(USER_CONFIRMED);
    expect(citeOfLineDefault('DEFAULT_DSR_LINE')).toContain('take-home income');
    expect(citeOfLineDefault('DEFAULT_DSR_LINE')).toContain('selling-guide.fanniemae.com');
    expect(citeOfLineDefault('DEFAULT_UNSECURED_INCOME_MULTIPLE')).toContain(USER_CONFIRMED);
  });

  it('D-103 the housing line cites the 28/36 front-end ratio with a verified source', () => {
    expect(citeOfLineDefault('DEFAULT_HOUSING_LINE')).toContain('front-end');
    expect(citeOfLineDefault('DEFAULT_HOUSING_LINE')).toContain('28% of gross monthly income');
    expect(citeOfLineDefault('DEFAULT_HOUSING_LINE')).toContain('bankrate.com/mortgages/what-is-the-28-36-rule');
    expect(citeOfLineDefault('DEFAULT_HOUSING_LINE')).toContain('user-confirmed 2026-10-24');
    expect(citeOfLineDefault('DEFAULT_HOUSING_LINE')).toContain('take-home income');
  });

  it('cites the sources the research found', () => {
    expect(citeOf('STEADY_CV_BELOW')).toContain('jpmorganchase.com');
    expect(citeOf('VARIABLE_CV_BELOW')).toContain('jpmorganchase.com');
    expect(citeOf('RESERVE_HALF_MONTHS')).toContain('vanguard.com');
    expect(citeOf('RESERVE_HALF_MONTHS')).toContain('FincWin behaviour constant');
    expect(citeOf('STRESS_OFFSETS')).toContain('osfi-bsif.gc.ca');
    expect(citeOf('STRESS_OFFSETS')).toContain('bankofengland.co.uk');
  });

  it('labels the unsourced values as behaviour constants rather than standards', () => {
    expect(citeOfLineDefault('DEFAULT_UNSECURED_INCOME_MULTIPLE')).toContain(BEHAVIOUR_LABEL);
    for (const name of ['BILLS_DUE_HORIZON_DAYS', 'EDGE_MARGIN_PERCENT', 'DEFAULT_PROJECTION_HORIZON_MONTHS']) {
      expect(citeOf(name)).toContain(BEHAVIOUR_LABEL);
    }
  });
});
