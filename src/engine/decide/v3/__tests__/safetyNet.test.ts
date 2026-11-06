/**
 * 05.4 FIN-01 / FIN-02 / ENG-03 / ENG-04 / ARC-07 unit tests: essential costs, the net in force, the dip and the variant order.
 * Every branch of safetyNet.ts, essentialCosts.ts and cash/path.ts withNet is pinned both ways.
 */
import { minorUnits } from '../../../money/types';
import { withNet, type CashCheck, type CashPathV3 } from '../cash/path';
import { essentialCosts, essentialSpendingOf } from '../essentialCosts';
import { buildMonthModel } from '../month/model';
import { FIT_VARIANT_ORDER, NO_NET, fitVariant, netDip, resolveSafetyNet, type ResolvedNet } from '../safetyNet';
import type { MonthModel, V3Debt, V3Inputs } from '../types';
import { inputsOf, monthOf, v3Line, v3Series } from './helpers/fixtures';
import { toEngineInputs } from './rightAnswers/fixture';
import { loadCases } from './rightAnswers/loader';
import type { RightAnswerCase } from './rightAnswers/schema';

const mu = minorUnits;
const essential = (total: number) => ({ total: mu(total), parts: { bills: mu(0), debtMinimums: mu(0), essentialSpending: mu(0) } });
const debt = (minimum: number): V3Debt => ({ id: `d${minimum}`, kind: 'card', balance: mu(100_000), minimum: mu(minimum), apr: null, secured: false, isHousing: false });

describe('essential costs (ARC-07)', () => {
  const month = (over: Partial<MonthModel>): MonthModel => ({ ...buildMonthModel(inputsOf()), ...over });

  it('bills + debt minimums + essential spending, rounded up to a whole unit, with its parts', () => {
    expect(essentialCosts(month({ recurringBills: mu(140_000) }), [debt(2_501), debt(0)], mu(50_000))).toEqual({
      total: mu(192_600),
      parts: { bills: mu(140_000), debtMinimums: mu(2_501), essentialSpending: mu(50_000) },
    });
    // an exact whole unit stays; parts below 0 count as 0
    expect(essentialCosts(month({ recurringBills: mu(-5) }), [debt(-1)], mu(-1)).total).toBe(0);
    expect(essentialCosts(month({ recurringBills: mu(100) }), [], mu(0)).total).toBe(100);
  });

  const history = (): V3Inputs => {
    const series = [v3Series({ id: 'rent', role: 'bill', cadence: { unit: 'month', every: 1 }, anchorDate: '2026-04-01', amount: 100_000 })];
    const months = ['2026-07', '2026-08', '2026-09'].map((m, i) =>
      monthOf(m, [
        v3Line({ id: `r-${m}`, date: `${m}-01`, amount: 100_000, seriesId: 'rent' }),
        v3Line({ id: `f-${m}`, date: `${m}-10`, amount: 30_000 + i * 1_000, categoryId: 'food' }),
        v3Line({ id: `o-${m}`, date: `${m}-12`, amount: 20_000 }),
      ])
    );
    return inputsOf({ series, months: [...months, monthOf('2026-10', [], { full: false })] });
  };

  it('typical essential spending: the median of the marked categories, capped at the typical figure; none marked = typical', () => {
    const inputs = history();
    const m = buildMonthModel(inputs);
    expect(essentialSpendingOf(inputs, m)).toBe(m.e);
    expect(essentialSpendingOf({ ...inputs, essentialCategoryIds: ['food'] }, m)).toBe(31_000);
    expect(essentialSpendingOf({ ...inputs, essentialCategoryIds: ['food', 'never-logged'] }, m)).toBe(31_000);
    expect(essentialSpendingOf({ ...inputs, essentialCategoryIds: ['food'] }, { ...m, e: mu(10_000) })).toBe(10_000);
    expect(essentialSpendingOf({ ...inputs, essentialCategoryIds: ['food'] }, { ...m, monthsUsed: [] })).toBe(m.e);
    expect(essentialSpendingOf(inputs, { ...m, e: null })).toBe(0);
  });

  // 05.4-57 ENG11-QE-BILLS: month.e from quick estimates is already the everyday part (bills taken out once in typicalOf), so it
  // is read as is. ENG11-QE-ESSENTIAL: a stated essential part of it is used, capped at the everyday part; absent = all of it.
  it('ENG11-QE-BILLS / ENG11-QE-ESSENTIAL from quick estimates alone: the everyday part as is, or the stated essential part', () => {
    const inputs = history();
    const m = buildMonthModel(inputs);
    const typed: MonthModel = { ...m, e: mu(30_000), recurringBills: mu(100_000), monthsUsed: [], reasons: ['quick_estimates_used'] };
    const est = (essential?: number | null): V3Inputs => ({
      ...inputs,
      typedEstimates: {
        income: mu(250_000), expenses: mu(130_000), saving: mu(0), debt: mu(0), invest: mu(0), asOf: '2026-10-01',
        ...(essential === undefined ? {} : { essential: essential === null ? null : mu(essential) }),
      },
    });
    // no essential part stated: the everyday part, not 30,000 - 100,000 again
    expect(essentialSpendingOf(inputs, typed)).toBe(30_000);
    expect(essentialSpendingOf(est(), typed)).toBe(30_000);
    expect(essentialSpendingOf(est(null), typed)).toBe(30_000);
    // stated: used; capped at the everyday part; below 0 counts as 0
    expect(essentialSpendingOf(est(20_000), typed)).toBe(20_000);
    expect(essentialSpendingOf(est(45_000), typed)).toBe(30_000);
    expect(essentialSpendingOf(est(-5), typed)).toBe(0);
    // with history months the stated part is ignored (the marked categories' median as before)
    expect(essentialSpendingOf({ ...est(5_000), essentialCategoryIds: ['food'] }, m)).toBe(31_000);
    // an override with no months is not quick estimates
    expect(essentialSpendingOf(est(20_000), { ...typed, reasons: ['everyday_override_used'] })).toBe(30_000);
  });

  it('ENG11-QE-ESSENTIAL QE-13 starter: £1,000 bills + £200 essential = £1,200 (£1,300 without the stated part)', () => {
    const c = loadCases().find((x) => x.id === 'QE-13') as RightAnswerCase;
    const { inputs } = toEngineInputs(c.fixture);
    const m = buildMonthModel(inputs);
    expect(essentialCosts(m, inputs.debts, essentialSpendingOf(inputs, m)).total).toBe(120_000);
    const none: V3Inputs = { ...inputs, typedEstimates: { ...(inputs.typedEstimates as NonNullable<V3Inputs['typedEstimates']>), essential: null } };
    expect(essentialCosts(m, none.debts, essentialSpendingOf(none, m)).total).toBe(130_000);
  });
});

