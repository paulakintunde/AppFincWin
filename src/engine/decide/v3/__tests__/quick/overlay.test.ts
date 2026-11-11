/**
 * 06.1 D-21: quick lines for one check only (quick/overlay.ts). Branch coverage of the overlay is held at 100%.
 */
import { minorUnits } from '../../../../money/types';
import { judgeCheck, prepare } from '../../prepare';
import { judgeWithQuickLines, withQuickFacts, withQuickLines } from '../../quick/overlay';
import type { CheckV2, Envelope, Fact, QuickLine, V3Account, V3Inputs } from '../../types';
import { ASOF, checkOnce, inputsOf } from '../helpers/fixtures';
import { toEngineInputs } from '../rightAnswers/fixture';
import { loadCases } from '../rightAnswers/loader';
import { pick } from '../rightAnswers/pick';

const mu = minorUnits;

function deepFreeze<T>(o: T): T {
  if (o !== null && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o as Record<string, unknown>)) deepFreeze(v);
  }
  return o;
}

const expense = (over: Partial<Extract<QuickLine, { kind: 'expense' }>> = {}): QuickLine => ({ id: 'e', kind: 'expense', name: 'Gym', amount: mu(5_000), everyMonths: 1, date: null, ...over });
const loan = (over: Partial<Extract<QuickLine, { kind: 'loan' }>> = {}): QuickLine => ({ id: 'l', kind: 'loan', name: 'Loan', monthly: mu(15_000), payments: 6, firstDate: null, ...over });
const savings = (over: Partial<Extract<QuickLine, { kind: 'savings' }>> = {}): QuickLine => ({ id: 's', kind: 'savings', name: 'Savings', amount: mu(60_000), usable: true, ...over });
const income = (over: Partial<Extract<QuickLine, { kind: 'income' }>> = {}): QuickLine => ({ id: 'i', kind: 'income', name: 'Gift', amount: mu(40_000), everyMonths: 0, date: '2026-10-10', ...over });
const withLines = (lines: readonly QuickLine[]): CheckV2 => checkOnce(10_000, { quickLines: lines });

