/**
 * 06-13 Task 1: the typed calculators reproduce the prototype ledger (design/LEDGER.md, Calculators) to the cent.
 */
import { compoundCalc, debtPayoffCalc, loanCalc, savingsCalc } from '../typed/calcModels';

describe('loanCalc (GC10)', () => {
  it('$20,000 at 7.5% for 60 months', () => {
    const r = loanCalc({ amount: 2000000, rate: '7.5', months: 60 });
    expect(r).not.toBeNull();
    expect(r!.payment).toBe(40076);
    expect(r!.last).toBe(40067);
    expect(r!.totalInterest).toBe(404551);
    expect(r!.totalPaid).toBe(2404551);
    expect(r!.workedOut[0]!.key).toBe('grow.calc.loan.worked');
    expect(r!.workedOut[0]!.values.monthly).toBe('0.625');
    expect(r!.workedOut[0]!.values.count).toBe(60);
  });

  it('works out the monthly rate from a comma decimal and rounds it to four places', () => {
    const r = loanCalc({ amount: 100000, rate: '4,0', months: 12 });
    expect(r!.workedOut[0]!.values.rate).toBe('4.0');
    expect(r!.workedOut[0]!.values.monthly).toBe('0.3333');
  });

  it('is null for empty, invalid, negative or huge input', () => {
    expect(loanCalc({ amount: null, rate: '7.5', months: 60 })).toBeNull();
    expect(loanCalc({ amount: 2000000, rate: '', months: 60 })).toBeNull();
    expect(loanCalc({ amount: 2000000, rate: '7.5%', months: 60 })).toBeNull();
    expect(loanCalc({ amount: 2000000, rate: '7.5', months: null })).toBeNull();
    expect(loanCalc({ amount: 2000000, rate: '7.5', months: 0 })).toBeNull();
    expect(loanCalc({ amount: 2000000, rate: '7.5', months: 601 })).toBeNull();
    expect(loanCalc({ amount: 2000000, rate: '7.5', months: 12.5 })).toBeNull();
    expect(loanCalc({ amount: -1, rate: '7.5', months: 60 })).toBeNull();
    expect(loanCalc({ amount: 0, rate: '7.5', months: 60 })).toBeNull();
    expect(loanCalc({ amount: 10 ** 13 + 1, rate: '7.5', months: 60 })).toBeNull();
  });
});

describe('savingsCalc (GC20)', () => {
  const base = { target: 500000, saved: 50000, monthly: 25000, rate: '3', start: '2026-12-01' };

  it('18 months, May 2028, at 3%', () => {
    const r = savingsCalc(base);
    expect(r).not.toBeNull();
    expect(r!.deposits).toBe(18);
    expect(r!.reachesOn).toBe('2028-05-01');
    expect(r!.putIn).toBe(500000);
    expect(r!.interest).toBe(11990);
    expect(r!.total).toBe(511990);
  });

  it('a blank rate counts as 0 and still takes 18 months', () => {
    const r = savingsCalc({ ...base, rate: '' });
    expect(r!.deposits).toBe(18);
    expect(r!.interest).toBe(0);
    expect(r!.total).toBe(500000);
  });

  it('is null when nothing reaches the target, or the input is bad', () => {
    expect(savingsCalc({ ...base, monthly: 0, rate: '0' })).toBeNull();
    expect(savingsCalc({ ...base, saved: 500000 })).toBeNull();
    expect(savingsCalc({ ...base, target: null })).toBeNull();
    expect(savingsCalc({ ...base, saved: null })).toBeNull();
    expect(savingsCalc({ ...base, monthly: null })).toBeNull();
    expect(savingsCalc({ ...base, rate: 'abc' })).toBeNull();
    expect(savingsCalc({ ...base, target: -5 })).toBeNull();
    expect(savingsCalc({ ...base, target: 10 ** 13 + 1 })).toBeNull();
  });
});

