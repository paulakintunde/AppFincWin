// BO-07 point 1 (month picture), owner: engine/month (05.5). Behaviour tests come with plan 05.5-08.
import { minorUnits } from '../../money/types';
import type { CountsLine, MonthPicture } from '../types';

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const keys: Same<
  keyof MonthPicture,
  'asOf' | 'balanceOn' | 'afterBillsBeforePayday' | 'leftAfterPlans' | 'unusedOverdraft' | 'payday' | 'usual' | 'low'
> = true;

describe('BO-07 point 1', () => {
  it('BO-07 point 1: the month picture shape is the agreed one', () => {
    expect(keys).toBe(true);
  });

  it('CountsLine accepts isSettlement', () => {
    const l: CountsLine = { id: 'a', amount: minorUnits(1), isShared: true, isMine: false, isSettlement: true };
    expect(l.isSettlement).toBe(true);
  });
});
