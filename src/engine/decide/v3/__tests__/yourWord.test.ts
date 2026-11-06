/**
 * 05.4-23 (FIN-08 / ENG-07 / UX-06 / CMP-F01, FIN-15, D-40 / D-46): savings first for low months, "Only on your answer", the pay cut
 * and the runway lines, by hand against the approved quick-estimate cases (their figures, not the engine's).
 */
import { minorUnits } from '../../../money/types';
import { currencyCode } from '../../../money/types';
import { evaluate, stricterOf, type Evaluation } from '../evaluate';
import { furtherStep, keptSavings, runwayFacts } from '../judge/judge';
import { lowPayMonths, payBasis, typicalIncome } from '../month/incomeProfile';
import { percentText } from '../month/model';
import type { Fact, MonthModel, Purchase, V3Account, V3Month } from '../types';
import { toEngineInputs } from './rightAnswers/fixture';
import { loadCases } from './rightAnswers/loader';
import type { RightAnswerFixture } from './rightAnswers/schema';
import { monthOf, v3Line, v3Series } from './helpers/fixtures';

const mu = minorUnits;
const fx = (id: string): RightAnswerFixture => {
  const c = loadCases().find((x) => x.id === id);
  if (c === undefined) throw new Error(id);
  return c.fixture;
};
const run = (f: RightAnswerFixture): Evaluation => {
  const { inputs, check } = toEngineInputs(f);
  return evaluate(inputs, check);
};
const fact = (e: Evaluation, code: string): Fact | undefined => e.result.facts.find((f) => f.code === code);
const codes = (e: Evaluation): string[] => e.result.facts.map((f) => f.code);

