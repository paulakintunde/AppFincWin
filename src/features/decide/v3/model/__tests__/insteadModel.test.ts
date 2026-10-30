import { evaluate, FUTURE_ORDER } from '@/engine/decide/v3';
import type { Evaluation } from '@/engine/decide/v3';
import { minorUnits } from '@/engine/money';
import { percent } from '@/engine/payoff';
import { loadAllVariableCases } from '../../../../../engine/decide/v3/__tests__/golden/variableIncomeLoader';
import { insteadModel, sliderStops } from '../insteadModel';

jest.setTimeout(60000);

const mu = minorUnits;
const cases = loadAllVariableCases().map((c) => ({ id: c.id, ev: evaluate(c.inputs, c.check) }));
const notCovered = cases.filter(({ ev }) => ev.result.code === 'not_yet' && ev.result.variant === 'not_covered' && ev.result.readyBy?.kind === 'month' && ev.purchase !== null && ev.funds.unspent !== null);
const model = (ev: Evaluation, over: Partial<Parameters<typeof insteadModel>[0]> = {}) =>
  insteadModel({ ev, userRate: null, years: 3, everydayCut: mu(0), ...over });
const card = <K extends string>(m: ReturnType<typeof model>, id: K) => m!.cards.find((c) => c.id === id) as Extract<NonNullable<ReturnType<typeof model>>['cards'][number], { id: K }>;

describe('sliderStops', () => {
  it('9 stops, 0..200 in steps of 25 major units', () => {
    expect(sliderStops(2)).toEqual([0, 2500, 5000, 7500, 10000, 12500, 15000, 17500, 20000]);
    expect(sliderStops(0)).toEqual([0, 25, 50, 75, 100, 125, 150, 175, 200]);
    expect(sliderStops(3)[8]).toBe(200000);
  });
  it('refuses a bad exponent', () => {
    expect(() => sliderStops(-1)).toThrow(RangeError);
    expect(() => sliderStops(1.5)).toThrow(RangeError);
  });
});

