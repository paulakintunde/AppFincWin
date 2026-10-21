import { writtenLines, type WrittenCtx } from '../writtenLines';
import { emptyCheckInputs } from '../../snapshot/checkInputs';
import { computeCheck } from '../../snapshot/computeCheck';
import type { CheckComputation, CheckInputs } from '../../snapshot/types';
import { TODAY, loggedSource } from '../../snapshot/__tests__/helpers/snapshotFixtures';

const ctx: WrittenCtx = {
  fmtWhole: (n) => `W${n}`,
  fmtExact: (n) => `E${n}`,
  formatDate: (d) => `on ${d}`,
  today: TODAY,
  accountName: 'Main',
  cardName: 'Visa',
  investAccountName: null,
  transferCategoryAvailable: true,
  endedSeriesIds: ['s1'],
};

const base = (over: Partial<CheckInputs> = {}): CheckInputs => ({ ...emptyCheckInputs('buy', TODAY), name: 'Thing', advertised: 100_000, method: 'cash', outcome: 'go', ...over });

/** A computation holding one hand-made resolved plan, so each branch is tested against exact figures. */
function withPlan(method: 'cash' | 'loan' | 'instalment' | 'card' | 'lump' | 'monthly', over: Record<string, unknown>): CheckComputation {
  const plan = {
    price: 0, dayOne: 0, monthly: 0, months: 0, financed: 0, total: 0, interest: 0, dayFees: 0, card: null,
    finalMonthly: null, impliedAnnualRate: null, paymentSteps: [], promo: null, lateFees: null, ...over,
  };
  return { methodPlans: { [method]: { status: 'resolved', plan } }, running: null, verdict: null, waitPlan: null } as unknown as CheckComputation;
}

const keys = (lines: ReturnType<typeof writtenLines>): string[] => lines.map((l) => l.key.replace('decide.decision.', '').replace('decide.', ''));