describe('05.4-23 savings first for low months (FIN-08, ENG-07)', () => {
  it('QE-04 by hand: 1 low month in 6 is about 2 over 12 payments, 2 x $1,100 = $2,200 of $4,000, Fits, a low month is tight', () => {
    const e = run(fx('QE-04'));
    expect([e.result.code, e.result.variant]).toEqual(['fits_month', 'low_month']);
    expect(fact(e, 'lean_bridge')?.values).toEqual({ source: 'savings', month: '2026-09', shortfall: 110_000, times: 2, payments: 12, until: '2027-11', bridge: 220_000, savings: 400_000 });
    expect(e.result.missing).toEqual([]);
    expect(codes(e)).not.toContain('low_month'); // September is the low month; May's $600 carries $200
    expect(codes(e)).toContain('net_none_start');
  });

  it('QE-14 by hand: the same $2,200 is her protected safety net, so Dips into your safety net, named', () => {
    const e = run(fx('QE-14'));
    expect([e.result.code, e.result.variant]).toEqual(['fits_uses_net', null]);
    expect(fact(e, 'lean_bridge')?.values['source']).toBe('net');
    expect(fact(e, 'net_used')?.values).toEqual({ used: 220_000 });
    expect(fact(e, 'net_left')?.values).toEqual({ left: 180_000 });
    expect(codes(e)).not.toContain('emergency_untouched');
  });

  it('QE-14 locked (D-61): the net is left out, so the question is asked', () => {
    const f = fx('QE-14');
    const e = run({ ...f, safetyNet: { ...(f.safetyNet as NonNullable<RightAnswerFixture['safetyNet']>), locked: true } });
    expect(e.result.code).toBe('needs_input');
    expect(e.result.missing).toEqual(['volatile_cover_question']);
  });

  it('QE-14 with protection off, a $0 size and a net below its size: the low months say how protection reads', () => {
    const f = fx('QE-14');
    const net = f.safetyNet as NonNullable<RightAnswerFixture['safetyNet']>;
    const off = run({ ...f, safetyNet: { ...net, protect: false } });
    expect([off.result.code, off.result.variant]).toEqual(['fits_uses_net', 'protection_off']);
    expect(codes(off)).toContain('net_protection_off');
    const zero = run({ ...f, safetyNet: { ...net, size: 0 } });
    expect(codes(zero)).toContain('net_zero_is_off');
    const small = run({ ...f, safetyNet: { ...net, size: 500_000 } });
    expect(small.result.code).toBe('fits_uses_net');
    expect(fact(small, 'net_progress')?.values).toEqual({ saved: 400_000, size: 500_000 });
  });

  it('QE-03 by hand: $500 cannot carry -$1,100, her yes is Only on your answer, with the starter line and the user_said_cover reason', () => {
    const e = run(fx('QE-03'));
    expect([e.result.code, e.result.variant, e.result.legacyState]).toEqual(['fits_on_your_answer', null, 'adjust']);
    expect(fact(e, 'rests_on_your_answer')?.values).toEqual({ monthly: 20_000, months: 12 });
    expect(codes(e)).toContain('net_none_start');
    expect(e.result.confidence.reasons.map((r) => r.code)).toContain('user_said_cover');
    expect(e.result.notices.find((n) => n.code === 'income_volatile')?.values['months']).toBe(12);
  });

  it('QE-03 with no answer asks the cover question; savings that carry it never ask', () => {
    const f = fx('QE-03');
    const asked = run({ ...f, check: { ...f.check, yourAnswer: null } });
    expect(asked.result.missing).toEqual(['volatile_cover_question']);
    const rich = run({ ...f, accounts: f.accounts.map((a) => (a.kind === 'savings' ? { ...a, balance: 400_000 } : a)) });
    expect([rich.result.code, rich.result.variant]).toEqual(['fits_month', 'low_month']);
    expect(codes(rich)).not.toContain('rests_on_your_answer');
  });

  it('QE-05 by hand: her no waits for $1,100 from $500 at $600 a month, December 2026, never a bare never', () => {
    const e = run(fx('QE-05'));
    expect([e.result.code, e.result.variant, e.result.readyBy]).toEqual(['not_yet', 'not_covered', { kind: 'month', month: '2026-12' }]);
    expect(e.result.reasons).toContain('volatile_cover_declined');
  });

  it('a yes the records already beat is not on your answer (a one-off part that is Not yet leads, no rests line)', () => {
    const f = fx('QE-03');
    const e = run({ ...f, check: { ...f.check, pay: { ...(f.check.pay as Extract<RightAnswerFixture['check']['pay'], { mode: 'plan' }>), deposit: 200_000 } } });
    expect(e.result.code).toBe('not_yet');
    expect(codes(e)).not.toContain('rests_on_your_answer');
    expect(e.result.confidence.reasons.map((r) => r.code)).not.toContain('user_said_cover');
  });
});