describe('the net in force (D-05, D-06, D-35)', () => {
  const at = (safetyNet: V3Inputs['safetyNet'], emergency: V3Inputs['emergency'] = null): ResolvedNet =>
    resolveSafetyNet(inputsOf({ safetyNet, emergency }), essential(190_000));

  it('no record: protection on, the starter, the emergency fund (or nothing) saved', () => {
    expect(at(undefined)).toEqual({ protect: true, off: false, zeroIsOff: false, size: 190_000, starter: 190_000, saved: 0, floor: 0, aboveSize: 0, usable: 0, locked: true, state: 'none' });
    // D-61: no record at all is locked, so the protected part lends nothing
    expect(at(null, { amount: mu(120_000) })).toMatchObject({ saved: 120_000, floor: 120_000, usable: 0, locked: true, state: 'small' });
  });

  it('only money already saved is protected; money above the size is spare; any size is respected', () => {
    expect(at({ protect: true, size: null, saved: mu(190_000) })).toMatchObject({ floor: 190_000, aboveSize: 0, state: 'full' });
    expect(at({ protect: true, size: mu(100_000), saved: mu(150_000), locked: false })).toMatchObject({ size: 100_000, floor: 100_000, aboveSize: 50_000, usable: 100_000, locked: false, state: 'above' });
    expect(at({ protect: true, size: mu(5_000), saved: mu(5_000) })).toMatchObject({ size: 5_000, floor: 5_000, state: 'full' });
    expect(JSON.stringify(at({ protect: true, size: null, saved: mu(1) }))).not.toContain('heldBack');
  });

  it('protection off counts all of it; a $0 size is off and says so; figures below 0 count as 0', () => {
    expect(at({ protect: false, size: mu(100_000), saved: mu(100_000) })).toMatchObject({ off: true, zeroIsOff: false, floor: 0, aboveSize: 0, usable: 100_000, locked: false });
    expect(at({ protect: true, size: mu(0), saved: mu(100_000) })).toMatchObject({ off: true, zeroIsOff: true, floor: 0, usable: 100_000, locked: false });
    expect(at({ protect: true, size: mu(-1), saved: mu(-1) })).toMatchObject({ off: true, zeroIsOff: true, size: 0, saved: 0, state: 'none' });
    expect(NO_NET).toMatchObject({ off: true, usable: 0, saved: 0, locked: false });
  });

  it('D-61 locked by default: absent or true is locked (usable 0); false unlocks; the money above the size is unchanged', () => {
    const locked = at({ protect: true, size: mu(100_000), saved: mu(150_000) });
    expect(locked).toMatchObject({ locked: true, usable: 0, floor: 100_000, aboveSize: 50_000, state: 'above' });
    expect(at({ protect: true, size: mu(100_000), saved: mu(150_000), locked: true })).toEqual(locked);
    expect(at({ protect: true, size: mu(100_000), saved: mu(150_000), locked: false })).toEqual({ ...locked, locked: false, usable: 100_000 });
    // off ignores the lock (D-06): everything saved counts
    expect(at({ protect: false, size: mu(100_000), saved: mu(150_000), locked: true })).toMatchObject({ locked: false, usable: 150_000 });
    expect(at({ protect: true, size: mu(0), saved: mu(150_000), locked: true })).toMatchObject({ locked: false, zeroIsOff: true, usable: 150_000 });
  });
});

