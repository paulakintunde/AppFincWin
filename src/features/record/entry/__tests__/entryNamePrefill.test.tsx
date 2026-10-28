import { minorUnits, resolveExponent, toDecimalString } from '@/engine/money';
import { initialFormState, type FormContext } from '../transactionForm';

const ctx: FormContext = {
  today: '2026-09-25',
  defaultAccount: { id: 'a1', currency: 'GBP' },
  homeCurrency: 'USD',
  accountCurrency: (id) => (id === 'a1' ? 'GBP' : undefined),
  amountInputText: (minor, code) => toDecimalString(minorUnits(minor), resolveExponent(code)),
};

describe('name-only prefill (05.2-46)', () => {
  it('fills the name and leaves amount empty and the account the default', () => {
    const f = initialFormState({ kind: 'new', direction: 'out', name: 'Phone and internet' }, ctx);
    expect(f.name).toBe('Phone and internet');
    expect(f.amountText).toBe('');
    expect(f.accountId).toBe('a1');
  });

  it('a null or missing name leaves the field empty', () => {
    expect(initialFormState({ kind: 'new', direction: 'out', name: null }, ctx).name).toBe('');
    expect(initialFormState({ kind: 'new', direction: 'out' }, ctx).name).toBe('');
  });

  it('prefill.name wins over name', () => {
    const f = initialFormState(
      {
        kind: 'new',
        direction: 'out',
        name: 'Quick pick',
        prefill: {
          amountMinor: -500,
          currency: 'GBP',
          name: 'Clone',
          categoryId: null,
          accountId: 'a1',
          paymentType: null,
          isRefund: false,
          isAutomatic: false,
        },
      },
      ctx,
    );
    expect(f.name).toBe('Clone');
  });
});
