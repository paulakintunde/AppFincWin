import { percent, ZERO_PERCENT } from '@/engine/decide';
import type { QuickComputation } from '../../snapshot/types';
import { quickResultCopy } from '../quickCopy';
import { cardReasonCards, warningCard } from '../warningCopy';
import { verdictBody, verdictTitle } from '../verdictCopy';
import { FIRST_READ, assessmentOf, cashCheck, fmt, fmtCents, fmtDate, loanCheck, w, withContext } from './helpers/fixtures';
import { resolvesInEn } from './helpers/enKeys';
import type { CopyRef } from '../types';

type Code = Parameters<typeof w>[0];
const logged = (a: ReturnType<typeof assessmentOf>, check = cashCheck): QuickComputation =>
  ({ kind: 'logged', decision: {} as never, verdict: a, check, resolvedPrice: {} as never }) as QuickComputation;
const run = (qc: QuickComputation, mode: 'cash' | 'credit') => quickResultCopy(qc as never, mode, fmt, fmtCents);

const AMOUNT_NAMES = ['amount', 'short', 'left', 'cashAfter', 'cushion', 'payment', 'price', 'already', 'debt', 'in', 'out', 'balance', 'fv', 'total', 'financed', 'final'];
const refsOf = (r: ReturnType<typeof quickResultCopy>): CopyRef[] => [r.line, ...(r.caption ? [r.caption] : [])];

describe('quickResultCopy: states with no figures', () => {
  it('none has no chip and says there is nothing to judge', () => {
    const r = run({ kind: 'none' }, 'cash');
    expect(r).toMatchObject({ chip: null, size: null, monthly: null, tryCredit: false });
    expect(r.line.key).toBe('decide.quick.line.missing');
  });

  it('cash only never mentions a cushion or the month', () => {
    const qc = { kind: 'cash_only', check: cashCheck, resolvedPrice: {}, dayOne: 5_000, cashAfter: 1_000, monthly: null, termMonths: null, months: null } as never;
    const r = run(qc, 'cash');
    expect(r.line).toEqual({ key: 'decide.quick.line.cashOnly', params: { price: '$5000', cashAfter: '$1000' } });
    expect(r.basis).toBe('decide.basis.cashOnly');
    expect(r.chip).toBeNull();
    expect(r.size).toBeNull();
    const short = run({ ...(qc as object), cashAfter: -300 } as never, 'cash');
    expect(short.line).toEqual({ key: 'decide.quick.line.cashOnlyShort', params: { price: '$5000', short: '$300' } });
    for (const x of [r, short]) {
      expect(Object.keys(x.line.params ?? {})).not.toContain('cushion');
      expect(Object.keys(x.line.params ?? {})).not.toContain('left');
    }
  });

  it('cash only in credit mode carries the monthly figure', () => {
    const qc = { kind: 'cash_only', check: loanCheck(percent('5'), 12), resolvedPrice: {}, dayOne: 0, cashAfter: 1_000, monthly: 80_000, termMonths: 12, months: 10 } as never;
    const r = run(qc, 'credit');
    expect(r.monthly).toEqual({ amount: 80_000, months: 12, paidOffMonth: 10, zeroRate: false });
    expect(r.caption!.key).toBe('decide.quick.monthlyCaptionPaidOff');
  });

  it('unconverted shows missing terms and no figure', () => {
    const r = run({ kind: 'unconverted', currencies: ['EUR', 'GBP'] }, 'credit');
    expect(r.chip).toEqual({ key: 'decide.missingRate.chip', tone: 'missing' });
    expect(r.line).toEqual({ key: 'decide.missingRate.title', params: { currency: 'EUR, GBP' } });
    expect(r.size).toBeNull();
    expect(r.monthly).toBeNull();
    for (const v of Object.values(r.line.params ?? {})) expect(v).not.toMatch(/\$|\d/);
  });

  it('a logged missing verdict maps to its reason', () => {
    const missing = { state: 'missing', reasons: ['loan_apr_missing'], size: 'from_savings', confidence: {} } as never;
    const r = run({ kind: 'logged', decision: {} as never, verdict: missing, check: cashCheck, resolvedPrice: {} as never } as QuickComputation, 'credit');
    expect(r.line.key).toBe('decide.verdict.missing.loan_apr_missing');
    expect(r.chip!.key).toBe('decide.state.missing');
    const noSize = { state: 'missing', reasons: [], size: null } as never;
    const r2 = run({ kind: 'logged', decision: {} as never, verdict: noSize, check: cashCheck, resolvedPrice: {} as never } as QuickComputation, 'cash');
    expect(r2.size).toBeNull();
    expect(r2.line.key).toBe('decide.verdict.missing.no_full_month');
  });
});

