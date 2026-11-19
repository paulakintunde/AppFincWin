/**
 * prepare / judgeCheck (05.4-13, ENG-12). Purity, one Prepared for many checks, and an indicative Node timing for one
 * judgeCheck on a heavy account. Node is not the device: the 8 ms budget is checked on the Pixel 6 in 05.4-34.
 */
import { minorUnits } from '../../../money/types';
import { percent } from '../../../payoff/types';
import { evaluate } from '../evaluate';
import { judgeCheck, prepare, stricterOf, type Evaluation } from '../prepare';
import { withReason } from '../confidence/reasons';
import { CLEAN_CONFIDENCE } from './helpers/restsOn';
import type { Code, Confidence, Fact, ReadyBy, ReasonCode, V3Inputs, V3Line, V3Month, V3Series } from '../types';
import { checkOnce, checkPlan, inputsOf, monthOf, v3Line, v3Series } from './helpers/fixtures';
import { loadPersons, toV3Inputs } from './golden/adapter';

const mu = minorUnits;

function heavyInputs(): V3Inputs {
  const months: V3Month[] = [];
  for (let m = 0; m < 12; m++) {
    const ym = `2026-${String(m < 10 ? m + 1 : m - 9).padStart(2, '0')}`;
    const lines: V3Line[] = [];
    for (let i = 0; i < 120; i++) {
      lines.push(v3Line({ id: `l-${ym}-${i}`, date: `${ym}-${String((i % 27) + 1).padStart(2, '0')}`, amount: 1500 + ((i * 37) % 900), categoryId: `c${i % 12}` }));
    }
    months.push(monthOf(ym, lines));
  }
  const series: V3Series[] = [];
  for (let i = 0; i < 20; i++) {
    series.push(
      v3Series({
        id: `s${i}`,
        role: i < 2 ? 'pay' : i < 6 ? 'debt_payment' : 'bill',
        cadence: { unit: 'month', every: 1 },
        anchorDate: `2026-01-${String((i % 27) + 1).padStart(2, '0')}`,
        amount: i < 2 ? 250_000 : 5000 + i * 300,
      })
    );
  }
  const debts = Array.from({ length: 6 }, (_, i) => ({
    id: `d${i}`,
    kind: 'loan' as const,
    balance: mu(500_000 + i * 10_000),
    minimum: mu(5000),
    apr: percent('12'),
    secured: false,
    isHousing: false,
  }));
  const accounts = Array.from({ length: 4 }, (_, i) => ({ id: `a${i}`, balance: mu(300_000), use: { kind: 'everyday' as const } }));
  return inputsOf({ months, series, debts, accounts, balance: mu(1_200_000), asOf: '2026-10-03' });
}

describe('prepare / judgeCheck', () => {
  it('prepare is pure: twice gives deep-equal results', () => {
    const inputs = heavyInputs();
    expect(prepare(inputs)).toEqual(prepare(inputs));
  });

  it('prepares both readings for thin history and one for full history', () => {
    const person = loadPersons().find((p) => p.months.length > 0);
    expect(person).toBeDefined();
    const base = toV3Inputs(person as NonNullable<typeof person>, { custom: { itemTypes: [], purposes: [], cadences: [], incomeKinds: [] } });
    const ym = base.asOf.slice(0, 7);
    const full = { ...base, months: base.months.map((m) => ({ ...m, full: true })) };
    const thin = { ...base, months: base.months.map((m) => (m.month < ym ? { ...m, full: false } : m)) };
    expect(prepare(full).readings).toHaveLength(1);
    if (thin.months.some((m) => m.month < ym)) expect(prepare(thin).readings).toHaveLength(2);
  });

  it('10 prices on one Prepared equal 10 fresh evaluate calls', () => {
    const inputs = heavyInputs();
    const p = prepare(inputs);
    for (let i = 1; i <= 10; i++) {
      const check = i % 2 === 0 ? checkOnce(i * 40_000) : checkPlan(i * 40_000, { count: 12, apr: percent('9') });
      expect(judgeCheck(p, check)).toEqual(evaluate(inputs, check));
    }
  });

  it('judgeCheck on the heavy account is quick (indicative Node timing)', () => {
    const p = prepare(heavyInputs());
    const times: number[] = [];
    for (let i = 0; i < 200; i++) {
      const t0 = performance.now();
      judgeCheck(p, checkOnce(10_000 + i * 997));
      times.push(performance.now() - t0);
    }
    times.sort((a, b) => a - b);
    const p50 = times[100] as number;
    const p95 = times[190] as number;
    console.log(`judgeCheck heavy account: p50 ${p50.toFixed(2)} ms, p95 ${p95.toFixed(2)} ms`);
    expect(p95).toBeLessThan(50);
  });
});

