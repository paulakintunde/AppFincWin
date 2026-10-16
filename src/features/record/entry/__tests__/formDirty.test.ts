import { isFormDirty } from '../formDirty';
import type { FormState } from '../transactionForm';

const base: FormState = {
  direction: 'out',
  amountText: '5',
  name: 'n',
  categoryId: null,
  accountId: 'a1',
  currency: 'GBP',
  localDate: '2026-09-20',
  status: 'paid',
  statusTouched: false,
  paymentType: null,
  note: '',
  toAccountId: null,
  toCurrency: null,
  amountInText: '',
  automatic: false,
  refund: false,
  oneOff: false,
};

describe('isFormDirty', () => {
  it('is false for an identical form and for a statusTouched-only difference', () => {
    expect(isFormDirty(base, { ...base })).toBe(false);
    expect(isFormDirty({ ...base, statusTouched: true }, base)).toBe(false);
  });

  it.each<[string, Partial<FormState>]>([
    ['amountText', { amountText: '6' }],
    ['name', { name: 'm' }],
    ['categoryId', { categoryId: 'c1' }],
    ['accountId', { accountId: 'a2' }],
    ['localDate', { localDate: '2026-09-21' }],
    ['note', { note: 'x' }],
    ['direction', { direction: 'in' }],
    ['status', { status: 'pending' }],
    ['paymentType', { paymentType: 'card' }],
    ['automatic', { automatic: true }],
    ['refund', { refund: true }],
  ])('is true when %s changes', (_n, patch) => {
    expect(isFormDirty({ ...base, ...patch }, base)).toBe(true);
  });
});
