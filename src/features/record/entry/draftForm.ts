// D-25 / H1 / H4: the entry form <-> device draft mapping. The draft is untrusted (03-18): ids are
// resolved against loaded accounts, categories and PAYMENT_TYPES before they reach the form, and
// currency, toCurrency and status are validated too; the caller re-applies direction invariants
// with withDirection.
import type { DraftForm } from '@/engine/entryList';
import type { PaymentType } from '@/db/rows';
import type { FormState } from './transactionForm';
import type { RepeatsValue } from './recurringForm';

export interface DraftFormContext {
  activeAccountIds: ReadonlySet<string>;
  categoryIds: ReadonlySet<string>;
  paymentTypes: ReadonlySet<string>;
  /** H4: codes the currency picker offers. */
  currencyCodes: ReadonlySet<string>;
  accountCurrency: (accountId: string) => string | undefined;
}

const NEVER: RepeatsValue = { freq: 'never' };

function normaliseRepeats(r: RepeatsValue): RepeatsValue {
  if (r.freq === 'never') return NEVER;
  if (r.end.kind === 'count' && !(Number.isInteger(r.end.count) && r.end.count >= 1)) {
    return { freq: r.freq, end: { kind: 'never' } };
  }
  return r;
}

export function toDraftForm(state: FormState, repeats: RepeatsValue): DraftForm {
  return {
    direction: state.direction,
    amountText: state.amountText,
    name: state.name,
    categoryId: state.categoryId,
    accountId: state.accountId,
    currency: state.currency,
    localDate: state.localDate,
    status: state.status,
    statusTouched: state.statusTouched,
    paymentType: state.paymentType,
    note: state.note,
    toAccountId: state.toAccountId,
    toCurrency: state.toCurrency,
    amountInText: state.amountInText,
    automatic: state.automatic,
    refund: state.refund,
    repeats: state.direction === 'transfer' ? NEVER : normaliseRepeats(repeats),
  };
}

export function fromDraftForm(
  form: DraftForm,
  ctx: DraftFormContext,
): { patch: Partial<FormState>; repeats: RepeatsValue } {
  const known = (id: string | null, set: ReadonlySet<string>): string | null =>
    id !== null && set.has(id) ? id : null;
  const accountId = known(form.accountId, ctx.activeAccountIds);
  const toAccountId = known(form.toAccountId, ctx.activeAccountIds);
  const accCur = accountId !== null ? ctx.accountCurrency(accountId) : undefined;
  const currencyOk = form.currency === accCur || ctx.currencyCodes.has(form.currency);
  const currency = currencyOk ? form.currency : accCur;
  const toAccCur = toAccountId !== null ? ctx.accountCurrency(toAccountId) : undefined;
  const toCurrency =
    form.toCurrency !== null && (form.toCurrency === toAccCur || ctx.currencyCodes.has(form.toCurrency))
      ? form.toCurrency
      : (toAccCur ?? null);
  const status = form.status === 'skipped' ? 'paid' : form.status;
  const { repeats, currency: _currency, ...rest } = form;
  void _currency;
  const patch: Partial<FormState> = {
    ...rest,
    ...(currency !== undefined ? { currency } : {}),
    status,
    accountId,
    toAccountId,
    toCurrency,
    categoryId: known(form.categoryId, ctx.categoryIds),
    paymentType: known(form.paymentType, ctx.paymentTypes) as PaymentType | null,
  };
  return { patch, repeats: repeats ?? NEVER };
}