describe('stricterOf (05.4-62 mutation kills)', () => {
  const baseEval = evaluate(inputsOf(), checkOnce(1000));
  const RESTS: Fact = { code: 'rests_on_your_answer', values: {} };
  const OTHER: Fact = { code: 'no_full_month', values: {} };
  const made = (o: { code?: Code; readyBy?: ReadyBy | null; facts?: Fact[]; reasons?: ReasonCode[]; confidence?: Confidence; mark?: string }): Evaluation => ({
    ...baseEval,
    result: {
      ...baseEval.result,
      code: o.code ?? 'fits_month',
      readyBy: o.readyBy ?? null,
      facts: o.facts ?? [],
      reasons: o.reasons ?? [],
      confidence: o.confidence ?? CLEAN_CONFIDENCE,
      purchaseDate: o.mark ?? '2026-11-01',
    },
  });
  const codesOf = (e: Evaluation) => e.result.confidence.reasons.map((r) => r.code);

  it('the reading with the stricter code wins, and says so only when it is the second', () => {
    const fits = made({ code: 'fits_month', mark: 'a' });
    const notYet = made({ code: 'not_yet', mark: 'b' });
    const second = stricterOf(fits, notYet);
    expect(second.result.code).toBe('not_yet');
    expect(second.result.purchaseDate).toBe('b');
    expect(second.result.reasons).toEqual(['thin_history_stricter']);
    const first = stricterOf(made({ code: 'not_yet', mark: 'a' }), made({ code: 'fits_month', mark: 'b' }));
    expect(first.result.purchaseDate).toBe('a');
    expect(first.result.reasons).toEqual([]);
  });

  it('the reasons are the sorted union without repeats', () => {
    const r = stricterOf(made({ reasons: ['records_synced', 'debt_due_day_assumed'] }), made({ reasons: ['debt_due_day_assumed'] })).result.reasons;
    expect(r).toEqual(['debt_due_day_assumed', 'records_synced']);
    const withThin = stricterOf(made({ reasons: ['records_synced'] }), made({ code: 'not_yet', reasons: ['debt_due_day_assumed'] })).result.reasons;
    expect(withThin).toEqual(['debt_due_day_assumed', 'records_synced', 'thin_history_stricter']);
  });

  it('two not_yet readings tie on the later ready date, a null date counting as never', () => {
    const at = (readyBy: ReadyBy | null, mark: string) => made({ code: 'not_yet', readyBy, mark });
    const d1: ReadyBy = { kind: 'date', date: '2026-12-01' };
    const d2: ReadyBy = { kind: 'date', date: '2026-12-02' };
    const m12: ReadyBy = { kind: 'month', month: '2026-12' };
    const pick = (a: ReadyBy | null, b: ReadyBy | null) => stricterOf(at(a, 'a'), at(b, 'b'));
    expect(pick(d1, d2).result.purchaseDate).toBe('b');
    expect(pick(d1, d2).result.reasons).toEqual(['thin_history_stricter']);
    expect(pick(d2, d1).result.purchaseDate).toBe('a');
    expect(pick(d1, m12).result.purchaseDate).toBe('a'); // the first of the month is the same key as the date
    expect(pick(m12, d2).result.purchaseDate).toBe('b');
    expect(pick(d1, null).result.purchaseDate).toBe('b');
    expect(pick(null, d1).result.purchaseDate).toBe('a');
    expect(pick(null, null).result.purchaseDate).toBe('a');
  });

  it('a later ready date only breaks a tie between not_yet readings', () => {
    const later: ReadyBy = { kind: 'date', date: '2027-01-01' };
    const r = stricterOf(made({ code: 'fits_month', mark: 'a' }), made({ code: 'fits_month', readyBy: later, mark: 'b' }));
    expect(r.result.purchaseDate).toBe('a');
    expect(r.result.reasons).toEqual([]);
  });

  it('on a tie the reading that does not rest on the answer wins, and that is not called stricter', () => {
    const pick = (a: Fact[], b: Fact[]) => stricterOf(made({ facts: a, mark: 'a' }), made({ facts: b, mark: 'b' }));
    const bWins = pick([RESTS], [OTHER]);
    expect(bWins.result.purchaseDate).toBe('b');
    expect(bWins.result.reasons).toEqual([]);
    expect(pick([OTHER, RESTS], [OTHER]).result.purchaseDate).toBe('b'); // found anywhere in the list
    expect(pick([OTHER], [RESTS]).result.purchaseDate).toBe('a');
    expect(pick([RESTS], [OTHER, RESTS]).result.purchaseDate).toBe('a');
    expect(pick([OTHER], [OTHER]).result.purchaseDate).toBe('a');
    expect(pick([], []).result.purchaseDate).toBe('a');
    expect(stricterOf(made({ code: 'not_yet', facts: [RESTS], mark: 'a' }), made({ code: 'fits_month', mark: 'b' })).result.purchaseDate).toBe('a');
  });

  it('the losing reading yes is dropped from the merged confidence only when the winner does not rest on it', () => {
    const said = withReason(withReason(CLEAN_CONFIDENCE, 'few_months', { used: 1, lookedFor: 3 }), 'user_said_cover');
    // a rests and b does not: b wins; a is the loser, its yes is not merged but its other reasons are
    const loserRests = stricterOf(made({ facts: [RESTS], confidence: said }), made({ facts: [OTHER] }));
    expect(codesOf(loserRests)).toContain('few_months');
    expect(codesOf(loserRests)).not.toContain('user_said_cover');
    // both rest: the yes is kept
    expect(codesOf(stricterOf(made({ facts: [RESTS] }), made({ facts: [RESTS], confidence: said })))).toContain('user_said_cover');
    // the winner rests and the loser does not: the loser's reasons are merged as they are
    const winnerRests = stricterOf(made({ code: 'not_yet', facts: [RESTS] }), made({ code: 'fits_month', facts: [OTHER], confidence: said }));
    expect(codesOf(winnerRests)).toContain('user_said_cover');
    // neither rests: nothing is dropped
    expect(codesOf(stricterOf(made({}), made({ confidence: said })))).toContain('user_said_cover');
  });
});

