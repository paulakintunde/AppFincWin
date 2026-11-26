// 10.1-20 (D-03, T-10.1-20-01): editing the total of a split line saves the new total only. The parts are never in the update
// payload (the server column is changed only by set_category_parts), so a total edit can never re-spread them.
import { minorUnits, resolveExponent, toDecimalString } from '@/engine/money';
import type { TransactionRow } from '@/db/rows';
import { initialFormState, toPatch, type FormContext } from '../transactionForm';

const ctx: FormContext = {
  today: '2026-09-25',
  defaultAccount: { id: 'a1', currency: 'USD' },
  homeCurrency: 'USD',
  accountCurrency: () => 'USD',
  amountInputText: (minor, code) => toDecimalString(minorUnits(minor), resolveExponent(code)),
};

const splitRow = {
  id: 't1',
  household_id: 'h1',
  account_id: 'a1',
  original_amount: -4500,
  original_currency: 'USD',
  local_date: '2026-09-20',
  name: 'Lunch at Pret',
  category_id: 'dining',
  payment_type: null,
  status: 'paid',
  note: null,
  version: 3,
  transfer_id: null,
  category_parts: [
    { c: 'dining', a: -2500 },
    { c: 'groc', a: -2000 },
  ],
} as unknown as TransactionRow;

describe('toPatch on a split line', () => {
  it('saves the new total and leaves category_parts out of the payload', () => {
    const state = initialFormState({ kind: 'edit', row: splitRow }, ctx);
    const patch = toPatch(splitRow, { ...state, amountText: '50.00' }, 5000);
    expect(patch).toEqual({ original_amount: -5000 });
    expect(Object.keys(patch)).not.toContain('category_parts');
  });

  it('an untouched edit changes nothing', () => {
    const state = initialFormState({ kind: 'edit', row: splitRow }, ctx);
    expect(toPatch(splitRow, state, 4500)).toEqual({});
  });
});
