// Pure form rules for the add/edit transaction sheet (REC-01..04, D-01, D-37, D-50, D-51,
// D-56). No React, no I/O: defaults, validation and the patch diff are tested without a
// renderer. Amounts only ever cross this file as integer minor units; the typed text is
// parsed by the Phase 1 strict parser the caller passes in (never Number()/parseFloat).
import { toDecimalString, type MinorUnits, type ParseAmountResult } from '@/engine/money';
import { defaultStatusFor } from '@/engine/activity';
import type { TransferPairState } from '@/engine/transfer';
import { PAYMENT_TYPES, type PaymentType, type TransactionPatch, type TransactionRow } from '@/db/rows';
import type { AddTransactionInput } from '@/data/mutations/transactions';
import type { AddTransferInput } from '@/data/mutations/transfers';

export type Direction = 'out' | 'in' | 'transfer';

export type EntryMode =
  | { kind: 'new'; direction: Direction; accountId?: string | null; localDate?: string | null }
  | { kind: 'edit'; row: TransactionRow }
  | { kind: 'edit-transfer'; out: TransactionRow; in: TransactionRow };

export interface FormState {
  direction: Direction;
  amountText: string;
  name: string;
  categoryId: string | null;
  accountId: string | null;
  currency: string;
  localDate: string;
  status: 'paid' | 'pending' | 'skipped';
  statusTouched: boolean;
  paymentType: PaymentType | null;
  note: string;
  /** Transfer-only (D-51): accountId/currency are the from-account's. */
  toAccountId: string | null;
  toCurrency: string | null;
  amountInText: string;
}

export interface FormContext {
  today: string;
  defaultAccount: { id: string; currency: string } | null;
  exponentFor: (code: string) => number;
  /** The currency of any account by id, so a preselected account brings its own currency. */
  accountCurrency?: (accountId: string) => string | undefined;
}

type AmountFailure = Extract<ParseAmountResult, { ok: false }>;
export type FormError = 'nameRequired' | 'accountRequired' | { amount: AmountFailure };
export type TransferFormError =
  | 'accountRequired'
  | 'transferSameAccount'
  | 'transferAmountsMatch'
  | { amount: AmountFailure }
  | { amountIn: AmountFailure };

type Parse = (text: string, currency: string) => ParseAmountResult;

const magnitudeText = (amount: number, currency: string, ctx: FormContext): string =>
  toDecimalString(Math.abs(amount) as MinorUnits, ctx.exponentFor(currency));

export function initialFormState(mode: EntryMode, ctx: FormContext): FormState {
  if (mode.kind === 'edit') {
    const r = mode.row;
    return {
      direction: r.original_amount < 0 ? 'out' : 'in',
      amountText: magnitudeText(r.original_amount, r.original_currency, ctx),
      name: r.name ?? '',
      categoryId: r.category_id,
      accountId: r.account_id,
      currency: r.original_currency,
      localDate: r.local_date,
      status: r.status,
      statusTouched: true,
      paymentType: r.payment_type,
      note: r.note ?? '',
      toAccountId: null,
      toCurrency: null,
      amountInText: '',
    };
  }
  if (mode.kind === 'edit-transfer') {
    const { out, in: inn } = mode;
    return {
      direction: 'transfer',
      amountText: magnitudeText(out.original_amount, out.original_currency, ctx),
      name: '',
      categoryId: null,
      accountId: out.account_id,
      currency: out.original_currency,
      localDate: out.local_date,
      status: 'paid',
      statusTouched: true,
      paymentType: null,
      note: out.note ?? '',
      toAccountId: inn.account_id,
      toCurrency: inn.original_currency,
      // Same currency: both legs are one amount, so there is no second field to prefill.
      amountInText:
        inn.original_currency === out.original_currency
          ? ''
          : magnitudeText(inn.original_amount, inn.original_currency, ctx),
    };
  }
  const localDate = mode.localDate ?? ctx.today;
  const accountId = mode.accountId ?? ctx.defaultAccount?.id ?? null;
  const currency =
    (accountId !== null ? ctx.accountCurrency?.(accountId) : undefined) ?? ctx.defaultAccount?.currency ?? '';
  return {
    direction: mode.direction,
    amountText: '',
    name: '',
    categoryId: null,
    accountId,
    currency,
    localDate,
    status: mode.direction === 'transfer' ? 'paid' : defaultStatusFor(localDate, ctx.today),
    statusTouched: false,
    paymentType: null,
    note: '',
    toAccountId: null,
    toCurrency: null,
    amountInText: '',
  };
}

export function withDate(state: FormState, localDate: string, today: string): FormState {
  if (state.statusTouched || state.direction === 'transfer') return { ...state, localDate };
  return { ...state, localDate, status: defaultStatusFor(localDate, today) };
}

export function withDirection(state: FormState, direction: Direction): FormState {
  if (direction === 'transfer') {
    return { ...state, direction, status: 'paid', categoryId: null, paymentType: null };
  }
  const allowed = PAYMENT_TYPES[direction] as readonly PaymentType[];
  const paymentType = state.paymentType !== null && allowed.includes(state.paymentType) ? state.paymentType : null;
  return { ...state, direction, paymentType };
}

export function withStatus(state: FormState, status: FormState['status']): FormState {
  return { ...state, status, statusTouched: true };
}

/** Picking an account moves the currency with it (the Currency row can still override it). */
export function withAccount(state: FormState, account: { id: string; currency: string }): FormState {
  return dropStaleAmountIn({ ...state, accountId: account.id, currency: account.currency });
}

