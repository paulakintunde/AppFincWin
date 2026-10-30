import { buildSchedule, planCard } from '@/engine/decide/v3';
import type { Cadence, PlanCard, Purchase, QuotedCheck } from '@/engine/decide/v3';
import { minorUnits } from '@/engine/money';
import { percent } from '@/engine/payoff';
import { planModel } from '../planModel';

const mu = minorUnits;
const NONE: QuotedCheck = { kind: 'none' };

function build(over: { price?: number; rate?: string; count?: number; cadence?: Cadence; setup?: number; running?: number; tax?: number; oneOff?: number } = {}) {
  const price = over.price ?? 2_700_000;
  const out = buildSchedule({
    asOf: '2026-10-03',
    financed: mu(price),
    apr: percent(over.rate ?? '6.9'),
    cadence: over.cadence ?? { unit: 'month', every: 1 },
    count: over.count ?? 60,
    firstPayment: { kind: 'one_period' },
    fees: { setup: mu(over.setup ?? 45_000), perPeriod: mu(0), end: mu(0) },
  });
  if (!out.ok) throw new Error('schedule');
  const schedule = out.schedule;
  const card = planCard({
    price: mu(price),
    tax: mu(over.tax ?? 0),
    oneOffFees: mu(over.oneOff ?? 0),
    schedule,
    runningMonthly: mu(over.running ?? 39_000),
  });
  const purchase = { schedule, runningMonthly: card.runningMonthly } as unknown as Purchase;
  return { schedule, card, purchase };
}

