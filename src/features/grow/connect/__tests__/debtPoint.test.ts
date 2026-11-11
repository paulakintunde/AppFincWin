import { percent } from '@/engine/payoff';
import { LEDGER_TODAY, autoLoan } from '@/engine/grow/__tests__/fixtures/ledger';
import { debtPointOf, debtToV3Debt } from '../index';
import type { DebtSourceRow } from '../types';

const loan: DebtSourceRow = {
  id: 'd-auto', kind: 'loan', account_id: 'acc-loan', check_id: null, balance: autoLoan.balance, apr: autoLoan.apr,
  minimum_payment: autoLoan.payment, secured: true, is_housing: false, due_day: autoLoan.dueDay, pays_in_full: null,
  paid_off_on: null, deleted_at: null, started_balance: autoLoan.startedBalance, payoff_order: null, payoff_extra: 0,
};
const base = { id: 'd-auto', balance: 842000, minimumPayment: 31200, apr: percent('6.9'), secured: true } as never;
const kindOf = (id: string): string => (id === 'card-acc' ? 'credit' : 'checking');

describe('debtToV3Debt reproduces the builder mapping', () => {
  it('a debts row: kind, housing and due day come from the row', () => {
    expect(debtToV3Debt(base, { ...loan, is_housing: true }, undefined, kindOf)).toEqual({
      id: 'd-auto', kind: 'loan', balance: 842000, minimum: 31200, apr: percent('6.9'), secured: true, isHousing: true, dueDay: 15,
    });
  });

  it('no row: a credit account is a card and a loan otherwise; the due day comes from the card row on the account', () => {
    const cardRow: DebtSourceRow = { ...loan, id: 'row-card', kind: 'card', account_id: 'card-acc', due_day: 3 };
    const card = debtToV3Debt({ ...(base as object), id: 'card-acc' } as never, undefined, cardRow, kindOf);
    expect(card).toMatchObject({ id: 'card-acc', kind: 'card', isHousing: false, dueDay: 3 });
    expect(debtToV3Debt({ ...(base as object), id: 'x' } as never, undefined, undefined, kindOf)).toMatchObject({ kind: 'loan', dueDay: null });
  });

  it('a due day that is not a whole number 1..31 is null (not set)', () => {
    for (const day of [0, 32, 1.5, null, undefined]) {
      expect(debtToV3Debt(base, { ...loan, due_day: day }, undefined, kindOf).dueDay).toBeNull();
    }
    expect(debtToV3Debt(base, { ...loan, due_day: 31 }, undefined, kindOf).dueDay).toBe(31);
  });
});

describe('debtPointOf', () => {
  it('auto loan: 30 payments from the next due date give 2029-04-15 and 75636 interest', () => {
    const p = debtPointOf(loan, LEDGER_TODAY);
    expect(p).toMatchObject({ id: 'd-auto', balance: 842000, minimum: 31200, dueDay: 15, payoffDate: '2029-04-15', totalInterest: 75636, paidInFull: false, paidOff: false, linkedCheckId: null });
    expect(p.apr).toBe(percent('6.9'));
  });

  it('a due day today counts as the first payment; one already passed this month starts next month', () => {
    expect(debtPointOf({ ...loan, due_day: 5 }, LEDGER_TODAY).payoffDate).toBe('2029-04-05');
    expect(debtPointOf({ ...loan, due_day: 4 }, LEDGER_TODAY).payoffDate).toBe('2029-05-04');
  });

  it('a due day past the end of a short month is cut to its last day, then follows the due day again', () => {
    const small: DebtSourceRow = { ...loan, balance: 30000, minimum_payment: 10000, apr: '0', due_day: 31 };
    expect(debtPointOf(small, '2027-01-10').payoffDate).toBe('2027-03-31');
    expect(debtPointOf({ ...small, balance: 20000 }, '2027-01-10').payoffDate).toBe('2027-02-28');
    expect(debtPointOf({ ...small, balance: 20000 }, '2028-02-10').payoffDate).toBe('2028-03-31');
    expect(debtPointOf({ ...small, balance: 10000 }, '2026-12-31').payoffDate).toBe('2026-12-31');
    expect(debtPointOf({ ...small, balance: 20000 }, '2026-12-31').payoffDate).toBe('2027-01-31');
    expect(debtPointOf({ ...small, balance: 10000 }, '2026-12-31', ).paidOff).toBe(false);
  });

  it('a due day passed in December starts in January of the next year', () => {
    expect(debtPointOf({ ...loan, balance: 31200, apr: '0' }, '2026-12-20').payoffDate).toBe('2027-01-15');
  });

  it('an extra payment each month brings the date forward; an absent extra and an absent rate read as 0', () => {
    const p = debtPointOf({ ...loan, payoff_extra: 20000 }, LEDGER_TODAY);
    expect(p.payoffDate! < '2029-04-15').toBe(true);
    const noRate = debtPointOf({ ...loan, apr: null, payoff_extra: undefined, balance: 62400 }, LEDGER_TODAY);
    expect(noRate).toMatchObject({ apr: null, payoffDate: '2026-12-15', totalInterest: 0 });
  });

  it('no due day: no payoff date, interest still shown', () => {
    expect(debtPointOf({ ...loan, due_day: null }, LEDGER_TODAY)).toMatchObject({ dueDay: null, payoffDate: null, totalInterest: 75636 });
    expect(debtPointOf({ ...loan, due_day: 40 }, LEDGER_TODAY).dueDay).toBeNull();
    expect(debtPointOf({ ...loan, due_day: undefined }, LEDGER_TODAY).payoffDate).toBeNull();
  });

  it('a payment that never clears the debt has no date and no interest figure', () => {
    expect(debtPointOf({ ...loan, minimum_payment: 100 }, LEDGER_TODAY)).toMatchObject({ payoffDate: null, totalInterest: null });
  });

  it('a zero balance has no payoff date', () => {
    expect(debtPointOf({ ...loan, balance: 0 }, LEDGER_TODAY)).toMatchObject({ payoffDate: null });
  });

  it('paid_off_on on or before today is paid off; a future date is not', () => {
    expect(debtPointOf({ ...loan, paid_off_on: '2026-11-05' }, LEDGER_TODAY).paidOff).toBe(true);
    expect(debtPointOf({ ...loan, paid_off_on: '2026-11-06' }, LEDGER_TODAY).paidOff).toBe(false);
    expect(debtPointOf({ ...loan, paid_off_on: undefined }, LEDGER_TODAY).paidOff).toBe(false);
  });

  it('a card paid in full each month has no payoff date; "sometimes" and non-cards do', () => {
    const card: DebtSourceRow = { ...loan, kind: 'card', pays_in_full: 'yes', check_id: 'chk' };
    expect(debtPointOf(card, LEDGER_TODAY)).toMatchObject({ paidInFull: true, payoffDate: null, totalInterest: null, linkedCheckId: 'chk' });
    expect(debtPointOf({ ...card, pays_in_full: 'sometimes' }, LEDGER_TODAY).paidInFull).toBe(false);
    expect(debtPointOf({ ...card, kind: 'loan' }, LEDGER_TODAY).paidInFull).toBe(false);
  });
});