export function withToAccount(state: FormState, account: { id: string; currency: string }): FormState {
  return dropStaleAmountIn({ ...state, toAccountId: account.id, toCurrency: account.currency });
}

/** The received-amount field only exists across currencies; a same-currency pair never keeps a stale value. */
function dropStaleAmountIn(state: FormState): FormState {
  return state.toCurrency === null || state.toCurrency === state.currency ? { ...state, amountInText: '' } : state;
}

const ZERO: AmountFailure = { ok: false, error: 'invalid', maxDecimals: 0 };

/** The strict parse, with a zero amount refused (the database refuses it too). */
function parsePositive(text: string, currency: string, parse: Parse): { ok: true; value: MinorUnits } | AmountFailure {
  const result = parse(text, currency);
  if (!result.ok) return result;
  return result.value === 0 ? ZERO : result;
}

export function validateForm(state: FormState, parse: Parse): FormError[] {
  const errors: FormError[] = [];
  if (state.name.trim() === '') errors.push('nameRequired');
  if (state.accountId === null) errors.push('accountRequired');
  const amount = parsePositive(state.amountText, state.currency, parse);
  if (!amount.ok) errors.push({ amount });
  return errors;
}

export function toAddInput(
  state: FormState,
  amountMinor: number,
  ctx: { householdId: string; userId: string; homeCurrency: string; timeZone: string }
): Omit<AddTransactionInput, 'undo'> {
  const note = state.note.trim();
  return {
    householdId: ctx.householdId,
    accountId: state.accountId as string,
    amount: (state.direction === 'out' ? -amountMinor : amountMinor) as MinorUnits,
    currency: state.currency,
    homeCurrency: ctx.homeCurrency,
    userId: ctx.userId,
    note: note === '' ? null : note,
    localDate: state.localDate,
    timeZone: ctx.timeZone,
    name: state.name.trim(),
    categoryId: state.categoryId,
    paymentType: state.paymentType,
    status: state.status,
  };
}

/** Only the keys that differ from the row (REC-03). `{}` means nothing changed. */
export function toPatch(row: TransactionRow, state: FormState, amountMinor: number): TransactionPatch {
  const patch: TransactionPatch = {};
  const signed = state.direction === 'out' ? -amountMinor : amountMinor;
  if (signed !== row.original_amount) patch.original_amount = signed;
  if (state.currency !== row.original_currency) patch.original_currency = state.currency;
  if (state.accountId !== null && state.accountId !== row.account_id) patch.account_id = state.accountId;
  if (state.localDate !== row.local_date) patch.local_date = state.localDate;
  const name = state.name.trim();
  if (name !== (row.name ?? '')) patch.name = name;
  if (state.categoryId !== row.category_id) patch.category_id = state.categoryId;
  if (state.paymentType !== row.payment_type) patch.payment_type = state.paymentType;
  if (state.status !== row.status) patch.status = state.status;
  const note = state.note.trim() === '' ? null : state.note.trim();
  if (note !== row.note) patch.note = note;
  return patch;
}

function sameCurrency(state: FormState): boolean {
  return state.toCurrency === null || state.toCurrency === state.currency;
}

export function validateTransfer(state: FormState, parse: Parse): TransferFormError[] {
  const errors: TransferFormError[] = [];
  if (state.accountId === null || state.toAccountId === null) errors.push('accountRequired');
  else if (state.accountId === state.toAccountId) errors.push('transferSameAccount');

  const out = parsePositive(state.amountText, state.currency, parse);
  if (!out.ok) errors.push({ amount: out });

  if (sameCurrency(state)) {
    if (out.ok && state.amountInText.trim() !== '') {
      const inn = parse(state.amountInText, state.currency);
      if (!inn.ok || inn.value !== out.value) errors.push('transferAmountsMatch');
    }
  } else {
    const inn = parsePositive(state.amountInText, state.toCurrency as string, parse);
    if (!inn.ok) errors.push({ amountIn: inn });
  }
  return errors;
}

export function toTransferInput(
  state: FormState,
  amountOut: number,
  amountIn: number,
  ctx: {
    householdId: string;
    userId: string;
    timeZone: string;
    transferCategoryId: string | null;
    homeCurrency: string;
    toName: string;
  }
): AddTransferInput {
  const note = state.note.trim();
  return {
    householdId: ctx.householdId,
    ownerId: ctx.userId,
    from: { id: state.accountId as string, currency: state.currency },
    to: { id: state.toAccountId as string, currency: state.toCurrency ?? state.currency },
    amountOut,
    amountIn: sameCurrency(state) ? amountOut : amountIn,
    localDate: state.localDate,
    timeZone: ctx.timeZone,
    transferCategoryId: ctx.transferCategoryId,
    note: note === '' ? null : note,
    toName: ctx.toName,
    homeCurrency: ctx.homeCurrency,
  };
}

export function toTransferAfter(state: FormState, amountOut: number, amountIn: number): TransferPairState {
  const toCurrency = state.toCurrency ?? state.currency;
  return {
    out: { accountId: state.accountId as string, currency: state.currency, amount: -amountOut, localDate: state.localDate },
    in: {
      accountId: state.toAccountId as string,
      currency: toCurrency,
      amount: sameCurrency(state) ? amountOut : amountIn,
      localDate: state.localDate,
    },
  };
}
