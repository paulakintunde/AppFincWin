import fc from 'fast-check';
import { minorUnits } from '../../money/types';
import { isViewersOwn, myShareOfLine, type MyShareLine, type StoredShare } from '../myShare';
import {
  asStored,
  countsLineOf,
  householdAmountOf,
  mineAmountOf,
  storedShareInHome,
  type ScopeLine,
} from '../countsForMeInput';

const m = minorUnits;
const ME = 'me';
const SAM = 'sam';

function personal(over: Partial<MyShareLine> = {}): MyShareLine {
  return { createdBy: ME, isShared: false, amount: m(-5_000), ...over };
}
function scope(over: Partial<ScopeLine> = {}): ScopeLine {
  return {
    id: 'l1',
    createdBy: ME,
    isShared: false,
    amount: m(-5_000),
    amountHome: m(-5_000),
    householdAmount: null,
    householdCurrency: null,
    ...over,
  };
}
const splits: StoredShare[] = [
  { memberKey: ME, share: m(-3_000) },
  { memberKey: SAM, share: m(-2_000) },
];

describe('myShareOfLine (ARC-17, D-35)', () => {
  it('a personal line of the viewer is its full amount', () => {
    expect(myShareOfLine(personal(), [], ME)).toEqual({ amount: -5_000, source: 'line' });
  });
  it('a line with no creator stays the reader’s', () => {
    expect(myShareOfLine(personal({ createdBy: null }), [], ME)).toEqual({ amount: -5_000, source: 'line' });
    expect(isViewersOwn({ createdBy: null }, ME)).toBe(true);
    expect(isViewersOwn({ createdBy: SAM }, ME)).toBe(false);
  });
  it('a personal copy with copy_share counts the share; a null copy_share counts the line', () => {
    expect(myShareOfLine(personal({ copyShare: m(-1_200) }), [], ME)).toEqual({ amount: -1_200, source: 'stored' });
    expect(myShareOfLine(personal({ copyShare: null }), [], ME)).toEqual({ amount: -5_000, source: 'line' });
  });
  it('a partner’s personal line is 0', () => {
    expect(myShareOfLine(personal({ createdBy: SAM }), [], ME).amount).toBe(0);
  });
  it('a shared line is the viewer’s stored split, or 0 when not on it', () => {
    expect(myShareOfLine(personal({ isShared: true, createdBy: SAM }), splits, ME)).toEqual({ amount: -3_000, source: 'stored' });
    expect(myShareOfLine(personal({ isShared: true }), [{ memberKey: SAM, share: m(-5_000) }], ME).amount).toBe(0);
    expect(myShareOfLine(personal({ isShared: true }), [{ memberKey: null, share: m(-5_000) }], ME).amount).toBe(0);
  });
  it('a settlement is 0 whoever made it', () => {
    expect(myShareOfLine(personal({ isSettlement: true }), [], ME).amount).toBe(0);
    expect(myShareOfLine(personal({ isSettlement: true, isShared: true }), splits, ME).amount).toBe(0);
  });
  it('never reads the line amount for a shared line: the stored split wins (property)', () => {
    fc.assert(
      fc.property(fc.integer({ min: -1_000_000, max: 1_000_000 }), fc.integer({ min: -1_000_000, max: 1_000_000 }), (amount, share) => {
        const got = myShareOfLine(personal({ isShared: true, amount: m(amount) }), [{ memberKey: ME, share: m(share) }], ME);
        return got.amount === share;
      }),
    );
  });
});

describe('storedShareInHome', () => {
  it('same currency: as stored; a copy with no household currency is read as home', () => {
    expect(storedShareInHome(m(-3_000), scope({ householdCurrency: 'USD' }), 'USD')).toBe(-3_000);
    expect(storedShareInHome(m(-3_000), scope({ householdCurrency: null }), 'USD')).toBe(-3_000);
  });
  it('another currency: the line’s home figure scaled by the share’s part, rounded half away from zero', () => {
    const line = scope({ amountHome: m(-4_600), householdAmount: m(-5_000), householdCurrency: 'EUR' });
    expect(storedShareInHome(m(-3_000), line, 'USD')).toBe(-2_760);
    const income = scope({ amountHome: m(1_001), householdAmount: m(2_000), householdCurrency: 'EUR' });
    expect(storedShareInHome(m(1_000), income, 'USD')).toBe(501);
  });
  it('null when there is nothing to scale by', () => {
    expect(storedShareInHome(m(-1), scope({ householdCurrency: 'EUR', amountHome: null, householdAmount: m(-5) }), 'USD')).toBeNull();
    expect(storedShareInHome(m(-1), scope({ householdCurrency: 'EUR', householdAmount: null }), 'USD')).toBeNull();
    expect(storedShareInHome(m(-1), scope({ householdCurrency: 'EUR', householdAmount: m(0) }), 'USD')).toBeNull();
  });
});

describe('asStored', () => {
  it('only the viewer’s own plain personal line', () => {
    expect(asStored(scope(), ME)).toBe(true);
    expect(asStored(scope({ copyShare: null }), ME)).toBe(true);
    expect(asStored(scope({ copyShare: m(-1) }), ME)).toBe(false);
    expect(asStored(scope({ isShared: true }), ME)).toBe(false);
    expect(asStored(scope({ createdBy: SAM }), ME)).toBe(false);
  });
});

describe('countsLineOf / mineAmountOf (countsForMe adapter)', () => {
  it('drops a partner’s personal line (T-08-90)', () => {
    expect(countsLineOf(scope({ createdBy: SAM }), [], ME, 'USD')).toBeNull();
    expect(mineAmountOf(scope({ createdBy: SAM }), [], ME, 'USD')).toBeNull();
  });
  it('a shared line by a partner counts my stored share', () => {
    const line = scope({ createdBy: SAM, isShared: true, householdAmount: m(-5_000), householdCurrency: 'USD' });
    expect(countsLineOf(line, splits, ME, 'USD')).toEqual({ line: { id: 'l1', amount: -3_000, isShared: true, isMine: false } });
    expect(mineAmountOf(line, splits, ME, 'USD')).toEqual({ amountHome: -3_000 });
  });
  it('my own personal line counts its home amount', () => {
    expect(mineAmountOf(scope(), [], ME, 'USD')).toEqual({ amountHome: -5_000 });
  });
  it('a settlement carries its flag and counts 0 through countsForMe', () => {
    expect(countsLineOf(scope({ isSettlement: true }), [], ME, 'USD')).toEqual({
      line: { id: 'l1', amount: -5_000, isShared: false, isMine: true, isSettlement: true },
    });
    expect(mineAmountOf(scope({ isSettlement: true }), [], ME, 'USD')).toEqual({ amountHome: 0 });
  });
  it('an unconvertible line comes back unconverted, never guessed', () => {
    expect(countsLineOf(scope({ amountHome: null }), [], ME, 'USD')).toEqual({ unconverted: true });
    expect(mineAmountOf(scope({ amountHome: null }), [], ME, 'USD')).toEqual({ amountHome: null });
  });
});

describe('householdAmountOf (Household scope)', () => {
  it('shared lines only, at their household amount', () => {
    expect(householdAmountOf({ isShared: false, householdAmount: m(-5_000) })).toBeNull();
    expect(householdAmountOf({ isShared: true, householdAmount: m(-5_000) })).toEqual({ amount: -5_000 });
    expect(householdAmountOf({ isShared: true, householdAmount: null })).toEqual({ amount: null });
  });
});
