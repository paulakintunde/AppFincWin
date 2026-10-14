import type { DraftForm } from '@/engine/entryList';
import { fromDraftForm, toDraftForm } from '../draftForm';
import type { FormState } from '../transactionForm';

const ctx = {
  activeAccountIds: new Set(['a1', 'a2']),
  categoryIds: new Set(['c1']),
  paymentTypes: new Set(['card', 'cash']),
};

const state: FormState = {
  direction: 'transfer',
  amountText: '5',
  name: 'n',
  categoryId: 'c1',
  accountId: 'a1',
  currency: 'GBP',
  localDate: '2026-09-20',
  status: 'pending',
  statusTouched: true,
  paymentType: 'card',
  note: 'x',
  toAccountId: 'a2',
  toCurrency: 'EUR',
  amountInText: '6',
  automatic: true,
  refund: false,
};

describe('draftForm', () => {
  it('copies all 16 fields and round-trips with known ids', () => {
    const form = toDraftForm(state);
    expect(Object.keys(form)).toHaveLength(16);
    expect({ ...state, ...fromDraftForm(form, ctx) }).toEqual(state);
  });

  it('drops unknown account, category and payment-type ids, copying the rest', () => {
    const form: DraftForm = {
      ...toDraftForm(state),
      accountId: 'gone',
      toAccountId: 'gone2',
      categoryId: 'gone3',
      paymentType: 'bitcoin',
    };
    const patch = fromDraftForm(form, ctx);
    expect(patch.accountId).toBeNull();
    expect(patch.toAccountId).toBeNull();
    expect(patch.categoryId).toBeNull();
    expect(patch.paymentType).toBeNull();
    expect(patch.name).toBe('n');
    expect(patch.amountText).toBe('5');
  });
});