describe('withQuickLines', () => {
  it('a check with no quick lines gives the same inputs object and nothing counted', () => {
    const inputs = inputsOf();
    const r = withQuickLines(inputs, checkOnce(10_000));
    expect(r.inputs).toBe(inputs);
    expect(r.counted).toBe(0);
    expect(r.savings).toBe(0);
    expect(r.check.quickLines).toBeUndefined();
  });

  it('lines that count nowhere leave the inputs alone', () => {
    const inputs = inputsOf();
    const r = withQuickLines(
      inputs,
      withLines([
        expense({ amount: mu(0) }),
        loan({ monthly: mu(0) }),
        loan({ payments: 0 }),
        loan({ payments: 1.5 }),
        income({ amount: mu(0) }),
        savings({ usable: false }),
        savings({ amount: mu(0) }),
      ])
    );
    expect(r.inputs).toBe(inputs);
    expect(r.counted).toBe(0);
  });

  it('a repeating expense is a running cost from its date, or from today', () => {
    const a = withQuickLines(inputsOf(), withLines([expense({ date: '2026-11-20', everyMonths: 3 }), expense({ id: 'f' })]));
    expect(a.counted).toBe(2);
    expect(a.check.runningCosts).toEqual([
      { id: 'q:e', amount: 5_000, everyMonths: 3, start: '2026-11-20', end: null, on: true },
      { id: 'q:f', amount: 5_000, everyMonths: 1, start: ASOF, end: null, on: true },
    ]);
    const b = withQuickLines(inputsOf(), withLines([expense({ date: 'not a date' })]));
    expect(b.check.runningCosts?.[0]?.start).toBe(ASOF);
  });

  it('keeps the running costs the check already has', () => {
    const own = { id: 'rc', amount: mu(100), everyMonths: 1 as const, start: ASOF, end: null, on: true };
    const r = withQuickLines(inputsOf(), checkOnce(10_000, { runningCosts: [own], quickLines: [expense()] }));
    expect(r.check.runningCosts?.map((x) => x.id)).toEqual(['rc', 'q:e']);
  });

  it('a once expense is one bill on its date, or today when it has none or it is past; left out of the usual month', () => {
    const r = withQuickLines(inputsOf(), withLines([expense({ everyMonths: 0, date: '2026-10-20' }), expense({ id: 'p', everyMonths: 0, date: '2026-09-01' }), expense({ id: 'n', everyMonths: 0 })]));
    const [a, p, n] = r.inputs.series;
    expect([a?.anchorDate, a?.endDate, p?.anchorDate, p?.endDate, n?.anchorDate, n?.endDate]).toEqual(['2026-10-20', '2026-10-20', ASOF, ASOF, ASOF, ASOF]);
    expect(a).toMatchObject({ id: 'q:e', name: 'Gym', role: 'bill', typicalChoice: 'excluded', status: 'live', confirmed: true });
    expect(a?.cadence).toEqual({ unit: 'month', every: 12 });
    expect(r.check.runningCosts).toEqual([]);
  });

  it('a loan is a recorded debt of the payments still to come, due on its first date\'s day', () => {
    const r = withQuickLines(inputsOf(), withLines([loan({ firstDate: '2026-10-25' }), loan({ id: 'm' }), loan({ id: 'x', firstDate: 'nope' })]));
    expect(r.inputs.debts.map((d) => [d.id, d.balance, d.minimum, d.dueDay, d.kind, d.apr])).toEqual([
      ['q:l', 90_000, 15_000, 25, 'loan', null],
      ['q:m', 90_000, 15_000, 3, 'loan', null],
      ['q:x', 90_000, 15_000, 3, 'loan', null],
    ]);
  });

  it('a loan with a past first date has used up one payment a month, and none is left when all are past', () => {
    const r = withQuickLines(inputsOf(), withLines([loan({ firstDate: '2026-08-10' })]));
    // 10 Aug, 10 Sep paid; the next is 10 Oct (after 3 Oct): 4 of 6 left
    expect(r.inputs.debts[0]).toMatchObject({ balance: 60_000, dueDay: 10 });
    const gone = withQuickLines(inputsOf(), withLines([loan({ firstDate: '2026-05-10', payments: 4 })]));
    expect(gone.counted).toBe(0);
    expect(gone.inputs.debts).toEqual([]);
  });

  it('a loan that adds up to more than a safe integer counts nowhere', () => {
    const r = withQuickLines(inputsOf(), withLines([loan({ monthly: mu(Number.MAX_SAFE_INTEGER), payments: 2 })]));
    expect(r.counted).toBe(0);
  });

  it('income once is one pay on its date; a date today or earlier counts from tomorrow; none counts from tomorrow', () => {
    const r = withQuickLines(inputsOf(), withLines([income(), income({ id: 'p', date: ASOF }), income({ id: 'n', date: 'nope' })]));
    const [a, p, n] = r.inputs.series;
    expect([a?.anchorDate, a?.endDate, p?.anchorDate, p?.endDate, n?.anchorDate]).toEqual(['2026-10-10', '2026-10-10', '2026-10-04', '2026-10-04', '2026-10-04']);
    expect(a).toMatchObject({ id: 'q:i', role: 'pay', typicalChoice: 'excluded', amount: 40_000 });
  });

  it('income every month starts at its first date after today and has no end', () => {
    const r = withQuickLines(inputsOf(), withLines([income({ everyMonths: 1, date: '2026-08-20' }), income({ id: 'f', everyMonths: 1, date: '2026-10-20' })]));
    const [a, f] = r.inputs.series;
    expect([a?.anchorDate, a?.endDate, f?.anchorDate]).toEqual(['2026-10-20', null, '2026-10-20']);
    expect(a).toMatchObject({ role: 'pay', typicalChoice: 'monthly' });
    expect(a?.cadence).toEqual({ unit: 'month', every: 1 });
  });

  it('income landing this month is added to this month\'s unspent money, when there is some', () => {
    const unspent = { amount: mu(100_000), at: ASOF };
    const lines = [income(), income({ id: 'm', everyMonths: 1, date: '2026-10-28' }), income({ id: 'later', date: '2026-11-05' }), income({ id: 'm2', everyMonths: 1, date: '2026-11-05' })];
    const r = withQuickLines(inputsOf({ unspent }), withLines(lines));
    expect(r.inputs.unspent).toEqual({ amount: 100_000 + 80_000, at: ASOF });
    expect(withQuickLines(inputsOf({ unspent: null }), withLines(lines)).inputs.unspent).toBeNull();
  });

  it('usable savings are an unlocked goal in their own untouched savings account', () => {
    const accounts: V3Account[] = [{ id: 'a1', balance: mu(50_000), use: { kind: 'everyday' }, kind: 'checking' }];
    const r = withQuickLines(inputsOf({ accounts }), withLines([savings()]));
    expect(r.savings).toBe(60_000);
    expect(r.inputs.accounts).toEqual([...accounts, { id: 'q:s', balance: 60_000, use: { kind: 'untouched' }, kind: 'savings' }]);
    expect(r.inputs.envelopes).toEqual([{ id: 'q:s', kind: 'pot', target: null, monthlyAmount: null, readyBy: null, saved: mu(60_000), purposeId: null, accountId: 'q:s', locked: false } satisfies Envelope]);
  });

  it('with no accounts given, the balance stands in as the everyday account, the fund added back', () => {
    const none = withQuickLines(inputsOf({ balance: mu(70_000) }), withLines([savings()]));
    expect(none.inputs.accounts?.[0]).toEqual({ id: 'q:spending', balance: 70_000, use: { kind: 'everyday' }, kind: 'checking' });
    const fund = withQuickLines(inputsOf({ balance: mu(70_000), emergency: { amount: mu(30_000) } }), withLines([savings()]));
    expect(fund.inputs.accounts?.[0]?.balance).toBe(100_000);
    expect(withQuickLines(inputsOf(), withLines([expense()])).inputs.accounts).toBeUndefined();
  });

  it('never changes the inputs or the check it was given', () => {
    const inputs = deepFreeze(inputsOf({ unspent: { amount: mu(1_000), at: ASOF }, accounts: [{ id: 'a1', balance: mu(5), use: { kind: 'everyday' }, kind: 'checking' }] }));
    const check = deepFreeze(withLines([expense(), expense({ id: 'o', everyMonths: 0, date: '2026-10-20' }), loan(), income(), savings()]));
    expect(() => withQuickLines(inputs, check)).not.toThrow();
  });
});