describe('writtenLines', () => {
  it('no outcome writes nothing', () => {
    expect(writtenLines(base({ outcome: null }), withPlan('cash', {}), ctx)).toEqual([]);
  });

  it('cash lists one pending expense dated needBy, then untouched', () => {
    const lines = writtenLines(base({ needBy: '2026-11-01' }), withPlan('cash', { dayOne: 100_000 }), ctx);
    expect(lines[0]).toEqual({ key: 'decide.decision.writtenCash', params: { amount: 'E100000', date: 'on 2026-11-01', account: 'Main' } });
    expect(keys(lines)).toEqual(['writtenCash', 'writtenUntouched']);
  });

  it('the date falls back to today', () => {
    const lines = writtenLines(base(), withPlan('cash', { dayOne: 5 }), ctx);
    expect(lines[0]!.params!.date).toBe(`on ${TODAY}`);
  });

  it('the written loan lines follow the payment runs', () => {
    const plan = withPlan('loan', {
      dayOne: 20_000, financed: 80_000, months: 48,
      paymentSteps: [{ fromMonth: 1, toMonth: 47, amount: 2_000 }, { fromMonth: 48, toMonth: 48, amount: 1_500 }],
    });
    const lines = writtenLines(base({ method: 'loan', loan: { ...base().loan, aprText: '9.5', secured: false } }), plan, ctx);
    expect(keys(lines)).toEqual(['writtenDeposit', 'writtenLoan', 'writtenLoanFinal', 'writtenUntouched']);
    expect(lines[1]!.params).toEqual({ amount: 'E80000', apr: '9.5', payment: 'E2000', count: 47 });
    expect(lines[2]!.params).toEqual({ payment: 'E1500', count: 48 });
  });

  it('a secured loan and a promotion second run use their own lines', () => {
    const plan = withPlan('loan', {
      financed: 50_000, months: 30,
      paymentSteps: [{ fromMonth: 1, toMonth: 12, amount: 1_000 }, { fromMonth: 13, toMonth: 30, amount: 2_000 }],
    });
    const lines = writtenLines(base({ method: 'loan', loan: { ...base().loan, secured: true } }), plan, ctx);
    expect(keys(lines)).toEqual(['writtenLoanSecured', 'writtenLoanThen', 'writtenUntouched']);
    expect(lines[1]!.params).toEqual({ payment: 'E2000', count: 18 });
  });

  it('a loan with nothing financed writes no debt line', () => {
    const plan = withPlan('loan', { dayOne: 100_000, financed: 0, months: 0, paymentSteps: [] });
    const lines = writtenLines(base({ method: 'loan' }), plan, ctx);
    expect(keys(lines)).toEqual(['writtenDeposit', 'writtenUntouched']);
  });

  it('the written instalment lines match the writes', () => {
    const plan = withPlan('instalment', { dayOne: 20_000, months: 11, paymentSteps: [{ fromMonth: 1, toMonth: 11, amount: 15_000 }] });
    const lines = writtenLines(base({ method: 'instalment' }), plan, ctx);
    expect(keys(lines)).toEqual(['writtenDeposit', 'writtenInstalment', 'writtenUntouched']);
    expect(lines[0]!.params!.amount).toBe('E20000');
    expect(lines[1]!.params).toEqual({ payment: 'E15000', count: 11 });
  });

  it('a card lists the card expense and the day-one cash above the cap plus fees', () => {
    const card = { onCard: 90_000, remainderOnDay: 10_000, fees: 500 };
    const lines = writtenLines(base({ method: 'card' }), withPlan('card', { card }), ctx);
    expect(keys(lines)).toEqual(['writtenCard', 'writtenDeposit', 'writtenUntouched']);
    expect(lines[0]!.params).toEqual({ amount: 'E90000', card: 'Visa' });
    expect(lines[1]!.params!.amount).toBe('E10500');
  });

  it('a card with nothing paid on the day lists no deposit line', () => {
    const card = { onCard: 90_000, remainderOnDay: 0, fees: 0 };
    expect(keys(writtenLines(base({ method: 'card' }), withPlan('card', { card }), ctx))).toEqual(['writtenCard', 'writtenUntouched']);
  });

  it('a card paid over months lists its payment series', () => {
    const card = { onCard: 90_000, remainderOnDay: 0, fees: 0 };
    const plan = withPlan('card', { card, paymentSteps: [{ fromMonth: 1, toMonth: 9, amount: 10_000 }] });
    const lines = writtenLines(base({ method: 'card', card: { ...base().card, payoff: 'months' } }), plan, ctx);
    expect(keys(lines)).toEqual(['writtenCard', 'writtenCardPayoff', 'writtenUntouched']);
    expect(lines[1]!.params).toEqual({ payment: 'E10000', count: 9, card: 'Visa', account: 'Main' });
  });

  it('investment go ahead lists its writes', () => {
    const lump = base({ kind: 'invest', method: 'lump', needBy: '2026-12-01' });
    expect(keys(writtenLines(lump, withPlan('lump', { dayOne: 50_000 }), ctx))).toEqual(['writtenInvestLump', 'writtenUntouched']);

    const into = { ...ctx, investAccountName: 'Brokerage' };
    const transfer = writtenLines({ ...lump, investAccountId: 'inv-1' }, withPlan('lump', { dayOne: 50_000 }), into);
    expect(keys(transfer)).toEqual(['writtenInvestTransfer', 'writtenUntouched']);
    expect(transfer[0]!.params).toEqual({ amount: 'E50000', date: 'on 2026-12-01', account: 'Main', to: 'Brokerage' });

    const monthly = base({ kind: 'invest', method: 'monthly', investTermMonths: 24 });
    const m = writtenLines(monthly, withPlan('monthly', { monthly: 10_000, months: 24 }), ctx);
    expect(keys(m)).toEqual(['writtenInvestMonthly', 'writtenUntouched']);
    expect(m[0]!.params).toEqual({ amount: 'E10000', account: 'Main', count: 24 });
  });

  it('a pending running cost and a closed expense are listed', () => {
    const computation = {
      ...withPlan('cash', { dayOne: 100 }),
      running: { net: -2_500, countedCosts: 2, countedReplaced: 1 },
    } as unknown as CheckComputation;
    const inputs = base({
      replaces: [{ id: 'r1', name: 'Old', amount: 5_000, note: '', counted: true, seriesId: 's1', category: null }],
    });
    const lines = writtenLines(inputs, computation, ctx);
    expect(keys(lines)).toEqual(['writtenCash', 'writtenRunning', 'writtenUntouched']);
    expect(lines[1]!.params).toEqual({ count: 2, amount: '−E2500', closed: 1 });
  });

  it('CR-C04: "closes N" counts only the series the write ends, each once', () => {
    const computation = { ...withPlan('cash', { dayOne: 100 }), running: { net: -2_500, countedCosts: 0, countedReplaced: 3 } } as unknown as CheckComputation;
    const line = { id: 'r1', name: 'Old', amount: 5_000, note: '', counted: true, seriesId: 's1', category: null };
    const inputs = base({ replaces: [line, { ...line, id: 'r2' }, { ...line, id: 'r3', seriesId: 's-gone' }] });
    expect(writtenLines(inputs, computation, ctx)[1]!.params).toMatchObject({ closed: 1 });
    expect(writtenLines(inputs, computation, { ...ctx, endedSeriesIds: [] })[1]!.params).toMatchObject({ closed: 0 });
  });

  it('CR-C03: with no Transfer category a lump into an investment account is listed as the pending outflow it writes', () => {
    const lump = base({ kind: 'invest', method: 'lump', investAccountId: 'inv-1' });
    const lines = writtenLines(lump, withPlan('lump', { dayOne: 50_000 }), { ...ctx, investAccountName: 'Brokerage', transferCategoryAvailable: false });
    expect(keys(lines)).toEqual(['writtenInvestLump', 'writtenUntouched']);
  });

  it('wait lists the target, the reminder, and the unchanged-balances closing line', () => {
    const computation = { ...withPlan('cash', {}), waitPlan: { target: 90_000, monthlyAmount: 30_000, readyBy: '2027-01-15' } } as unknown as CheckComputation;
    const lines = writtenLines(base({ outcome: 'wait' }), computation, ctx);
    expect(keys(lines)).toEqual(['writtenWaitTarget', 'depth.goal.written', 'writtenWaitReminder', 'writtenWaitNoChange', 'writtenWaitKept']);
    expect(lines[0]!.params).toEqual({ target: 'E90000', amount: 'E30000', date: 'on 2027-01-15' });
    expect(lines[1]!.params).toEqual({ target: 'E90000', amount: 'E30000', date: 'on 2027-01-15' });
  });

  it('wait with no ready-by date lists the dateless goal but no target or reminder line', () => {
    const computation = { ...withPlan('cash', {}), waitPlan: { target: 90_000, monthlyAmount: 0, readyBy: null } } as unknown as CheckComputation;
    const lines = writtenLines(base({ outcome: 'wait' }), computation, ctx);
    expect(keys(lines)).toEqual(['depth.goal.writtenNoDate', 'writtenWaitNoChange', 'writtenWaitKept']);
    expect(lines[0]!.params).toEqual({ target: 'E90000', amount: 'E0' });
  });

  it('wait with nothing to save lists no goal line', () => {
    const computation = { ...withPlan('cash', {}), waitPlan: { target: 0, monthlyAmount: 0, readyBy: null } } as unknown as CheckComputation;
    expect(keys(writtenLines(base({ outcome: 'wait' }), computation, ctx))).toEqual(['writtenWaitNoChange', 'writtenWaitKept']);
  });

  describe('cooling-off reminder (D-35)', () => {
    const sized = (size: string | null, c: CheckComputation = withPlan('cash', {})): CheckComputation => ({ ...c, verdict: { state: 'missing', size } }) as unknown as CheckComputation;
    it('lists the reminder last for any outcome when the size needs spreading', () => {
      for (const outcome of ['go', 'wait', 'pass'] as const) {
        const lines = writtenLines(base({ outcome, coolingOff: true }), sized('needs_spreading'), ctx);
        expect(lines[lines.length - 1]!.key).toBe('decide.depth.cooling.written');
      }
    });
    it('lists nothing when off, for another size, or with no outcome', () => {
      expect(keys(writtenLines(base({ outcome: 'pass', coolingOff: false }), sized('needs_spreading'), ctx))).not.toContain('depth.cooling.written');
      expect(keys(writtenLines(base({ outcome: 'pass', coolingOff: true }), sized('from_savings'), ctx))).not.toContain('depth.cooling.written');
      expect(writtenLines(base({ outcome: null, coolingOff: true }), sized('needs_spreading'), ctx)).toEqual([]);
    });
  });

  it('pass lists the three pass lines', () => {
    expect(keys(writtenLines(base({ outcome: 'pass' }), withPlan('cash', {}), ctx))).toEqual(['writtenPassKept', 'writtenPassNotSaving', 'writtenPassNoReminders']);
  });

  it('a go ahead with no resolved plan lists nothing', () => {
    expect(writtenLines(base({ method: null }), withPlan('cash', {}), ctx)).toEqual([]);
  });

  it('a real cash computation resolves and reads the investing line', () => {
    const inputs = base({ advertised: 150_000 });
    const lines = writtenLines(inputs, computeCheck(loggedSource(), inputs), ctx);
    expect(keys(lines)).toEqual(['writtenCash', 'writtenUntouched']);
  });

  it('investing that drops is stated', () => {
    const verdict = { state: 'adjust', investingAfter: 4_000, context: { snapshot: { monthlyInvesting: 10_000 } } };
    const computation = { ...withPlan('cash', { dayOne: 10 }), verdict } as unknown as CheckComputation;
    const lines = writtenLines(base(), computation, ctx);
    expect(keys(lines)).toEqual(['writtenCash', 'writtenInvestingDrops']);
    expect(lines[1]!.params).toEqual({ amount: 'E4000' });
  });
});