describe('quickResultCopy: Cash', () => {
  it('fits', () => {
    const r = run(logged(assessmentOf({})), 'cash');
    expect(r.chip!.key).toBe('decide.state.fits');
    expect(r.size).toBe('decide.size.from_savings');
    expect(r.line).toEqual({ key: 'decide.quick.line.cashFits', params: { cashAfter: '$500000', cushion: '$100000', left: '$40000' } });
    expect(r.monthly).toBeNull();
    expect(r.tryCredit).toBe(false);
  });

  it('cash lines exist for every leading warning', () => {
    const expected: Record<Code, string> = {
      cash: 'decide.quick.line.cashBelowCushion',
      cash_dip: 'decide.quick.line.cashDip',
      dsr: 'decide.quick.line.creditDsr',
      owe: 'decide.quick.line.creditOwe',
      inv: 'decide.quick.line.pauseInvesting',
      month: 'decide.quick.line.cashMonthShort',
    };
    for (const code of Object.keys(expected) as Code[]) {
      const r = run(logged(assessmentOf({ state: 'adjust', warnings: [w(code, 7)], investingAtRisk: 7, pauseNeeded: 7 })), 'cash');
      expect(r.line.key).toBe(expected[code]);
    }
    const noIncome = run(logged(assessmentOf({ state: 'adjust', warnings: [w('dsr', 7)], debtServiceRatioAfter: null })), 'cash');
    expect(noIncome.line.key).toBe('decide.quick.line.creditDsrNoIncome');
    const saving = run(logged(assessmentOf({ state: 'adjust', warnings: [w('inv', 7)], savingAtRisk: 7, pauseNeeded: 7 })), 'cash');
    expect(saving.line.key).toBe('decide.quick.line.pauseSaving');
    expect(run(logged(assessmentOf({ state: 'adjust', warnings: [] })), 'cash').line.key).toBe('decide.quick.line.cashMonthShort');
  });

  it('no: empty cash, month, hard dip; each offers credit', () => {
    const empty = run(logged(assessmentOf({ state: 'no', cashAfter: -10, warnings: [w('cash', 300)] })), 'cash');
    expect(empty.chip!.key).toBe('decide.state.noCash');
    expect(empty.line).toEqual({ key: 'decide.quick.line.cashNo', params: { short: '$300' } });
    expect(empty.tryCredit).toBe(true);
    expect(run(logged(assessmentOf({ state: 'no', cashAfter: -10, warnings: [] })), 'cash').line.params).toEqual({ short: '$10' });
    const month = run(logged(assessmentOf({ state: 'no', warnings: [w('month', 50)] })), 'cash');
    expect(month.line).toEqual({ key: 'decide.quick.line.cashMonthShort', params: { short: '$50' } });
    expect(month.tryCredit).toBe(true);
    const dip = run(logged(assessmentOf({ state: 'no', cashDip: 'hard', warnings: [w('cash_dip', 5)] })), 'cash');
    expect(dip.line.key).toBe('decide.quick.line.cashDipHard');
    expect(dip.tryCredit).toBe(true);
  });

  it('cash no without a cash warning has a line', () => {
    const r = run(logged(assessmentOf({ state: 'no', cashAfter: -40, warnings: [w('month', 1)] })), 'cash');
    expect(r.line.key).toBe('decide.quick.line.cashNo');
    expect(r.line.params).toEqual({ short: '$40' });
  });
});