describe('planModel', () => {
  it("Sam's used car: summary, rows in order, total and mix agree with the PlanCard", () => {
    const { schedule, card, purchase } = build({ tax: 189_000, oneOff: 10_000 });
    const m = planModel({ purchase, planCard: card, quoted: NONE, taxPercent: percent('7'), rate: percent('6.9'), deposit: mu(0) })!;
    expect(m.summary).toMatchObject({
      count: 60,
      payment: schedule.payment,
      finalPayment: schedule.finalPayment,
      cadenceWord: 'month',
      perMonth: schedule.monthlyEquivalent,
      endsYm: card.endDate.slice(0, 7),
      running: 39_000,
    });
    expect(m.rows.map((r) => r.labelKey)).toEqual([
      'decide.v3.ui.plan.price',
      'decide.v3.ui.plan.tax',
      'decide.v3.ui.plan.fees',
      'decide.v3.ui.plan.interest',
      'decide.v3.ui.plan.runningOver',
    ]);
    expect(m.rows[3]).toMatchObject({ labelParams: { rate: '6.9' }, amount: card.interest });
    expect(m.rows[4]).toMatchObject({ labelParams: { count: 60 }, amount: 39_000 * 60 });
    expect(m.planTotal).toBe(card.total);
    expect(m.total.months).toBe(60);
    expect(m.total.amount).toBe(card.total + 39_000 * 60);
    const parts = Object.fromEntries(m.mix.map((p) => [p.part, p.amount]));
    expect(Object.keys(parts)).toEqual(['price', 'taxFees', 'interest', 'running']);
    expect(parts.taxFees).toBe(189_000 + 10_000 + card.fees);
    expect(m.mix.reduce((a, p) => a + p.amount, 0)).toBe(m.total.amount);
    expect(m.rateZero).toBe(false);
    expect(m.quotedDiffers).toBeNull();
  });

  it('weekly plan: total equals the PlanCard total to the minor unit', () => {
    const { card, purchase } = build({ price: 520_000, count: 52, cadence: { unit: 'week', every: 1 }, running: 0, setup: 0 });
    const m = planModel({ purchase, planCard: card, quoted: NONE, taxPercent: null })!;
    expect(m.summary.cadenceWord).toBe('week');
    expect(m.total.amount).toBe(card.total);
    expect(m.total.months).toBe(12);
    expect(m.rows.map((r) => r.labelKey)).not.toContain('decide.v3.ui.plan.runningOver');
    expect(m.mix.some((p) => p.part === 'running')).toBe(false);
    expect(m.mix.reduce((a, p) => a + p.amount, 0)).toBe(card.total);
    expect(m.rateZero).toBe(false);
  });

  it('every 2 weeks and other cadences', () => {
    const two = build({ count: 26, cadence: { unit: 'week', every: 2 } });
    expect(planModel({ purchase: two.purchase, planCard: two.card, quoted: NONE, taxPercent: null })!.summary.cadenceWord).toBe('twoWeeks');
    const other = build({ count: 8, cadence: { unit: 'month', every: 3 } });
    const o = planModel({ purchase: other.purchase, planCard: other.card, quoted: NONE, taxPercent: null })!;
    expect(o.summary.cadenceWord).toBe('other');
    expect(o.total.months).toBe(24);
  });

  it('rate 0: an Interest at 0% row of 0 and no interest part', () => {
    const { card, purchase } = build({ rate: '0', running: 0 });
    const m = planModel({ purchase, planCard: card, quoted: NONE, taxPercent: null, rate: percent('0') })!;
    expect(m.rateZero).toBe(true);
    const row = m.rows.find((r) => r.labelKey === 'decide.v3.ui.plan.interest')!;
    expect(row.amount).toBe(0);
    expect(row.labelParams).toEqual({ rate: '0' });
    expect(m.mix.some((p) => p.part === 'interest')).toBe(false);
  });

  it('no typed rate and no interest: still zero; with interest the plain label', () => {
    const z = build({ rate: '0', running: 0 });
    expect(planModel({ purchase: z.purchase, planCard: z.card, quoted: NONE, taxPercent: null })!.rateZero).toBe(true);
    const p = build({ running: 0 });
    const m = planModel({ purchase: p.purchase, planCard: p.card, quoted: NONE, taxPercent: null })!;
    expect(m.rateZero).toBe(false);
    expect(m.rows.find((r) => r.labelKey === 'decide.v3.ui.plan.interestPlain')).toBeDefined();
  });

  it('a differing quote sets quotedDiffers', () => {
    const { card, purchase } = build();
    const quoted: QuotedCheck = { kind: 'differs', computed: mu(50_000), quoted: mu(60_000), gap: mu(10_000), direction: 'higher' };
    const m = planModel({ purchase, planCard: card, quoted, taxPercent: null, rate: percent('6.9') })!;
    expect(m.quotedDiffers).toEqual({ quoted: 60_000, computed: 50_000 });
  });

  it('D-11: an implied rate above the cap uses the over-999% sentence with the real interest', () => {
    const { card, purchase } = build({ rate: '0' });
    const quoted: QuotedCheck = { kind: 'from_quote', quoted: card.lines[0]!.amount, impliedApr: 'above_max' };
    const m = planModel({ purchase, planCard: card, quoted, taxPercent: null })!;
    const row = m.rows.find((r) => r.labelKey === 'decide.v3.fact.implied_rate_over')!;
    expect(row.labelParams).toEqual({ rate: '999' });
    expect(row.amount).toBe(purchase.schedule!.totalInterest);
    expect(m.rateZero).toBe(false);
  });

  it('a rate implied by the quote is used when none was typed', () => {
    const { card, purchase } = build({ rate: '0' });
    const quoted: QuotedCheck = { kind: 'from_quote', quoted: card.lines[0]!.amount, impliedApr: percent('12.5') };
    const m = planModel({ purchase, planCard: card, quoted, taxPercent: null })!;
    expect(m.rows.find((r) => r.labelKey === 'decide.v3.ui.plan.interest')!.labelParams).toEqual({ rate: '12.5' });
    const q2: QuotedCheck = { kind: 'from_quote', quoted: card.lines[0]!.amount, impliedApr: null };
    expect(planModel({ purchase, planCard: card, quoted: q2, taxPercent: null })!.rows.some((r) => r.labelKey === 'decide.v3.ui.plan.interestPlain' || r.labelKey === 'decide.v3.ui.plan.interest')).toBe(true);
  });

  it('a term over 84 months is carried in full; a down payment row shows when there is one', () => {
    const { card, purchase } = build({ count: 96 });
    const m = planModel({ purchase, planCard: card, quoted: NONE, taxPercent: null, deposit: mu(500_000) })!;
    expect(m.summary.count).toBe(96);
    expect(m.total.months).toBe(96);
    expect(m.rows.map((r) => r.labelKey)).toContain('decide.v3.ui.plan.deposit');
    expect(m.rows.find((r) => r.labelKey === 'decide.v3.ui.plan.deposit')!.amount).toBe(500_000);
  });

  it('null when there is no plan', () => {
    const { purchase } = build();
    expect(planModel({ purchase, planCard: null, quoted: NONE, taxPercent: null })).toBeNull();
    expect(planModel({ purchase: { ...purchase, schedule: null }, planCard: build().card as PlanCard, quoted: NONE, taxPercent: null })).toBeNull();
  });
});