describe('the dip (FIN-02, ENG-04)', () => {
  const full = (): ResolvedNet => ({ ...NO_NET, protect: true, off: false, size: mu(100_000), saved: mu(150_000), floor: mu(100_000), aboveSize: mu(50_000), usable: mu(100_000), state: 'above' });

  it('used, what is left (money above the size taken first) and the refill months at the usual pace', () => {
    expect(netDip(mu(20_000), mu(50_000), full(), mu(30_000))).toEqual({ used: 20_000, left: 80_000, refillMonths: 1 });
    expect(netDip(mu(500_000), mu(0), full(), mu(30_000))).toEqual({ used: 100_000, left: 50_000, refillMonths: 4 });
    expect(netDip(mu(-1), mu(-1), full(), mu(30_000))).toEqual({ used: 0, left: 150_000, refillMonths: 0 });
    expect(netDip(mu(20_000), mu(200_000), full(), null)).toEqual({ used: 20_000, left: 0, refillMonths: null });
    expect(netDip(mu(20_000), mu(0), full(), mu(0)).refillMonths).toBeNull();
  });
});

describe('the variant order on a fit (05.4-12 revision notes section 1)', () => {
  it('D-59 every safety-net caution sits last: tight and costly_debt are inserted above no_net / small_net', () => {
    expect(FIT_VARIANT_ORDER.slice(-2)).toEqual(['no_net', 'small_net']);
    const net = FIT_VARIANT_ORDER.indexOf('no_net');
    for (const v of FIT_VARIANT_ORDER.slice(0, net)) expect(['no_net', 'small_net']).not.toContain(v);
  });

  it('low_month wins over no_net / small_net; the losers stay in order', () => {
    // D-63 first; D-65's tiers next (exclusive, the judge picks one)
    expect(FIT_VARIANT_ORDER).toEqual(['month_already_short', 'month_short_moderate_extra', 'month_short_moderate', 'month_short_small', 'tight', 'low_month', 'costly_debt', 'extra_savings', 'no_net', 'small_net']);
    // 05.4-20 (D-39b): costly_debt leads the money's source and the net cautions; its fact still shows when it loses
    expect(fitVariant(['extra_savings', 'costly_debt', 'small_net'])).toEqual({ variant: 'costly_debt', losers: ['extra_savings', 'small_net'] });
    expect(fitVariant(['costly_debt', 'low_month'])).toEqual({ variant: 'low_month', losers: ['costly_debt'] });
    expect(fitVariant(['extra_savings', 'low_month'])).toEqual({ variant: 'low_month', losers: ['extra_savings'] });
    expect(fitVariant(['no_net', 'low_month'])).toEqual({ variant: 'low_month', losers: ['no_net'] });
    expect(fitVariant(['small_net'])).toEqual({ variant: 'small_net', losers: [] });
    // 05.4-21 (FIN-07, D-59): tight leads low_month and every safety-net caution; a month-short headline leads tight
    expect(fitVariant(['no_net', 'low_month', 'tight', 'costly_debt'])).toEqual({ variant: 'tight', losers: ['low_month', 'costly_debt', 'no_net'] });
    expect(fitVariant(['tight', 'month_short_small'])).toEqual({ variant: 'month_short_small', losers: ['tight'] });
    expect(fitVariant([])).toEqual({ variant: null, losers: [] });
    expect(fitVariant(['payday'])).toEqual({ variant: null, losers: [] });
  });
});

describe('the cash check with the net lending (cash/path.ts withNet)', () => {
  const path = (...balances: number[]): CashPathV3 => ({ asOf: '2026-11-15', points: balances.map((b, i) => ({ date: `2026-11-${String(15 + i).padStart(2, '0')}`, balance: mu(b) })) });
  const payday: CashCheck = { kind: 'payday', until: '2026-12-01', shortBy: mu(200) };
  const notCovered: CashCheck = { kind: 'not_covered', shortBy: mu(200), payDate: null };

  it('only a failed check is read again; ok and overdraft stay as they are', () => {
    const ok: CashCheck = { kind: 'ok', lowest: { date: '2026-11-15', balance: mu(5) } };
    expect(withNet(ok, path(5), () => path(5), mu(1_000))).toBe(ok);
    const od: CashCheck = { kind: 'overdraft', lowest: { date: '2026-11-15', balance: mu(-5) } };
    expect(withNet(od, path(-5), () => path(0), mu(1_000))).toBe(od);
  });

  it('the net carries the low point back to 0, or the check stays failed', () => {
    expect(withNet(payday, path(100, -200, 50), () => path(300, 0, 250), mu(200))).toEqual({
      kind: 'net',
      lowest: { date: '2026-11-16', balance: -200 },
      used: 200,
      added: 200,
      until: '2026-12-01',
    });
    expect(withNet(payday, path(100, -200), () => path(0), mu(199))).toBe(payday);
    // a dip that is there without the purchase is not the purchase's: it adds only the difference; not_covered has no payday
    expect(withNet(notCovered, path(-660), () => path(-600), mu(1_000))).toMatchObject({ kind: 'net', used: 660, added: 60, until: null });
    expect(withNet(notCovered, path(-600), () => path(-700), mu(1_000))).toMatchObject({ added: 0 });
  });
});
