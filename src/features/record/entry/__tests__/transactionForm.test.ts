import { minorUnits, parseAmount, resolveExponent, toDecimalString, type ParseAmountResult } from '@/engine/money';
import type { TransactionRow } from '@/db/rows';
import {
  initialFormState,
  toAddInput,
  toPatch,
  toTransferAfter,
  toTransferInput,
  validateForm,
  validateTransfer,
  withDate,
  withDirection,
  withStatus,
  type FormContext,
  type FormState,
} from '../transactionForm';

const ctx: FormContext = {
  today: '2026-09-25',
  defaultAccount: { id: 'a1', currency: 'GBP' },
  amountInputText: (minor, code) => toDecimalString(minorUnits(minor), resolveExponent(code)),
};

const parse = (text: string, currency: string): ParseAmountResult =>
  parseAmount(text, { locale: 'en-GB', exponent: resolveExponent(currency) });

function row(over: Partial<TransactionRow> = {}): TransactionRow {
  return {
    id: 't1',
    household_id: 'h1',
    account_id: 'a1',
    original_amount: -1250,
    original_currency: 'GBP',
    local_date: '2026-09-20',
    name: 'Coffee',
    category_id: 'c1',
    payment_type: 'card',
    status: 'paid',
    note: null,
    version: 3,
    transfer_id: null,
    ...over,
  } as TransactionRow;
}

const newOut = (): FormState => initialFormState({ kind: 'new', direction: 'out' }, ctx);

describe('initialFormState', () => {
  it('builds the new-expense defaults', () => {
    expect(newOut()).toMatchObject({
      direction: 'out',
      amountText: '',
      name: '',
      categoryId: null,
      accountId: 'a1',
      currency: 'GBP',
      localDate: '2026-09-25',
      status: 'paid',
      statusTouched: false,
      paymentType: null,
      note: '',
    });
  });

  it('takes every value from an edited row', () => {
    const s = initialFormState({ kind: 'edit', row: row() }, ctx);
    expect(s).toMatchObject({
      direction: 'out',
      amountText: '12.50',
      name: 'Coffee',
      categoryId: 'c1',
      accountId: 'a1',
      currency: 'GBP',
      localDate: '2026-09-20',
      paymentType: 'card',
      status: 'paid',
    });
  });

  it('reads direction from the sign of an income row', () => {
    const s = initialFormState({ kind: 'edit', row: row({ original_amount: 500 }) }, ctx);
    expect(s.direction).toBe('in');
    expect(s.amountText).toBe('5.00');
  });

  it('builds a new transfer', () => {
    const s = initialFormState({ kind: 'new', direction: 'transfer' }, ctx);
    expect(s).toMatchObject({
      direction: 'transfer',
      accountId: 'a1',
      toAccountId: null,
      amountInText: '',
      status: 'paid',
      categoryId: null,
      paymentType: null,
    });
  });
});

describe('status and date', () => {
  it('follows the date until the user touches the status', () => {
    let s = withDate(newOut(), '2026-10-01', ctx.today);
    expect(s.status).toBe('pending');
    s = withDate(s, ctx.today, ctx.today);
    expect(s.status).toBe('paid');
    s = withStatus(s, 'pending');
    expect(s.statusTouched).toBe(true);
    s = withDate(s, ctx.today, ctx.today);
    expect(s.status).toBe('pending');
  });
});

describe('withDirection', () => {
  it('clears a payment type invalid for the new direction', () => {
    const s = withDirection({ ...newOut(), paymentType: 'direct_debit' }, 'in');
    expect(s.paymentType).toBeNull();
    const kept = withDirection({ ...newOut(), paymentType: 'cash' }, 'in');
    expect(kept.paymentType).toBe('cash');
  });

  it('to transfer resets status, category and payment type', () => {
    const s = withDirection(
      { ...newOut(), status: 'pending', categoryId: 'c1', paymentType: 'card' },
      'transfer'
    );
    expect(s).toMatchObject({ direction: 'transfer', status: 'paid', categoryId: null, paymentType: null });
  });

  it('S-WR-06: to transfer drops a hidden currency override; the from-leg uses its account currency', () => {
    const currencyOf = (id: string) => ({ a1: 'GBP', a3: 'EUR' })[id];
    const s = withDirection({ ...newOut(), currency: 'EUR', toAccountId: 'a2', toCurrency: 'GBP', amountInText: '9' }, 'transfer', currencyOf);
    expect(s.currency).toBe('GBP');
    // GBP to GBP is one amount: no stale received-amount figure is kept.
    expect(s.amountInText).toBe('');
  });
});