describe('compoundCalc (GC30)', () => {
  it('$200 a month at 4% for 10 years from nothing', () => {
    const r = compoundCalc({ start: 0, monthly: 20000, rate: '4', years: 10 });
    expect(r).not.toBeNull();
    expect(r!.value).toBe(2944998);
    expect(r!.putIn).toBe(2400000);
    expect(r!.growth).toBe(544998);
    expect(r!.years).toHaveLength(10);
    expect(r!.years[9]!.value).toBe(2944998);
  });

  it('start $7,690 plus $200 a month at 4% gives $40,914.44', () => {
    expect(compoundCalc({ start: 769000, monthly: 20000, rate: '4', years: 10 })!.value).toBe(4091444);
  });

  it('is null for empty, invalid or out-of-range input', () => {
    expect(compoundCalc({ start: null, monthly: 20000, rate: '4', years: 10 })).toBeNull();
    expect(compoundCalc({ start: 0, monthly: null, rate: '4', years: 10 })).toBeNull();
    expect(compoundCalc({ start: 0, monthly: 20000, rate: '', years: 10 })).toBeNull();
    expect(compoundCalc({ start: 0, monthly: 20000, rate: '4', years: null })).toBeNull();
    expect(compoundCalc({ start: 0, monthly: 20000, rate: '4', years: 0 })).toBeNull();
    expect(compoundCalc({ start: 0, monthly: 20000, rate: '4', years: 51 })).toBeNull();
    expect(compoundCalc({ start: -1, monthly: 20000, rate: '4', years: 10 })).toBeNull();
    expect(compoundCalc({ start: 0, monthly: 10 ** 13 + 1, rate: '4', years: 10 })).toBeNull();
  });
});

describe('debtPayoffCalc (GC40)', () => {
  const debts = [
    { balance: 420000, rate: '21.9', minimum: 12000 },
    { balance: 150000, rate: '9.5', minimum: 7500 },
  ];
  const input = { debts, extra: 10000, start: '2026-12-01' };

  it('both orders and minimums only match the ledger', () => {
    const r = debtPayoffCalc(input);
    expect(r).not.toBeNull();
    expect(r!.budget).toBe(29500);
    expect(r!.rate.months).toBe(24);
    expect(r!.rate.endDate).toBe('2028-11-01');
    expect(r!.rate.interest).toBe(114868);
    expect(r!.rate.firstCleared).toEqual({ index: 1, month: 22 });
    expect(r!.balance.months).toBe(24);
    expect(r!.balance.interest).toBe(128030);
    expect(r!.balance.firstCleared).toEqual({ index: 1, month: 9 });
    expect(r!.minimumsOnly.months).toBe(41);
    expect(r!.minimumsOnly.endDate).toBe('2030-04-01');
    expect(r!.minimumsOnly.interest).toBe(218434);
    expect(r!.minimumsOnly.firstCleared).toEqual({ index: 1, month: 22 });
    expect(r!.sameForOneDebt).toBe(false);
    expect(r!.workedOut[0]!.key).toBe('grow.calc.payoff.worked');
  });

  it('one debt: both orders are the same', () => {
    const r = debtPayoffCalc({ ...input, debts: [debts[0]!] });
    expect(r!.sameForOneDebt).toBe(true);
    expect(r!.rate.interest).toBe(r!.balance.interest);
    expect(r!.rate.months).toBe(r!.balance.months);
  });

  it('a budget that cannot beat the interest never clears, with no interest figure', () => {
    const r = debtPayoffCalc({ debts: [{ balance: 1000000, rate: '30', minimum: 100 }], extra: 0, start: '2026-12-01' });
    expect(r!.rate.outcome).toBe('never_clears');
    expect(r!.rate.interest).toBeNull();
    expect(r!.rate.endDate).toBeNull();
  });

  it('is null for empty or invalid input', () => {
    expect(debtPayoffCalc({ ...input, debts: [] })).toBeNull();
    expect(debtPayoffCalc({ ...input, extra: null })).toBeNull();
    expect(debtPayoffCalc({ ...input, debts: [{ balance: null, rate: '5', minimum: 100 }] })).toBeNull();
    expect(debtPayoffCalc({ ...input, debts: [{ balance: 1000, rate: '', minimum: 100 }] })).toBeNull();
    expect(debtPayoffCalc({ ...input, debts: [{ balance: 1000, rate: '5', minimum: null }] })).toBeNull();
    expect(debtPayoffCalc({ ...input, debts: [{ balance: 0, rate: '5', minimum: 100 }] })).toBeNull();
    expect(debtPayoffCalc({ ...input, debts: [{ balance: -4, rate: '5', minimum: 100 }] })).toBeNull();
    expect(debtPayoffCalc({ ...input, extra: 10 ** 13 + 1 })).toBeNull();
  });
});