describe('05.4-23 the pay cut (FIN-15)', () => {
  it('QE-06 by hand: judged on $2,720 (the middle of $2,700, $2,750, $2,720), 9.3% below $3,000, named; $720 - $850 is Short each month', () => {
    const e = run(fx('QE-06'));
    expect(e.result.code).toBe('monthly_short');
    expect(e.result.reasons).toContain('pay_gap');
    expect(e.result.notices.find((n) => n.code === 'pay_gap')?.values).toEqual({ setup: 300_000, middle: 272_000, gap: '9.3' });
    expect(e.month.typicalIncome).toBe(272_000);
  });

  it('a gap of 5% or less is counted but not named; a raise counts the set-up pay', () => {
    const f = fx('QE-06');
    const near = run({ ...f, pay: { ...f.pay, lastThree: [290_000, 286_000, 285_000] } });
    expect(near.month.typicalIncome).toBe(286_000);
    expect(near.result.reasons).not.toContain('pay_gap');
    const raise = run({ ...f, pay: { ...f.pay, lastThree: [310_000, 320_000, 330_000] } });
    expect(raise.month.typicalIncome).toBe(300_000);
  });

  it('payBasis: fewer than 3 arrivals, a month not full, this month and other series are not read', () => {
    const s = v3Series({ id: 'pay', role: 'pay', cadence: { unit: 'month', every: 1 }, anchorDate: '2026-01-01', amount: 300_000 });
    const pay = (m: string, amount: number, seriesId = 'pay') => v3Line({ id: `${seriesId}-${m}`, date: `${m}-01`, amount, role: 'income', seriesId });
    const hist: V3Month[] = [monthOf('2026-08', [pay('2026-08', 200_000)]), monthOf('2026-09', [pay('2026-09', 200_000)])];
    expect(payBasis(s, hist, '2026-11-15')).toEqual({ amount: 300_000n, gap: null });
    const more = [...hist, monthOf('2026-10', [pay('2026-10', 200_000)], { full: false }), monthOf('2026-11', [pay('2026-11', 200_000)]), monthOf('2026-07', [pay('2026-07', 100_000, 'other')])];
    expect(payBasis(s, more, '2026-11-15')).toEqual({ amount: 300_000n, gap: null });
    const three = [...hist, monthOf('2026-10', [pay('2026-10', 290_000)])];
    expect(payBasis(s, three, '2026-11-15')).toEqual({ amount: 200_000n, gap: { setup: 300_000, middle: 200_000, gapBp: 3333 } });
  });

  it('lowPayMonths: only a pay that arrived more than 5% low, in a full month before this one, on a live pay series', () => {
    const s = v3Series({ id: 'pay', role: 'pay', cadence: { unit: 'month', every: 1 }, anchorDate: '2026-01-01', amount: 300_000 });
    const line = (m: string, amount: number, over: Partial<Parameters<typeof v3Line>[0]> = {}) => v3Line({ id: `l-${m}-${amount}`, date: `${m}-01`, amount, role: 'income', seriesId: 'pay', ...over });
    const hist: V3Month[] = [
      monthOf('2026-05', [line('2026-05', 285_000)]), // 5% low: not more than 5%
      monthOf('2026-06', [line('2026-06', 284_000)]), // low
      monthOf('2026-07', [line('2026-07', 100_000)], { full: false }),
      monthOf('2026-08', [line('2026-08', 100_000, { status: 'pending' })]),
      monthOf('2026-09', [line('2026-09', 100_000, { seriesId: null })]),
      monthOf('2026-10', [line('2026-10', 100_000, { role: 'spending' })]),
      monthOf('2026-11', [line('2026-11', 100_000)]),
    ];
    expect([...lowPayMonths(hist, [s], '2026-11-15')]).toEqual(['2026-06']);
  });

  it('percentText rounds down to one decimal', () => {
    expect([percentText(933), percentText(1000), percentText(5), percentText(501)]).toEqual(['9.3', '10.0', '0.0', '5.0']);
  });
});

