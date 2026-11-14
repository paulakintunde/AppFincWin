// 06.1-80 (DC-7, OQ-80-1 A): "Add your own rule" offers only kinds not already on the list.
import { ADD_RULE_KINDS, changeFormOf, changePatchOf, isOneOffRow, isWrittenLabel, kindsOffered, ownChangeName, EMPTY_RULES, type ChangeRowShape, type RulesDoc } from '../homeCardsModel';

const rule = (id: string, kind: 'keep' | 'largest' | 'category_cap' | 'category_share', on = true) => ({
  id,
  kind,
  on,
  value: 100,
  categoryId: kind === 'category_cap' || kind === 'category_share' ? 'c' : null,
});

describe('kindsOffered (OQ-80-1 A)', () => {
  it('offers every kind when no rule is on the list, in the sheet’s order', () => {
    expect(kindsOffered(EMPTY_RULES)).toEqual(['category_cap', 'category_share', 'largest', 'keep']);
    expect(kindsOffered(EMPTY_RULES)).toEqual([...ADD_RULE_KINDS]);
  });

  it('leaves out Largest single purchase and Keep at least once they are on the list, even when switched off', () => {
    const doc: RulesDoc = { v: 1, rules: [rule('own_largest', 'largest', false), rule('own_keep', 'keep')] };
    expect(kindsOffered(doc)).toEqual(['category_cap', 'category_share']);
  });

  it('keeps offering category rules, which can repeat', () => {
    const doc: RulesDoc = { v: 1, rules: [rule('own_category_cap_1', 'category_cap'), rule('own_category_share_2', 'category_share')] };
    expect(kindsOffered(doc)).toEqual(['category_cap', 'category_share', 'largest', 'keep']);
  });
});

// 06.1-80 (DC-10, DS-19): reading a saved change back into the sheet.

const MARK = '#';
const isOneOffLabel = (name: string) => isWrittenLabel(name, `One-off ${MARK}`, MARK);
const oneOff = (over: Partial<ChangeRowShape> = {}): ChangeRowShape => ({ kind: 'spending', name: 'Car repair', monthly_amount: 90_000, start_month: '2026-11', end_month: '2026-11', ...over });
const ctx = {
  today: '2026-11-11',
  usualPay: 300_000,
  bills: [{ id: 's-gym', name: 'Gym' }],
  billLabel: (bill: string, status: 'stopped' | 'paused') => `${bill} ${status}`,
  isOneOffLabel,
};

describe('isWrittenLabel', () => {
  it('matches the label the app wrote, under any money format', () => {
    expect(isWrittenLabel('One-off $9', 'One-off #', '#')).toBe(true);
    expect(isWrittenLabel('One-off €9,00', 'One-off #', '#')).toBe(true);
    expect(isWrittenLabel('One-off 9 kr', 'One-off #', '#')).toBe(true);
  });

  it('does not match a name the person typed', () => {
    expect(isWrittenLabel('Car repair', 'One-off #', '#')).toBe(false);
    expect(isWrittenLabel('One-off groceries', 'One-off #', '#')).toBe(false);
    expect(isWrittenLabel('One-off repairs 2', 'One-off #', '#')).toBe(false);
    expect(isWrittenLabel('One-off ', 'One-off #', '#')).toBe(false);
  });

  it('a template with no marker matches itself only', () => {
    expect(isWrittenLabel('One-off', 'One-off', '#')).toBe(true);
    expect(isWrittenLabel('One-off $9', 'One-off', '#')).toBe(false);
  });
});

describe('ownChangeName (DS-19)', () => {
  it('is the typed name of a one-off, trimmed', () => {
    expect(ownChangeName(oneOff({ name: ' Car repair ' }), isOneOffLabel)).toBe('Car repair');
  });

  it('is null for the written label, an empty or missing name, and anything that is not a one-off', () => {
    expect(ownChangeName(oneOff({ name: 'One-off $900' }), isOneOffLabel)).toBeNull();
    expect(ownChangeName(oneOff({ name: '  ' }), isOneOffLabel)).toBeNull();
    expect(ownChangeName(oneOff({ name: null }), isOneOffLabel)).toBeNull();
    expect(ownChangeName(oneOff({ end_month: null }), isOneOffLabel)).toBeNull();
    expect(ownChangeName(oneOff({ kind: 'income' }), isOneOffLabel)).toBeNull();
  });

  it('a one-off is spending, positive, in one month', () => {
    expect(isOneOffRow(oneOff())).toBe(true);
    expect(isOneOffRow(oneOff({ monthly_amount: -1 }))).toBe(false);
    expect(isOneOffRow(oneOff({ end_month: '2026-12' }))).toBe(false);
  });
});

describe('changeFormOf (DC-10)', () => {
  it('a one-off opens with its amount, its name, and today when it is this month', () => {
    expect(changeFormOf(oneOff(), ctx)).toEqual({ kind: 'oneOff', amount: 90_000, billId: null, status: 'stopped', date: '2026-11-11', name: 'Car repair' });
  });

  it('an unnamed one-off in a later month opens on the 1st with no name', () => {
    expect(changeFormOf(oneOff({ name: 'One-off $900', start_month: '2027-01', end_month: '2027-01' }), ctx)).toMatchObject({ date: '2027-01-01', name: '' });
  });

  it('pay opens with usual pay plus the stored difference', () => {
    expect(changeFormOf({ kind: 'income', name: 'New pay', monthly_amount: 20_000, start_month: '2026-12', end_month: null }, ctx)).toMatchObject({ kind: 'pay', amount: 320_000, date: '2026-12-01' });
    expect(changeFormOf({ kind: 'income', name: 'New pay', monthly_amount: 20_000, start_month: '2026-12', end_month: null }, { ...ctx, usualPay: null })).toMatchObject({ amount: 20_000 });
    expect(changeFormOf({ kind: 'income', name: 'New pay', monthly_amount: -400_000, start_month: '2026-12', end_month: null }, ctx)).toMatchObject({ amount: null });
  });

  it('a bill opens with the bill and status its label names', () => {
    expect(changeFormOf({ kind: 'spending', name: 'Gym paused', monthly_amount: -4_000, start_month: '2026-11', end_month: null }, ctx)).toMatchObject({ kind: 'bill', billId: 's-gym', status: 'paused' });
  });

  it('is null for rows the sheet cannot write again: an ended change, a bill no longer listed, a rise in spending', () => {
    expect(changeFormOf({ kind: 'income', name: 'x', monthly_amount: 1, start_month: '2026-11', end_month: '2026-12' }, ctx)).toBeNull();
    expect(changeFormOf({ kind: 'spending', name: 'Phone stopped', monthly_amount: -4_500, start_month: '2026-11', end_month: null }, ctx)).toBeNull();
    expect(changeFormOf({ kind: 'spending', name: 'Gym', monthly_amount: 4_000, start_month: '2026-11', end_month: null }, ctx)).toBeNull();
  });
});

describe('changePatchOf', () => {
  it('lists only the fields that moved', () => {
    const row = oneOff();
    expect(changePatchOf(row, { kind: 'spending', name: 'Car repair', monthly_amount: 90_000, start_month: '2026-11', end_month: '2026-11' })).toEqual({});
    expect(changePatchOf(row, { kind: 'income', name: 'New pay', monthly_amount: 5, start_month: '2026-12', end_month: null })).toEqual({
      kind: 'income',
      name: 'New pay',
      monthly_amount: 5,
      start_month: '2026-12',
      end_month: null,
    });
  });
});