describe('prepare readings and settled occurrences (05.4-62 mutation kills)', () => {
  const MONTHLY = { unit: 'month', every: 1 } as const;
  const rent = v3Series({ id: 'rent', role: 'bill', cadence: MONTHLY, anchorDate: '2026-01-01', amount: 100000 });
  const pay = v3Series({ id: 'pay', role: 'pay', cadence: MONTHLY, anchorDate: '2026-01-30', amount: 300000 });
  const rentLine = (id: string, date: string, status: 'paid' | 'pending' = 'paid') => v3Line({ id, date, amount: 100000, seriesId: 'rent', status });
  const payLine = (id: string, date: string, status: 'paid' | 'pending' = 'paid') => v3Line({ id, date, amount: 300000, seriesId: 'pay', role: 'income', status });
  const settledOf = (months: V3Month[]): string[] => [...prepare(inputsOf({ asOf: '2026-10-05', series: [rent, pay], months })).readings[0]!.paid].sort();

  it('a paid line this month and a paid pay line just before it settle their dues', () => {
    expect(settledOf([monthOf('2026-09', [payLine('p', '2026-09-30')]), monthOf('2026-10', [rentLine('r', '2026-10-01')])])).toEqual(['pay|2026-09-30', 'rent|2026-10-01']);
  });

  it('a pending line settles nothing', () => {
    expect(settledOf([monthOf('2026-09', [payLine('p', '2026-09-30', 'pending')]), monthOf('2026-10', [rentLine('r', '2026-10-01', 'pending')])])).toEqual([]);
  });

  it('a line dated outside the month it is filed under does not settle this month', () => {
    expect(settledOf([monthOf('2026-10', [rentLine('r', '2026-09-30')])])).toEqual([]);
  });

  it('last month only helps pay series, and only from 7 days before the first', () => {
    expect(settledOf([monthOf('2026-09', [rentLine('r', '2026-09-30')])])).toEqual([]);
    expect(settledOf([monthOf('2026-09', [payLine('p', '2026-09-24')])])).toEqual(['pay|2026-09-30']);
    expect(settledOf([monthOf('2026-09', [payLine('p', '2026-09-23')])])).toEqual([]);
  });

  it('last month is the month before this one, wherever it sits in the list', () => {
    expect(settledOf([monthOf('2026-08', [payLine('p', '2026-09-30')]), monthOf('2026-09', [])])).toEqual([]);
  });

  it('thin history reads the months before this one as full the second time, nothing else', () => {
    const months = [monthOf('2026-08', [], { full: false }), monthOf('2026-09', []), monthOf('2026-10', [], { full: false }), monthOf('2026-11', [], { full: false })];
    const p = prepare(inputsOf({ asOf: '2026-10-05', months }));
    expect(p.readings).toHaveLength(2);
    expect(p.readings[0]!.inputs.months.map((m) => m.full)).toEqual([false, true, false, false]);
    expect(p.readings[1]!.inputs.months.map((m) => m.full)).toEqual([true, true, false, false]);
    expect(prepare(inputsOf({ asOf: '2026-10-05', months: [monthOf('2026-09', []), monthOf('2026-10', [], { full: false })] })).readings).toHaveLength(1);
    expect(prepare(inputsOf({ asOf: '2026-10-05', months: [monthOf('2026-10', [], { full: false })] })).readings).toHaveLength(1);
  });

  it('noFullMonth is true unless a complete month before this one exists', () => {
    const no = (months: V3Month[]) => prepare(inputsOf({ asOf: '2026-10-05', months })).noFullMonth;
    expect(no([])).toBe(true);
    expect(no([monthOf('2026-09', [])])).toBe(false);
    expect(no([monthOf('2026-09', [], { full: false })])).toBe(true);
    expect(no([monthOf('2026-10', [])])).toBe(true);
    expect(no([monthOf('2026-11', [])])).toBe(true);
  });

  it('an account with no rate counts as holding 0 and its envelopes as saved 0; others stay', () => {
    const env = (id: string, accountId: string | null) => ({ id, kind: 'pot' as const, target: null, monthlyAmount: null, readyBy: null, saved: mu(500), purposeId: null, accountId });
    const accounts = [
      { id: 'a1', balance: mu(7000), use: { kind: 'everyday' as const }, noRate: true },
      { id: 'a2', balance: mu(9000), use: { kind: 'everyday' as const } },
    ];
    const p = prepare(inputsOf({ accounts, envelopes: [env('e1', 'a1'), env('e2', 'a2'), env('e3', null)] }));
    expect(p.unrated).toEqual(['a1']);
    expect(p.inputs.envelopes.map((e) => [e.id, Number(e.saved)])).toEqual([['e1', 0], ['e2', 500], ['e3', 500]]);
    expect(p.inputs.accounts?.map((a) => [a.id, Number(a.balance)])).toEqual([['a1', 0], ['a2', 9000]]);
    expect(prepare(inputsOf({ accounts: [accounts[1]!] })).unrated).toEqual([]);
  });
});