describe('withQuickFacts', () => {
  const f = (code: Fact['code'], values: Fact['values'] = {}): Fact => ({ code, values });
  it('puts the quick-line fact before free_help, after the engine\'s own facts', () => {
    const r = withQuickFacts([f('month_left_after'), f('free_help', { name: 'x' })], 2, mu(0));
    expect(r.map((x) => x.code)).toEqual(['month_left_after', 'quick_lines_counted', 'free_help']);
    expect(r[1]?.values).toEqual({ count: 2 });
  });
  it('ends with the quick-line facts when there is no free_help; names usable savings in their own fact', () => {
    const r = withQuickFacts([f('month_left_after')], 1, mu(500));
    expect(r.map((x) => x.code)).toEqual(['month_left_after', 'quick_lines_counted', 'quick_savings_counted']);
    expect(r[2]?.values).toEqual({ amount: 500 });
  });
  it('takes the quick savings out of the unlocked-goals fact, and drops it when nothing else is left', () => {
    const left = withQuickFacts([f('unlocked_goals_counted', { amount: 800 })], 1, mu(500));
    expect(left[0]).toEqual({ code: 'unlocked_goals_counted', values: { amount: 300 } });
    const none = withQuickFacts([f('unlocked_goals_counted', { amount: 500 })], 1, mu(500));
    expect(none.map((x) => x.code)).toEqual(['quick_lines_counted', 'quick_savings_counted']);
  });
});

