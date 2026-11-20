/**
 * 08.1-08 (CMP-F19): applyHouseholdMoney lays one signed figure into the inputs the way money left this month is read.
 */
import { minorUnits } from '../../../money/types';
import { HOUSEHOLD_LINE_ID, applyHouseholdMoney } from '../householdMoney';
import type { V3Inputs } from '../types';
import { personById, toV3Inputs } from './golden/adapter';

const mu = minorUnits;
const sam = (): V3Inputs => toV3Inputs(personById('sam'));

describe('08.1-08 applyHouseholdMoney', () => {
  it('zero changes nothing (the same inputs come back)', () => {
    const i = sam();
    expect(applyHouseholdMoney(i, mu(0))).toBe(i);
  });

  it('more money: one income line this month on the pay series, and the cash, account and unspent figures move together', () => {
    const i: V3Inputs = {
      ...sam(),
      unspent: { amount: mu(5_000), at: sam().asOf },
      accounts: [{ id: 'sav', balance: mu(10), use: null, kind: 'savings' }, { id: 'a', balance: mu(1_000), use: null, kind: 'checking' }],
    };
    const out = applyHouseholdMoney(i, mu(2_500));
    const ym = i.asOf.slice(0, 7);
    const line = out.months.find((m) => m.month === ym)?.lines.find((l) => l.id === HOUSEHOLD_LINE_ID);
    expect(line).toMatchObject({ amount: 2_500, role: 'income', seriesId: i.series.find((s) => s.role === 'pay')?.id ?? null });
    expect(out.balance).toBe(i.balance + 2_500);
    expect(out.accounts?.map((a) => a.balance)).toEqual([10, 3_500]);
    expect(out.unspent?.amount).toBe(7_500);
    expect(i.months.some((m) => m.lines.some((l) => l.id === HOUSEHOLD_LINE_ID))).toBe(false);
  });

  it('less money: a spending line of the same size, on no series', () => {
    const i = sam();
    const out = applyHouseholdMoney(i, mu(-2_000));
    const line = out.months.flatMap((m) => m.lines).find((l) => l.id === HOUSEHOLD_LINE_ID);
    expect(line).toMatchObject({ amount: 2_000, role: 'spending', seriesId: null });
    expect(out.balance).toBe(i.balance - 2_000);
  });

  it('no pay series, no accounts and no unspent figure: the line still goes in, nothing else moves', () => {
    const i: V3Inputs = { ...sam(), series: [], unspent: null };
    const { accounts: _a, ...noAccounts } = i;
    const out = applyHouseholdMoney(noAccounts, mu(100));
    expect(out.months.flatMap((m) => m.lines).find((l) => l.id === HOUSEHOLD_LINE_ID)?.seriesId).toBeNull();
    expect(out.accounts).toBeUndefined();
    expect(out.unspent).toBeNull();
  });

  it('an account no rate converts is never the one that moves', () => {
    const i: V3Inputs = { ...sam(), accounts: [{ id: 'x', balance: mu(5), use: null, noRate: true }] };
    expect(applyHouseholdMoney(i, mu(10)).accounts?.[0]?.balance).toBe(5);
  });
});