describe('quickResultCopy: Credit', () => {
  const check12 = loanCheck(percent('9'), 12);
  const zero12 = loanCheck(ZERO_PERCENT, 12);

  it('fits with and without interest', () => {
    const r = run(logged(assessmentOf({}), check12), 'credit');
    expect(r.chip!.key).toBe('decide.state.fits');
    expect(r.line).toEqual({ key: 'decide.quick.line.creditFits', params: { payment: '$850.00', count: 12, left: '$40000' } });
    const z = run(logged(assessmentOf({}), zero12), 'credit');
    expect(z.line.key).toBe('decide.quick.line.creditFitsZero');
    expect(z.monthly).toEqual({ amount: 85_000, months: 12, paidOffMonth: null, zeroRate: true });
  });

  it('the credit line shows the term and the payoff month apart', () => {
    const a = assessmentOf({ plan: { ...assessmentOf({}).plan, months: 10 } });
    const r = run(logged(a, check12), 'credit');
    expect(r.line.params).toMatchObject({ count: 12 });
    expect(r.monthly).toEqual({ amount: 85_000, months: 12, paidOffMonth: 10, zeroRate: false });
    expect(r.caption).toEqual({ key: 'decide.quick.monthlyCaptionPaidOff', params: { count: 12, paid: 10 } });
  });

  it('a 0% or unfinanced credit caption has no payoff month', () => {
    const zeroShort = run(logged(assessmentOf({ plan: { ...assessmentOf({}).plan, months: 10 } }), zero12), 'credit');
    expect(zeroShort.caption).toEqual({ key: 'decide.quick.monthlyCaptionZero', params: { count: 12 } });
    expect(zeroShort.monthly!.paidOffMonth).toBeNull();
    const unfinanced = run(logged(assessmentOf({ plan: { ...assessmentOf({}).plan, months: 0 } }), check12), 'credit');
    expect(unfinanced.monthly!.paidOffMonth).toBeNull();
    expect(unfinanced.caption).toEqual({ key: 'decide.quick.monthlyCaption', params: { count: 12 } });
  });

  it('a credit result falls back to the plan months when the check has no loan term', () => {
    const r = run(logged(assessmentOf({}), cashCheck), 'credit');
    expect(r.line.params).toMatchObject({ count: 12 });
    expect(run(logged(assessmentOf({}), loanCheck(percent('9'), null)), 'credit').line.params).toMatchObject({ count: 12 });
  });

  it('short lines', () => {
    const short = run(logged(assessmentOf({ state: 'adjust', warnings: [w('month', 90)] }), check12), 'credit');
    expect(short.line).toEqual({ key: 'decide.quick.line.creditShort', params: { payment: '$850.00', count: 12, short: '$90' } });
    const zero = run(logged(assessmentOf({ state: 'no', warnings: [w('month', 90)] }), zero12), 'credit');
    expect(zero.line.key).toBe('decide.quick.line.creditShortZero');
    expect(zero.chip!.key).toBe('decide.state.noCredit');
    expect(run(logged(assessmentOf({ state: 'adjust', warnings: [w('inv', 90)] }), check12), 'credit').line.key).toBe('decide.quick.line.creditShort');
  });

  it('dsr, owe and cash lines', () => {
    expect(run(logged(assessmentOf({ state: 'adjust', warnings: [w('dsr', 1)] }), check12), 'credit').line).toEqual({ key: 'decide.quick.line.creditDsr', params: { pct: '22.99' } });
    expect(run(logged(assessmentOf({ state: 'adjust', warnings: [w('dsr', 1)], debtServiceRatioAfter: null }), check12), 'credit').line.key).toBe('decide.quick.line.creditDsrNoIncome');
    expect(run(logged(assessmentOf({ state: 'adjust', warnings: [w('owe', 1)] }), check12), 'credit').line.key).toBe('decide.quick.line.creditOwe');
    const cash = run(logged(assessmentOf({ state: 'no', cashAfter: -5, mineDayOne: 20, warnings: [w('cash', 25)] }), check12), 'credit');
    expect(cash.line).toEqual({ key: 'decide.quick.line.creditCash', params: { day: '$20', cashAfter: '$-5', short: '$25', cushion: '$100000' } });
  });

  it('a credit result led by cash_dip has a line', () => {
    const soft = run(logged(assessmentOf({ state: 'adjust', cashDip: 'soft', warnings: [w('cash_dip', 70)] }), check12), 'credit');
    expect(soft.line).toEqual({ key: 'decide.quick.line.creditCashDip', params: { payment: '$850.00', amount: '$70' } });
    const hard = run(logged(assessmentOf({ state: 'no', cashDip: 'hard', warnings: [w('cash_dip', 70)] }), check12), 'credit');
    expect(hard.line).toEqual({ key: 'decide.quick.line.creditCashDipHard', params: { payment: '$850.00' } });
  });

  it('a credit adjust with no warning still has a line', () => {
    expect(run(logged(assessmentOf({ state: 'adjust', warnings: [] }), check12), 'credit').line.key).toBe('decide.quick.line.creditShort');
  });
});