describe('05.4-23 the runway lines (D-40, D-46)', () => {
  it('QE-12 by hand: about 44 of the 48 payments, and about 12 of the 48 with another £1,000 a month', () => {
    const e = run(fx('QE-12'));
    expect(fact(e, 'covered_from_savings')?.values['covered']).toBe(44);
    expect(fact(e, 'covered_from_savings')?.values['of']).toBe(48);
    expect(fact(e, 'further_shortfall_runway')?.values).toEqual({ extra: 100_000, covered: 12, of: 48 });
    for (const c of ['covered_from_savings', 'further_shortfall_runway', 'income_or_costs_first', 'save_vs_borrow']) expect(codes(e)).toContain(c);
  });

  it('a first payment today counts as one payment covered (never by its amount): 1 + whole months of the gap', () => {
    const f = fx('QE-12');
    const plan = f.check.pay as Extract<RightAnswerFixture['check']['pay'], { mode: 'plan' }>;
    const e = run({ ...f, check: { ...f.check, pay: { ...plan, firstPaymentDate: '2026-10-15' } } });
    const c = fact(e, 'covered_from_savings')?.values as Record<string, number>;
    const x = fact(e, 'further_shortfall_runway')?.values as Record<string, number>;
    expect(c['covered']).toBe(1 + Math.floor(c['savings']! / c['gap']!));
    expect(x['covered']).toBe(1 + Math.floor(c['savings']! / (c['gap']! + 100_000)));
    expect(c['covered']).toBeLessThan(48);
  });

  it('QE-06: savings cover 5 of the 12 at a $130 gap, but not one month of a $1,130 gap, so no further line', () => {
    const e = run(fx('QE-06'));
    expect(fact(e, 'covered_from_savings')?.values).toEqual({ savings: 72_000, gap: 13_000, covered: 5, of: 12 });
    expect(codes(e)).not.toContain('further_shortfall_runway');
  });

  it('furtherStep is 1,000 of the currency in its minor units', () => {
    expect([furtherStep(currencyCode('USD')), furtherStep(currencyCode('JPY')), furtherStep(currencyCode('BHD'))]).toEqual([100_000, 1_000, 1_000_000]);
  });

  it('runwayFacts says nothing when the usual month is unknown or not short, the plan is not monthly, or money covers no month', () => {
    const e = run(fx('QE-12'));
    const p = e.purchase as Purchase;
    const m = e.month;
    const r = (over: { month?: Partial<MonthModel>; purchase?: Partial<Purchase>; money?: number }) =>
      runwayFacts({ month: { ...m, ...over.month }, purchase: { ...p, ...over.purchase }, asOf: '2026-10-15', money: mu(over.money ?? 1_540_645), step: mu(100_000) });
    expect(r({}).map((f) => f.code)).toEqual(['covered_from_savings', 'further_shortfall_runway']);
    expect(r({ month: { typicalLeft: null } })).toEqual([]);
    expect(r({ month: { typicalLeft: p.monthly } })).toEqual([]);
    const s = p.schedule as NonNullable<Purchase['schedule']>;
    expect(r({ purchase: { schedule: { ...s, cadence: { unit: 'week', every: 2 } } } })).toEqual([]);
    expect(r({ purchase: { schedule: { ...s, cadence: { unit: 'month', every: 3 } } } })).toEqual([]);
    expect(r({ money: 30_000 })).toEqual([]);
    expect(r({ money: 99_999_999 })[0]?.values['covered']).toBe(48); // capped at the term
  });

  it('keptSavings counts money kept in savings accounts only', () => {
    const acc = (kind: 'savings' | 'checking', use: 'untouched' | 'everyday' | null, balance: number): V3Account => ({ id: `${kind}-${use}-${balance}`, kind, balance: mu(balance), use: use === null ? null : { kind: use } });
    expect(keptSavings(undefined)).toBe(0);
    expect(keptSavings([acc('savings', 'untouched', 50_000), acc('savings', 'untouched', -10), acc('checking', 'untouched', 9), acc('savings', 'everyday', 7), acc('savings', null, 5)])).toBe(50_000);
  });
});

describe('05.4-23 edges: two pay series, and two readings that both rest on your word', () => {
  it('typicalIncome names the first pay series with a gap and counts each at its lower amount', () => {
    const s1 = v3Series({ id: 'a', role: 'pay', cadence: { unit: 'month', every: 1 }, anchorDate: '2026-01-01', amount: 200_000 });
    const s2 = v3Series({ id: 'b', role: 'pay', cadence: { unit: 'month', every: 1 }, anchorDate: '2026-01-01', amount: 100_000 });
    const pay = (id: string, m: string, amount: number) => v3Line({ id: `${id}-${m}`, date: `${m}-01`, amount, role: 'income', seriesId: id });
    const hist: V3Month[] = ['2026-08', '2026-09', '2026-10'].map((m) => monthOf(m, [pay('a', m, 150_000), pay('b', m, 80_000)]));
    const t = typicalIncome({ asOf: '2026-11-15', current: null, history: hist, series: [s1, s2], profile: null, typedEstimates: null, custom: { itemTypes: [], purposes: [], cadences: [], incomeKinds: [] } });
    expect(t.amount).toBe(230_000);
    expect(t.payGap).toEqual({ setup: 200_000, middle: 150_000, gapBp: 2500 });
  });

  it('stricterOf keeps the first reading when both rest on your answer', () => {
    const yes = run(fx('QE-03'));
    const again = run(fx('QE-03'));
    const out = stricterOf(yes, again);
    expect(out.result.facts.some((f) => f.code === 'rests_on_your_answer')).toBe(true);
    expect(out.result.confidence.reasons.map((r) => r.code)).toContain('user_said_cover');
  });
});