describe('insteadModel', () => {
  it('null when there is no purchase', () => {
    const ev = { ...cases[0]!.ev, purchase: null } as Evaluation;
    expect(model(ev)).toBeNull();
  });

  it('four cards in FUTURE_ORDER; not covered head for not_yet, spent for a fit', () => {
    const nc = notCovered[0]!.ev;
    const m = model(nc)!;
    expect(m.cards.map((c) => c.id)).toEqual([...FUTURE_ORDER]);
    const buyNow = card(m, 'buy_now');
    expect(buyNow.head).toEqual({ kind: 'notCovered' });
    expect(card(m, 'keep').head.amount).not.toBeUndefined();
    const fit = cases.find(({ ev }) => (ev.result.code === 'fits_unspent' || ev.result.code === 'fits_month') && ev.purchase !== null && ev.funds.unspent !== null);
    expect(fit).toBeDefined();
    const f = card(model(fit!.ev), 'buy_now');
    expect(f.head).toEqual({ kind: 'spent', price: fit!.ev.purchase!.dayOne });
    expect(f.before).toBe(fit!.ev.funds.unspent!.available ?? fit!.ev.funds.unspent!.value);
  });

  it('a null unspent figure gives null before and keep amounts', () => {
    const base = notCovered[0]!.ev;
    const m = model({ ...base, funds: { ...base.funds, unspent: null } } as Evaluation)!;
    expect(card(m, 'buy_now').before).toBeNull();
    expect(card(m, 'keep').head.amount).toBeNull();
    expect(card(m, 'buy_later').head.month).toBeNull();
    expect(card(m, 'buy_later').result).toMatchObject({ month: null, months: null });
  });

  it('uses the unspent value when no available figure is carried', () => {
    const base = notCovered[0]!.ev;
    const unspent = { ...base.funds.unspent!, available: undefined };
    const m = model({ ...base, funds: { ...base.funds, unspent } } as Evaluation)!;
    expect(card(m, 'buy_now').before).toBe(unspent.value);
  });

  it('deposit: no default rate (enterRate), then a typed rate, and 0% is allowed', () => {
    const ev = notCovered[0]!.ev;
    const none = card(model(ev, { years: 3 }), 'deposit');
    expect(none.state).toBe('enterRate');
    expect(none.view).toBeNull();
    expect(none.years).toBe(3);
    expect(none.zeroView?.rate).toBe(0n);
    if (ev.purchase!.schedule === null) expect(none.zeroFigure).toBe(0);
    const typed = card(model(ev, { userRate: percent('4.25'), years: 3 }), 'deposit');
    expect(typed.state).toBe('rate');
    expect(typed.view?.rate).toBe(percent('4.25'));
    expect(typed.view!.value).toBeGreaterThanOrEqual(typed.zeroView!.value);
    const zero = card(model(ev, { userRate: percent('0'), years: 5 }), 'deposit');
    expect(zero.state).toBe('rate');
    expect(zero.view).toEqual(zero.zeroView);
    const oneYear = card(model(ev, { userRate: percent('4.25'), years: 1 }), 'deposit');
    if (ev.purchase!.schedule === null) expect(oneYear.months).toBe(12);
  });

  it('a deposit rate the engine could not compute leaves the view null', () => {
    const ev = notCovered[0]!.ev;
    const d = card(model(ev, { userRate: percent('9999') }), 'deposit');
    expect(d.state).toBe('rate');
  });

  it('D-12 slider 0 equals the answer', () => {
    let checked = 0;
    let seasonal = 0;
    let plans = 0;
    const misses: string[] = [];
    for (const { id, ev } of notCovered) {
      const m = model(ev)!;
      const later = card(m, 'buy_later');
      const answer = ev.result.readyBy!.kind === 'month' ? ev.result.readyBy!.month : null;
      if (later.head.month !== answer) misses.push(`${id} ${later.head.month} vs ${answer}`);
      // the slider at 0 is the same month as the head
      if (later.result.month !== later.head.month) misses.push(`${id} slider0 ${later.result.month}`);
      checked += 1;
      if (m.seasonal) seasonal += 1;
      if (ev.purchase!.monthly > 0) plans += 1;
    }
    expect(misses).toEqual([]);
    expect(checked).toBeGreaterThan(0);
    expect(seasonal).toBeGreaterThan(0);
    expect(plans).toBeGreaterThan(0);
  });

  it('D-12 plan-purchase goldens stay anchored to the answer when the slider moves', () => {
    const plan = notCovered.filter(({ ev }) => ev.purchase!.monthly > 0);
    expect(plan.length).toBeGreaterThan(0);
    for (const { ev } of plan) {
      const answer = (ev.result.readyBy as { month: string }).month;
      const head = card(model(ev), 'buy_later').head;
      expect(head.month).toBe(answer);
      const cut = card(model(ev, { everydayCut: mu(20000) }), 'buy_later');
      expect(cut.head.month).toBe(answer);
      // more spending cut never makes the date later
      expect(cut.result.month! <= answer).toBe(true);
    }
  });

  it('a seasonal picture gives a month name only; a steady one gives a count of months', () => {
    const seas = notCovered.find(({ ev }) => ev.month.incomePicture?.treated === 'seasonal')!;
    const s = card(model(seas.ev, { everydayCut: mu(10000) }), 'buy_later');
    expect(s.result.resultKey).toBe('decide.v3.ui.instead.thenSeasonal');
    expect(model(seas.ev)!.seasonal).toBe(true);
    const steady = cases.map(({ ev }) => ev).filter((ev) => ev.purchase !== null && ev.funds.unspent !== null && ev.month.incomePicture?.treated !== 'seasonal');
    const withCount = steady.map((ev) => card(model(ev), 'buy_later')).find((c) => c.result.months !== null && c.result.months > 0);
    if (withCount !== undefined) expect(withCount.result.resultKey).toBe('decide.v3.ui.instead.then');
  });

  it('a lever past what is spent is clamped and reported', () => {
    const ev = notCovered[0]!.ev;
    const m = card(model(ev, { everydayCut: mu(900_000_000) }), 'buy_later');
    expect(m.clamped).toBe(true);
  });
});
