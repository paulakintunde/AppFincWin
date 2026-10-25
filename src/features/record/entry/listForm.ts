// REC-30 / D-14 / D-16: pure conversions between the entry form and an entry-list item.
// No React, no I/O. Amounts cross this file only as integer minor units, parsed by the
// strict parser the caller passes in (never Number()/parseFloat).
import type { ParseAmountResult } from '@/engine/money';
import type { ListItem } from '@/engine/entryList';
import type { PaymentType } from '@/db/rows';
import type { FormContext, FormState } from './transactionForm';
import type { RepeatsValue } from './recurringForm';

type Parse = (text: string, currency: string) => ParseAmountResult;

export function itemFromForm(state: FormState, repeats: RepeatsValue, parse: Parse, id: string): ListItem | null {
  if (state.accountId === null) return null;
  const amount = parse(state.amountText, state.currency);
  if (!amount.ok) return null;
  const isTransfer = state.direction === 'transfer';
  let amountInMinor: number | null = null;
  if (isTransfer && state.toCurrency !== null && state.toCurrency !== state.currency) {
    const amountIn = parse(state.amountInText, state.toCurrency);
    if (!amountIn.ok) return null;
    amountInMinor = amountIn.value;
  }
  return {
    id,
    type: state.direction,
    amountMinor: amount.value,
    currency: state.currency,
    accountId: state.accountId,
    localDate: state.localDate,
    name: isTransfer ? '' : state.name.trim(),
    categoryId: isTransfer ? null : state.categoryId,
    paymentType: isTransfer ? null : state.paymentType,
    status: state.status === 'pending' ? 'pending' : 'paid',
    statusTouched: state.statusTouched,
    note: state.note,
    automatic: isTransfer ? false : state.automatic,
    refund: state.direction === 'out' ? state.refund : false,
    repeat: isTransfer ? { freq: 'never' } : repeats,
    toAccountId: isTransfer ? state.toAccountId : null,
    toCurrency: isTransfer ? state.toCurrency : null,
    amountInMinor,
  };
}

export function formFromItem(
  item: ListItem,
  ctx: Pick<FormContext, 'amountInputText'>,
): { state: FormState; repeats: RepeatsValue } {
  const state: FormState = {
    direction: item.type,
    amountText: ctx.amountInputText(item.amountMinor, item.currency),
    name: item.name,
    categoryId: item.categoryId,
    accountId: item.accountId,
    currency: item.currency,
    localDate: item.localDate,
    status: item.status,
    statusTouched: item.statusTouched,
    paymentType: item.paymentType as PaymentType | null,
    note: item.note,
    toAccountId: item.toAccountId,
    toCurrency: item.toCurrency,
    amountInText:
      item.type === 'transfer' && item.amountInMinor !== null && item.toCurrency !== null
        ? ctx.amountInputText(item.amountInMinor, item.toCurrency)
        : '',
    automatic: item.automatic,
    refund: item.refund,
    oneOff: false,
  };
  return { state, repeats: item.repeat };
}

/** D-16: what survives "Add to list"; the caller also resets Repeats. */
export function clearedAfterAdd(state: FormState): FormState {
  return {
    ...state,
    amountText: '',
    amountInText: '',
    name: '',
    note: '',
    categoryId: null,
    paymentType: null,
    automatic: false,
    refund: false,
    oneOff: false,
  };
}

export function formHasContent(state: FormState): boolean {
  return state.amountText.trim() !== '' || state.name.trim() !== '';
}
