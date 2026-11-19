/**
 * 05.4-61 (D-177 a): direct unit tests for essentialCosts.ts (before this, reached only through the safety net tests).
 * Minor units are integers; the total rounds up to a whole currency unit (100 minor).
 */
import { minorUnits } from '../../../money/types';
import { essentialCosts, essentialSpendingOf } from '../essentialCosts';
import type { MonthModel, V3Debt, V3Inputs } from '../types';

const mu = minorUnits;
const debt = (minimum: number): V3Debt => ({ minimum }) as unknown as V3Debt;
const month = (over: Record<string, unknown> = {}): MonthModel =>
  ({ recurringBills: 0, e: null, monthsUsed: [], reasons: [], ...over }) as unknown as MonthModel;
const inputs = (over: Record<string, unknown> = {}): V3Inputs => ({ months: [], series: [], ...over }) as unknown as V3Inputs;

describe('essentialCosts: the parts and the rounded-up total', () => {
  it('adds bills, debt minimums and essential spending, then rounds up to a whole unit', () => {
    const r = essentialCosts(month({ recurringBills: 120_01 }), [debt(30_00), debt(5_50)], mu(40_00));
    expect(r.parts).toEqual({ bills: 120_01, debtMinimums: 35_50, essentialSpending: 40_00 });
    expect(r.total).toBe(196_00); // 195.51 up to 196.00
  });

  it('an exact whole unit stays put; one minor unit over goes up a whole unit', () => {
    expect(essentialCosts(month({ recurringBills: 200_00 }), [], mu(0)).total).toBe(200_00);
    expect(essentialCosts(month({ recurringBills: 200_01 }), [], mu(0)).total).toBe(201_00);
  });

  it('a negative bills figure, a negative debt minimum and a negative spending figure each count as 0', () => {
    const r = essentialCosts(month({ recurringBills: -500 }), [debt(-300), debt(200)], mu(-700));
    expect(r.parts).toEqual({ bills: 0, debtMinimums: 200, essentialSpending: 0 });
    expect(r.total).toBe(200);
  });

  it('a positive figure is kept as is in its own part', () => {
    expect(essentialCosts(month({ recurringBills: 7 }), [], mu(0)).parts.bills).toBe(7);
    expect(essentialCosts(month(), [debt(9)], mu(0)).parts.debtMinimums).toBe(9);
    expect(essentialCosts(month(), [], mu(11)).parts.essentialSpending).toBe(11);
  });
});

describe('essentialSpendingOf: the typed estimate rule (ENG11-QE-ESSENTIAL)', () => {
  const typedMonth = (over: Record<string, unknown> = {}): MonthModel => month({ e: 500_00, monthsUsed: [], reasons: ['quick_estimates_used'], ...over });
  const typedInputs = (essential: number | null): V3Inputs => inputs({ typedEstimates: { essential } });

  it('uses the stated essential part when the month rests on quick estimates alone', () => {
    expect(essentialSpendingOf(typedInputs(300_00), typedMonth())).toBe(300_00);
  });

  it('never above the everyday part and never below 0', () => {
    expect(essentialSpendingOf(typedInputs(900_00), typedMonth())).toBe(500_00);
    expect(essentialSpendingOf(typedInputs(-5), typedMonth())).toBe(0);
    expect(essentialSpendingOf(typedInputs(0), typedMonth())).toBe(0);
    expect(essentialSpendingOf(typedInputs(500_00), typedMonth())).toBe(500_00);
  });

  it('a null stated part means all of the everyday part counts as essential', () => {
    expect(essentialSpendingOf(typedInputs(null), typedMonth())).toBe(500_00);
  });

  it('the stated part is ignored when any month was used (typed is false)', () => {
    expect(essentialSpendingOf(typedInputs(100_00), typedMonth({ monthsUsed: ['2026-09'] }))).toBe(500_00);
  });

  it('the stated part is ignored when the month does not say quick estimates were used', () => {
    expect(essentialSpendingOf(typedInputs(100_00), typedMonth({ reasons: [] }))).toBe(500_00);
  });

  it('a negative everyday figure counts as 0, and so does an absent one', () => {
    expect(essentialSpendingOf(inputs(), month({ e: -400 }))).toBe(0);
    expect(essentialSpendingOf(inputs(), month({ e: null }))).toBe(0);
    expect(essentialSpendingOf(typedInputs(50), month({ e: -400, monthsUsed: [], reasons: ['quick_estimates_used'] }))).toBe(0);
  });

  it('with no essential category marked it is the everyday figure', () => {
    expect(essentialSpendingOf(inputs({ essentialCategoryIds: [] }), month({ e: 321_00 }))).toBe(321_00);
    expect(essentialSpendingOf(inputs({ essentialCategoryIds: undefined }), month({ e: 321_00 }))).toBe(321_00);
  });

  it('with categories marked but none of the months used found, it is the everyday figure', () => {
    expect(essentialSpendingOf(inputs({ essentialCategoryIds: ['c1'] }), month({ e: 321_00, monthsUsed: ['2026-09'] }))).toBe(321_00);
  });
});
