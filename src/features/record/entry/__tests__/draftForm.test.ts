import type { DraftForm } from '@/engine/entryList';
import { fromDraftForm, toDraftForm } from '../draftForm';
import type { FormState } from '../transactionForm';

const cur: Record<string, string> = { a1: 'GBP', a2: 'EUR' };
const ctx = {
  activeAccountIds: new Set(['a1', 'a2']),
  categoryIds: new Set(['c1']),
  paymentTypes: new Set(['card', 'cash']),
  currencyCodes: new Set(['GBP', 'EUR', 'JPY']),
  accountCurrency: (id: string) => cur[id],
};
const never = { freq: 'never' } as const;

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
  oneOff: false,
};

describe('draftForm', () => {
  it('copies all 16 fields plus repeats and one-off and round-trips with known ids', () => {
    const form = toDraftForm(state, never);
    expect(Object.keys(form)).toHaveLength(18);
    expect({ ...state, ...fromDraftForm(form, ctx).patch }).toEqual(state);
  });

  it('drops unknown account, category and payment-type ids, copying the rest', () => {
    const form: DraftForm = {
      ...toDraftForm(state, never),
      accountId: 'gone',
      toAccountId: 'gone2',
      categoryId: 'gone3',
      paymentType: 'bitcoin',
    };
    const { patch } = fromDraftForm(form, ctx);
    expect(patch.accountId).toBeNull();
    expect(patch.toAccountId).toBeNull();
    expect(patch.categoryId).toBeNull();
    expect(patch.paymentType).toBeNull();
    expect(patch.name).toBe('n');
    expect(patch.amountText).toBe('5');
  });

  it('carries repeats, and stores an unfinished count as never-ending', () => {
    const out = { ...state, direction: 'out' as const };
    const monthly = { freq: 'monthly', end: { kind: 'count', count: 6 } } as const;
    expect(toDraftForm(out, monthly).repeats).toEqual(monthly);
    expect(toDraftForm(out, { freq: 'weekly', end: { kind: 'count', count: NaN } }).repeats).toEqual({
      freq: 'weekly',
      end: { kind: 'never' },
    });
    expect(toDraftForm(state, { freq: 'monthly', end: { kind: 'never' } }).repeats).toEqual(never);
    expect(fromDraftForm(toDraftForm(out, monthly), ctx).repeats).toEqual(monthly);
    expect(fromDraftForm({ ...toDraftForm(out, never), repeats: undefined }, ctx).repeats).toEqual(never);
  });

  it('validates currency and toCurrency', () => {
    const base = toDraftForm({ ...state, direction: 'out' }, never);
    const usd = { ...ctx, currencyCodes: new Set<string>(), accountCurrency: () => 'USD' };
    expect(fromDraftForm({ ...base, currency: 'USD' }, usd).patch.currency).toBe('USD');
    expect(fromDraftForm({ ...base, currency: 'JPY' }, ctx).patch.currency).toBe('JPY');
    expect(fromDraftForm({ ...base, currency: 'ZZZ' }, ctx).patch.currency).toBe('GBP');
    const none = fromDraftForm({ ...base, currency: 'ZZZ', accountId: 'gone' }, ctx).patch;
    expect('currency' in none).toBe(false);
    expect(fromDraftForm({ ...base, toCurrency: 'ZZZ' }, ctx).patch.toCurrency).toBe('EUR');
    expect(fromDraftForm({ ...base, toCurrency: 'ZZZ', toAccountId: 'gone' }, ctx).patch.toCurrency).toBeNull();
    expect(fromDraftForm({ ...base, toCurrency: 'JPY' }, ctx).patch.toCurrency).toBe('JPY');
  });

  it('WR-D01 a one-off new entry comes back one-off; a transfer never does', () => {
    const out: FormState = { ...state, direction: 'out', toAccountId: null, toCurrency: null, oneOff: true };
    const form = toDraftForm(out, never);
    expect(form.oneOff).toBe(true);
    expect(fromDraftForm(form, ctx).patch.oneOff).toBe(true);
    expect(toDraftForm({ ...state, oneOff: true }, never).oneOff).toBe(false);
    const { oneOff: _drop, ...older } = form;
    void _drop;
    expect(fromDraftForm(older, ctx).patch.oneOff).toBe(false);
  });

  it('maps skipped to paid', () => {
    const base = toDraftForm({ ...state, direction: 'out' }, never);
    expect(fromDraftForm({ ...base, status: 'skipped' as never }, ctx).patch.status).toBe('paid');
  });
});