describe('validateForm', () => {
  const valid: FormState = { ...newOut(), amountText: '4.20', name: 'Tea' };

  it('returns [] when valid', () => {
    expect(validateForm(valid, parse)).toEqual([]);
  });

  it('flags name, account and amount', () => {
    const errors = validateForm({ ...newOut(), accountId: null }, parse);
    expect(errors).toContain('nameRequired');
    expect(errors).toContain('accountRequired');
    expect(errors.some((e) => typeof e === 'object' && 'amount' in e)).toBe(true);
  });

  it('rejects a zero amount', () => {
    const errors = validateForm({ ...valid, amountText: '0' }, parse);
    expect(errors.some((e) => typeof e === 'object' && 'amount' in e)).toBe(true);
  });
});

describe('toAddInput', () => {
  const c = { householdId: 'h1', userId: 'u1', homeCurrency: 'GBP', timeZone: 'Europe/London' };

  it('signs by direction, trims the name and nulls an empty note', () => {
    const out = toAddInput({ ...newOut(), name: '  Tea ', amountText: '4.20' }, 420, c);
    expect(out).toMatchObject({ amount: -420, name: 'Tea', note: null, accountId: 'a1', currency: 'GBP' });
    const inc = toAddInput({ ...withDirection(newOut(), 'in'), name: 'Pay', note: 'x' }, 420, c);
    expect(inc).toMatchObject({ amount: 420, note: 'x' });
  });
});

describe('toPatch', () => {
  it('contains only changed keys', () => {
    const r = row();
    const s = initialFormState({ kind: 'edit', row: r }, ctx);
    expect(toPatch(r, s, 1250)).toEqual({});
    expect(toPatch(r, { ...s, name: 'Latte' }, 1250)).toEqual({ name: 'Latte' });
    expect(toPatch(r, { ...s, amountText: '13.00' }, 1300)).toEqual({ original_amount: -1300 });
  });
});

describe('transfer helpers', () => {
  const base = (): FormState => ({
    ...initialFormState({ kind: 'new', direction: 'transfer' }, ctx),
    toAccountId: 'a2',
    toCurrency: 'GBP',
    amountText: '10.00',
  });

  it('requires a to-account and two different accounts', () => {
    expect(validateTransfer({ ...base(), toAccountId: null }, parse)).toContain('accountRequired');
    expect(validateTransfer({ ...base(), toAccountId: 'a1' }, parse)).toContain('transferSameAccount');
  });

  it('does not need a name', () => {
    expect(validateTransfer(base(), parse)).toEqual([]);
  });

  it('blocks a mismatched amount in the same currency', () => {
    expect(validateTransfer({ ...base(), amountInText: '11.00' }, parse)).toContain('transferAmountsMatch');
    expect(validateTransfer({ ...base(), amountInText: '10' }, parse)).toEqual([]);
  });

  it('needs an amount received across currencies', () => {
    const errors = validateTransfer({ ...base(), toCurrency: 'EUR' }, parse);
    expect(errors.some((e) => typeof e === 'object' && 'amountIn' in e)).toBe(true);
    expect(validateTransfer({ ...base(), toCurrency: 'EUR', amountInText: '11.50' }, parse)).toEqual([]);
  });

  it('builds the add input with positive magnitudes', () => {
    const input = toTransferInput(base(), 1000, 1000, {
      householdId: 'h1',
      userId: 'u1',
      timeZone: 'Europe/London',
      transferCategoryId: 'tc',
      homeCurrency: 'GBP',
      toName: 'Savings',
    });
    expect(input).toMatchObject({
      ownerId: 'u1',
      from: { id: 'a1', currency: 'GBP' },
      to: { id: 'a2', currency: 'GBP' },
      amountOut: 1000,
      amountIn: 1000,
      transferCategoryId: 'tc',
      toName: 'Savings',
    });
  });

  it('builds the signed after-state', () => {
    expect(toTransferAfter({ ...base(), toCurrency: 'EUR' }, 1000, 1100)).toEqual({
      out: { accountId: 'a1', currency: 'GBP', amount: -1000, localDate: '2026-09-25' },
      in: { accountId: 'a2', currency: 'EUR', amount: 1100, localDate: '2026-09-25' },
    });
  });
});

describe('edit-transfer state', () => {
  it('derives both accounts from the pair', () => {
    const out = row({ id: 'o', account_id: 'a1', original_amount: -1000, transfer_id: 'x' });
    const inn = row({ id: 'i', account_id: 'a2', original_amount: 1200, original_currency: 'EUR', transfer_id: 'x' });
    const s = initialFormState({ kind: 'edit-transfer', out, in: inn }, ctx);
    expect(s).toMatchObject({
      direction: 'transfer',
      accountId: 'a1',
      toAccountId: 'a2',
      currency: 'GBP',
      toCurrency: 'EUR',
      amountText: '10.00',
      amountInText: '12.00',
    });
  });
});