describe('quickResultCopy: first read', () => {
  const fr = (over: object) => ({ kind: 'first_read', firstRead: { ...FIRST_READ, ...over }, check: cashCheck, resolvedPrice: {} }) as never;

  it('cash: fits, below cushion, month short, no', () => {
    expect(run(fr({}), 'cash').line.key).toBe('decide.quick.line.cashFits');
    const below = run(fr({ state: 'adjust', warnings: [{ code: 'cash', shortfall: 20 }] }), 'cash');
    expect(below.line.key).toBe('decide.quick.line.cashBelowCushion');
    const month = run(fr({ state: 'adjust', warnings: [{ code: 'month', shortfall: 20 }] }), 'cash');
    expect(month.line.params).toEqual({ short: '$20' });
    const no = run(fr({ state: 'no', cashAfter: -5, warnings: [{ code: 'cash', shortfall: 105 }] }), 'cash');
    expect(no.line).toEqual({ key: 'decide.quick.line.cashNo', params: { short: '$105' } });
    expect(no.tryCredit).toBe(true);
    expect(run(fr({ state: 'no', cashAfter: -5, warnings: [] }), 'cash').line.params).toEqual({ short: '$5' });
    expect(run(fr({ state: 'adjust', warnings: [] }), 'cash').line.params).toEqual({ short: '$0' });
  });

  it('credit: fits, short, cash', () => {
    const check = loanCheck(percent('9'), 24);
    const mk = (over: object) => ({ kind: 'first_read', firstRead: { ...FIRST_READ, ...over }, check, resolvedPrice: {} }) as never;
    expect(run(mk({}), 'credit').line).toEqual({ key: 'decide.quick.line.creditFits', params: { payment: '$850.00', count: 24, left: '$40000' } });
    expect(run(mk({ state: 'adjust', warnings: [{ code: 'month', shortfall: 9 }] }), 'credit').line.key).toBe('decide.quick.line.creditShort');
    const zero = { kind: 'first_read', firstRead: { ...FIRST_READ, state: 'adjust', warnings: [{ code: 'month', shortfall: 9 }] }, check: loanCheck(ZERO_PERCENT, 24), resolvedPrice: {} } as never;
    expect(run(zero, 'credit').line.key).toBe('decide.quick.line.creditShortZero');
    expect(run(mk({ state: 'adjust', dayOne: 30, cashAfter: 50, warnings: [{ code: 'cash', shortfall: 50 }] }), 'credit').line.key).toBe('decide.quick.line.creditCash');
    expect(run(mk({ state: 'adjust', cashAfter: -3, warnings: [] }), 'credit').line.params).toMatchObject({ short: '$3' });
  });

  it('a missing first read maps its reason', () => {
    const r = run(fr({ state: 'missing', reasons: ['card_missing'], size: 'needs_spreading' }), 'cash');
    expect(r.chip!.key).toBe('decide.state.cardLimits');
    expect(r.size).toBe('decide.size.needs_spreading');
    expect(run(fr({ state: 'missing', reasons: [], size: 'from_savings' }), 'cash').line.key).toBe('decide.verdict.missing.card_missing');
  });
});

describe('copy params', () => {
  it('payments show cents and totals stay whole', () => {
    const r = run(logged(assessmentOf({}), loanCheck(percent('9'), 12)), 'credit');
    expect(r.line.params!.payment).toBe('$850.00');
    expect(r.line.params!.left).toBe('$40000');
  });

  it('no amount param is a raw number', () => {
    const check = loanCheck(percent('9'), 12);
    const refs: CopyRef[] = [];
    for (const code of ['month', 'cash', 'cash_dip', 'dsr', 'owe', 'inv'] as Code[]) {
      const a = assessmentOf({
        state: 'adjust',
        warnings: [w(code, 9)],
        cashDip: 'soft',
        cashPath: { status: 'available', lowestWith: { day: 1, date: '2026-11-01', amount: 1 } } as never,
        investingAtRisk: 1,
        pauseNeeded: 1,
        ...withContext({ leftBefore: -5 }),
      });
      for (const mode of ['cash', 'credit'] as const) refs.push(...refsOf(run(logged(a, check), mode)));
      refs.push(verdictTitle(a, fmt), verdictBody(a, fmt));
      const card = warningCard(w(code, 9), a, fmt, fmtDate);
      refs.push(card.title, ...(card.value ? [card.value] : []), ...card.body);
    }
    const capPlan = { ...assessmentOf({}).plan, card: { onCard: 5, remainderOnDay: 3, payoff: 'minimum', payoffMonths: null, minimumOutcome: 'exceeds_month_cap', remainingAtCap: 7 } } as never;
    for (const c of cardReasonCards(assessmentOf({ plan: capPlan }), fmt)) refs.push(c.title, ...(c.value ? [c.value] : []), ...c.body);
    expect(refs.length).toBeGreaterThan(20);
    for (const r of refs) {
      expect(r.key.startsWith('decide.')).toBe(true);
      expect(resolvesInEn(r.key)).toBe(true);
      for (const k of Object.values(r.keyParams ?? {})) expect(resolvesInEn(k)).toBe(true);
      for (const [name, value] of Object.entries(r.params ?? {})) {
        expect(typeof value).not.toBe('bigint');
        if (AMOUNT_NAMES.includes(name)) expect(typeof value).toBe('string');
      }
    }
  });
});
