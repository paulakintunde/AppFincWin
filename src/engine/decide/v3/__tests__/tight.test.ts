/**
 * 05.4 FIN-07 / D-40 (05.4-21): tight.ts by hand. The right-answer cases' figures are pinned here (BR-07..BR-09, BR-11, SN-10,
 * SN-11, QE-01, DB-02, DB-03, DB-07, DB-10, SO-06).
 */
import { minorUnits } from '../../../money/types';
import { TIGHT_FLOOR_DIVISOR, TIGHT_SHARE_BP } from '../constants';
import { isTight, isTightOneOff, monthlySpendingOf, tightFact, tightFloor } from '../tight';

const mu = minorUnits;

describe('tight floor', () => {
  it('the constants are 80% and a tenth', () => {
    expect(TIGHT_SHARE_BP).toBe(8000);
    expect(TIGHT_FLOOR_DIVISOR).toBe(10);
  });

  it('a tenth of bills plus everyday spending, rounded up', () => {
    expect(tightFloor(mu(200_000), null)).toEqual({ floor: 20_000, basis: 'tenth' }); // SO-06, DB-02: $1,200 + $800
    expect(tightFloor(mu(170_000), null)).toEqual({ floor: 17_000, basis: 'tenth' }); // SN-11: £1,000 + £700
    expect(tightFloor(mu(130_000), undefined)).toEqual({ floor: 13_000, basis: 'tenth' }); // QE-01: £1,000 + £300
    expect(tightFloor(mu(320_001), null)).toEqual({ floor: 32_001, basis: 'tenth' }); // 32,000.1 rounds up
    expect(tightFloor(mu(1), null)).toEqual({ floor: 1, basis: 'tenth' });
    expect(tightFloor(mu(0), null)).toEqual({ floor: 0, basis: 'tenth' });
    expect(tightFloor(mu(-5_000), null)).toEqual({ floor: 0, basis: 'tenth' });
  });

  it("the user's line replaces the tenth, even when it is lower (BR-09: $300 against $200)", () => {
    expect(tightFloor(mu(200_000), mu(30_000))).toEqual({ floor: 30_000, basis: 'user_line' });
    expect(tightFloor(mu(200_000), mu(5_000))).toEqual({ floor: 5_000, basis: 'user_line' });
    expect(tightFloor(mu(200_000), mu(0))).toEqual({ floor: 0, basis: 'user_line' });
    expect(tightFloor(mu(200_000), mu(-100))).toEqual({ floor: 0, basis: 'user_line' });
  });

  it("monthly spending is the usual month's bills plus everyday spending; unknown everyday counts as 0", () => {
    expect(monthlySpendingOf({ recurringBills: mu(120_000), e: mu(80_000) })).toBe(200_000);
    expect(monthlySpendingOf({ recurringBills: mu(120_000), e: null })).toBe(120_000);
    expect(monthlySpendingOf({ recurringBills: mu(0), e: mu(-10) })).toBe(0);
  });

  it('the fact carries the floor and its basis', () => {
    expect(tightFact({ floor: mu(20_000), basis: 'tenth' })).toEqual({ code: 'tight_floor', values: { floor: 20_000, basis: 'tenth' } });
  });
});

describe('isTight (plans: the 80% share or the floor)', () => {
  it('BR-07: $1,870 of $2,200 is 85%, over 80%; $330 left is above the $280 floor', () => {
    expect(isTight(mu(220_000), mu(187_000), mu(280_000), null)).toBe(true);
    expect(mu(220_000) - mu(187_000)).toBeGreaterThan(tightFloor(mu(280_000), null).floor);
  });

  it('exactly 80% is not over 80% (the share test is strict)', () => {
    expect(isTight(mu(100_000), mu(80_000), mu(0), null)).toBe(false);
    expect(isTight(mu(100_000), mu(80_001), mu(0), null)).toBe(true);
  });

  it('BR-08: $650 of $1,000 is 65%, but $350 left is under the $400 floor', () => {
    expect(isTight(mu(100_000), mu(65_000), mu(400_000), null)).toBe(true);
  });

  it("BR-09: $750 of $1,000, $250 left: above the $200 tenth, under Lena's $300 line", () => {
    expect(isTight(mu(100_000), mu(75_000), mu(200_000), null)).toBe(false);
    expect(isTight(mu(100_000), mu(75_000), mu(200_000), mu(30_000))).toBe(true);
  });

  it('BR-11: £200 of £200 is 100% and leaves £0, under the £180 floor', () => {
    expect(isTight(mu(20_000), mu(20_000), mu(180_000), null)).toBe(true);
  });

  it('room left exactly at the floor is not under it', () => {
    expect(isTight(mu(100_000), mu(60_000), mu(400_000), null)).toBe(false);
    expect(isTight(mu(100_000), mu(60_001), mu(400_000), null)).toBe(true);
  });
});

describe('isTightOneOff (D-40: the floor only)', () => {
  it('SN-10 $20, QE-01 £25, SN-11 £50, DB-02 / DB-03 / SO-06 $100, DB-07 $300: under their floors', () => {
    expect(isTightOneOff(mu(2_000), mu(200_000), null)).toBe(true);
    expect(isTightOneOff(mu(2_500), mu(130_000), null)).toBe(true);
    expect(isTightOneOff(mu(5_000), mu(170_000), null)).toBe(true);
    expect(isTightOneOff(mu(10_000), mu(230_000), null)).toBe(true);
    expect(isTightOneOff(mu(30_000), mu(320_000), null)).toBe(true);
  });

  it('DB-10: $250 is not under the $200 floor; exactly the floor is not under it', () => {
    expect(isTightOneOff(mu(25_000), mu(200_000), null)).toBe(false);
    expect(isTightOneOff(mu(20_000), mu(200_000), null)).toBe(false);
    expect(isTightOneOff(mu(19_999), mu(200_000), null)).toBe(true);
  });

  it('never the 80% share: a one-off that takes all of the month but leaves a lot is not tight', () => {
    expect(isTightOneOff(mu(500_000), mu(200_000), null)).toBe(false);
  });

  it("the user's line decides when set", () => {
    expect(isTightOneOff(mu(25_000), mu(200_000), mu(30_000))).toBe(true);
    expect(isTightOneOff(mu(2_000), mu(200_000), mu(1_000))).toBe(false);
  });
});
