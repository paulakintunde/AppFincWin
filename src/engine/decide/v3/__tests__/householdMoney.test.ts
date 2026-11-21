/**
 * 08.1-08 (CMP-F19): applyHouseholdMoney lays one signed figure into the inputs the way money left this month is read.
 */
import { minorUnits } from '../../../money/types';
import { HOUSEHOLD_LINE_ID, JOINT_LINE_ID, applyHouseholdMoney, applyJointMoney, jointBackOf, layHouseholdMoney } from '../householdMoney';
import type { JointLay } from '../types';
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

describe('08.1-22 applyJointMoney / jointBackOf / layHouseholdMoney', () => {
  const lay = (o: Partial<JointLay> = {}): JointLay => ({ monthDelta: mu(-500), cashDelta: mu(250), balances: { j1: mu(1_750) }, ...o });
  const withJoint = (): V3Inputs => ({
    ...sam(),
    unspent: { amount: mu(5_000), at: sam().asOf },
    accounts: [{ id: 'a', balance: mu(1_000), use: null, kind: 'checking' }, { id: 'j1', balance: mu(1_500), use: null, kind: 'checking', joint: true }],
  });

  it('sets the named joint account to my slice, moves cash and unspent by the cash change, and adds one month line', () => {
    const i = withJoint();
    const out = applyJointMoney(i, lay());
    expect(out.accounts?.map((a) => a.balance)).toEqual([1_000, 1_750]);
    expect(out.balance).toBe(i.balance + 250);
    expect(out.unspent?.amount).toBe(5_250);
    expect(out.months.flatMap((m) => m.lines).find((l) => l.id === JOINT_LINE_ID)).toMatchObject({ amount: 500, role: 'spending', seriesId: null });
  });
  it('a gain reads as income on the pay series; a zero month change adds no line', () => {
    const i = withJoint();
    const up = applyJointMoney(i, lay({ monthDelta: mu(300) }));
    expect(up.months.flatMap((m) => m.lines).find((l) => l.id === JOINT_LINE_ID)).toMatchObject({ amount: 300, role: 'income' });
    const flat = applyJointMoney(i, lay({ monthDelta: mu(0) }));
    expect(flat.months).toBe(i.months);
  });
  it('without accounts or an unspent figure only the cash and the month move', () => {
    const { accounts: _a, ...rest } = withJoint();
    const out = applyJointMoney({ ...rest, unspent: null }, lay());
    expect(out.accounts).toBeUndefined();
    expect(out.unspent).toBeNull();
  });
  it('jointBackOf is the difference of two lays, ending at the zero balances', () => {
    const back = jointBackOf(lay(), { monthDelta: mu(-1_000), cashDelta: mu(-1_500), balances: { j1: mu(0) } });
    expect(back).toEqual({ monthDelta: -500, cashDelta: -1_750, balances: { j1: 0 } });
  });
  it('layHouseholdMoney: no joint and no pool changes nothing', () => {
    const i = withJoint();
    expect(layHouseholdMoney(i, { joint: null, personalDelta: null }, () => mu(0))).toBe(i);
  });
  it('layHouseholdMoney: the pool reads my personal left with joint money taken out, then adds its delta on top of the joint slice', () => {
    const i = withJoint();
    const seen: V3Inputs[] = [];
    const without: JointLay = { monthDelta: mu(-1_000), cashDelta: mu(-1_500), balances: { j1: mu(0) } };
    const out = layHouseholdMoney(i, { joint: { applied: lay(), without }, personalDelta: (own) => mu(own * 2) }, (x) => { seen.push(x); return mu(40); });
    expect(seen[0]?.accounts?.[1]?.balance).toBe(0);
    expect(out.accounts?.map((a) => a.balance)).toEqual([1_080, 1_750]); // a pool delta of 80 on the first spending account
    expect(out.months.flatMap((m) => m.lines).map((l) => l.id)).toEqual(expect.arrayContaining([JOINT_LINE_ID, HOUSEHOLD_LINE_ID]));
  });
  it('layHouseholdMoney: a pool with no joint account reads my left from the inputs as they are', () => {
    const i = withJoint();
    const seen: V3Inputs[] = [];
    layHouseholdMoney(i, { joint: null, personalDelta: () => mu(0) }, (x) => { seen.push(x); return mu(1); });
    expect(seen[0]).toBe(i);
  });
});
});