describe('judgeWithQuickLines', () => {
  const cases = new Map(loadCases().filter((c) => c.topic === 'quick-lines').map((c) => [c.id, c]));
  const judged = (id: string): ReturnType<typeof pick> => {
    const { inputs, check } = toEngineInputs((cases.get(id) as NonNullable<ReturnType<typeof cases.get>>).fixture);
    return pick(judgeWithQuickLines(prepare(inputs), check));
  };

  it('with no quick lines is judgeCheck, unchanged', () => {
    const inputs = inputsOf({ balance: mu(500_000) });
    const prepared = prepare(inputs);
    const check = checkOnce(10_000);
    expect(judgeWithQuickLines(prepared, check)).toEqual(judgeCheck(prepared, check));
    expect(judgeWithQuickLines(prepared, { ...check, quickLines: [] })).toEqual(judgeCheck(prepared, check));
  });

  it('lines that count nowhere give the same answer and no quick fact', () => {
    const prepared = prepare(inputsOf({ balance: mu(500_000) }));
    const ev = judgeWithQuickLines(prepared, withLines([savings({ usable: false })]));
    expect(ev.result).toEqual(judgeCheck(prepared, checkOnce(10_000)).result);
  });

  it('counts a repeating expense, says so, and leaves the records alone', () => {
    const r = judged('QL-01');
    expect(r.facts).toContain('quick_lines_counted');
    expect(r.facts).not.toContain('quick_savings_counted');
  });

  it('usable savings turn a Not yet into a fit and the answer names them; unusable ones change nothing', () => {
    expect(judged('QL-07').code).toBe('not_yet');
    const r = judged('QL-06');
    expect(r.code).not.toBe('not_yet');
    expect(r.facts).toEqual(expect.arrayContaining(['quick_lines_counted', 'quick_savings_counted']));
    expect(r.facts).not.toContain('unlocked_goals_counted');
  });

  it('an ask (needs_input) is returned as it is, with no quick fact', () => {
    const { inputs, check } = toEngineInputs((cases.get('QL-01') as NonNullable<ReturnType<typeof cases.get>>).fixture);
    const ev = judgeWithQuickLines(prepare(inputs), { ...check, price: null });
    expect(ev.result.code).toBe('needs_input');
    expect(ev.result.facts.map((x) => x.code)).not.toContain('quick_lines_counted');
  });

  it('a check without quick lines gives exactly the same result as before, whatever the check next to it did', () => {
    const { inputs, check } = toEngineInputs((cases.get('QL-01') as NonNullable<ReturnType<typeof cases.get>>).fixture);
    const prepared = prepare(inputs);
    const { quickLines: _ignored, ...plain } = check;
    const before = judgeCheck(prepared, plain);
    judgeWithQuickLines(prepared, check);
    expect(judgeCheck(prepared, plain)).toEqual(before);
  });

  it('keeps the account-with-no-rate notice through the second prepare', () => {
    const { inputs, check } = toEngineInputs((cases.get('QL-01') as NonNullable<ReturnType<typeof cases.get>>).fixture);
    const withUnrated: V3Inputs = { ...inputs, accounts: [...(inputs.accounts ?? []), { id: 'yen', balance: mu(5_000), use: null, kind: 'savings', noRate: true }] };
    const ev = judgeWithQuickLines(prepare(withUnrated), check);
    expect(ev.result.notices.map((n) => n.code)).toContain('account_no_rate');
  });

  it('a quick line that cannot be judged by the rest of the engine still never mutates a frozen prepare', () => {
    const { inputs, check } = toEngineInputs((cases.get('QL-03') as NonNullable<ReturnType<typeof cases.get>>).fixture);
    const prepared = prepare(deepFreeze(inputs));
    expect(() => judgeWithQuickLines(prepared, deepFreeze(check))).not.toThrow();
  });
});
