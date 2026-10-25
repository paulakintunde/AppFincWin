import { minorUnits, parseAmount, resolveExponent, toDecimalString, type ParseAmountResult } from '@/engine/money';
import { initialFormState, type FormContext, type FormState } from '../transactionForm';
import { clearedAfterAdd, formFromItem, formHasContent, itemFromForm } from '../listForm';

const ctx: FormContext = {
  today: '2026-09-25',
  defaultAccount: { id: 'a1', currency: 'GBP' },
  homeCurrency: 'GBP',
  amountInputText: (minor, code) => toDecimalString(minorUnits(minor), resolveExponent(code)),
};
const parse = (text: string, currency: string): ParseAmountResult =>
  parseAmount(text, { locale: 'en-GB', exponent: resolveExponent(currency) });

const out = (over: Partial<FormState> = {}): FormState => ({
  ...initialFormState({ kind: 'new', direction: 'out' }, ctx),
  amountText: '12.50',
  name: 'Tesco',
  categoryId: 'c1',
  ...over,
});

describe('itemFromForm', () => {
  it('converts an expense', () => {
    expect(itemFromForm(out(), { freq: 'never' }, parse, 'i1')).toMatchObject({
      id: 'i1',
      type: 'out',
      amountMinor: 1250,
      currency: 'GBP',
      name: 'Tesco',
      categoryId: 'c1',
      repeat: { freq: 'never' },
      toAccountId: null,
      amountInMinor: null,
    });
  });

  it('carries a monthly count repeat verbatim', () => {
    const repeats = { freq: 'monthly', end: { kind: 'count', count: 6 } } as const;
    expect(itemFromForm(out(), repeats, parse, 'i1')?.repeat).toEqual(repeats);
  });

  it('computes amountIn for a cross-currency transfer and blanks name and category', () => {
    const state = out({
      direction: 'transfer',
      toAccountId: 'a2',
      toCurrency: 'EUR',
      amountInText: '14.00',
    });
    expect(itemFromForm(state, { freq: 'never' }, parse, 'i2')).toMatchObject({
      type: 'transfer',
      name: '',
      categoryId: null,
      toAccountId: 'a2',
      toCurrency: 'EUR',
      amountInMinor: 1400,
    });
  });

  it('leaves amountIn null for a same-currency transfer', () => {
    const state = out({ direction: 'transfer', toAccountId: 'a2', toCurrency: 'GBP' });
    expect(itemFromForm(state, { freq: 'never' }, parse, 'i2')?.amountInMinor).toBeNull();
  });

  it('returns null when the amount does not parse', () => {
    expect(itemFromForm(out({ amountText: 'abc' }), { freq: 'never' }, parse, 'i1')).toBeNull();
  });
});

describe('formFromItem', () => {
  it('restores every field including repeats', () => {
    const repeats = { freq: 'monthly', end: { kind: 'count', count: 6 } } as const;
    const item = itemFromForm(out({ note: 'n', automatic: true, paymentType: 'card' }), repeats, parse, 'i1')!;
    const back = formFromItem(item, ctx);
    expect(back.state).toMatchObject({
      direction: 'out',
      amountText: '12.50',
      name: 'Tesco',
      categoryId: 'c1',
      accountId: 'a1',
      note: 'n',
      automatic: true,
      paymentType: 'card',
      amountInText: '',
    });
    expect(back.repeats).toEqual(repeats);
  });

  it('restores amountInText only for a cross-currency transfer', () => {
    const state = out({ direction: 'transfer', toAccountId: 'a2', toCurrency: 'EUR', amountInText: '14.00' });
    const item = itemFromForm(state, { freq: 'never' }, parse, 'i2')!;
    expect(formFromItem(item, ctx).state.amountInText).toBe('14.00');
  });
});

describe('clearedAfterAdd', () => {
  it('keeps account, date, type, currency and status; clears the rest', () => {
    const s = out({
      note: 'x',
      paymentType: 'card',
      automatic: true,
      refund: true,
      status: 'pending',
      statusTouched: true,
      localDate: '2026-09-01',
    });
    const c = clearedAfterAdd(s);
    expect(c).toMatchObject({
      direction: 'out',
      accountId: 'a1',
      currency: 'GBP',
      localDate: '2026-09-01',
      status: 'pending',
      statusTouched: true,
      amountText: '',
      amountInText: '',
      name: '',
      note: '',
      categoryId: null,
      paymentType: null,
      automatic: false,
      refund: false,
    });
  });
});

describe('formHasContent', () => {
  it('is true for an amount or a name', () => {
    expect(formHasContent(out({ amountText: '', name: '' }))).toBe(false);
    expect(formHasContent(out({ amountText: '1', name: '' }))).toBe(true);
    expect(formHasContent(out({ amountText: '', name: 'x' }))).toBe(true);
    expect(formHasContent(out({ amountText: ' ', name: ' ' }))).toBe(false);
  });
});
