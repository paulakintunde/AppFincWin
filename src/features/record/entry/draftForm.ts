// D-25: the entry form <-> device draft mapping. The draft is untrusted (03-18): ids are resolved
// against loaded accounts, categories and PAYMENT_TYPES before they reach the form.
import type { DraftForm } from '@/engine/entryList';
import type { PaymentType } from '@/db/rows';
import type { FormState } from './transactionForm';

export interface DraftFormContext {
  activeAccountIds: ReadonlySet<string>;
  categoryIds: ReadonlySet<string>;
  paymentTypes: ReadonlySet<string>;
}

export function toDraftForm(state: FormState): DraftForm {
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
  };
}

export function fromDraftForm(form: DraftForm, ctx: DraftFormContext): Partial<FormState> {
  const known = (id: string | null, set: ReadonlySet<string>): string | null =>
    id !== null && set.has(id) ? id : null;
  return {
    ...form,
    accountId: known(form.accountId, ctx.activeAccountIds),
    toAccountId: known(form.toAccountId, ctx.activeAccountIds),
    categoryId: known(form.categoryId, ctx.categoryIds),
    paymentType: known(form.paymentType, ctx.paymentTypes) as PaymentType | null,
  };
}
