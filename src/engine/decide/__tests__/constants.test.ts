import { percent } from '../../payoff/types';
import {
  AVERAGING_WINDOW_MONTHS,
  MIN_MONTHS_FOR_STEADINESS,
  STEADY_CV_BELOW,
  VARIABLE_CV_BELOW,
  SIMULATION_MONTH_CAP,
  DEFAULT_RESERVE_MONTHS,
  DEFAULT_DSR_LINE,
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
    expect(WARNING_ORDER).toEqual(['month', 'cash', 'cash_dip', 'dsr', 'owe', 'inv']);
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
