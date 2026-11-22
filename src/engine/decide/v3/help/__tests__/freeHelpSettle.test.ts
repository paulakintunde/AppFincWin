/**
 * 08.1-08 CMP-F04: the settle-up trigger of the free-help pointer. A lapsed settle-up as the payer, or an amount owed above the
 * money the answer counts as left; never on an ask or a not-ready answer; still only for a country with a row.
 */
import { minorUnits } from '../../../../money/types';
import type { Result, V3Household } from '../../types';
import { freeHelpFacts, settleUpTrouble } from '../freeHelp';

const mu = minorUnits;
type Shape = Pick<Result, 'code' | 'variant' | 'readiness'>;
const fits: Shape = { code: 'fits_month', variant: null };
const household = (lapsedAsPayer: boolean, owed: number): V3Household => ({ scope: 'me', notShared: [], settleUp: { lapsedAsPayer, owed: mu(owed) } });

describe('08.1-08 settleUpTrouble', () => {
  it('a lapsed settle-up as the payer is trouble whatever is owed', () => {
    expect(settleUpTrouble(household(true, 100), mu(1_000_000))).toBe(true);
  });
  it('an amount owed above the money left is trouble; equal or below is not', () => {
    expect(settleUpTrouble(household(false, 100_001), mu(100_000))).toBe(true);
    expect(settleUpTrouble(household(false, 100_000), mu(100_000))).toBe(false);
    expect(settleUpTrouble(household(false, 20_000), mu(100_000))).toBe(false);
  });
  it('owing something when nothing is left is trouble (a negative month)', () => {
    expect(settleUpTrouble(household(false, 1), mu(-500))).toBe(true);
  });
  it('no settle-up, no household and an empty block are not trouble', () => {
    expect(settleUpTrouble(null, mu(0))).toBe(false);
    expect(settleUpTrouble(undefined, mu(0))).toBe(false);
    expect(settleUpTrouble({ scope: 'me', notShared: [] }, mu(0))).toBe(false);
    expect(settleUpTrouble({ scope: 'me', notShared: [], settleUp: null }, mu(0))).toBe(false);
  });
});

describe('08.1-08 freeHelpFacts with the settle-up trigger', () => {
  it('a fitting answer carries the pointer when the settle-up is in trouble', () => {
    expect(freeHelpFacts(fits, 'US', true)).toEqual([{ code: 'free_help', values: { country: 'US', name: 'NFCC' } }]);
  });
  it('and not when it is not (the old call is unchanged)', () => {
    expect(freeHelpFacts(fits, 'US', false)).toEqual([]);
    expect(freeHelpFacts(fits, 'US')).toEqual([]);
  });
  it('never on an ask or a not-ready answer, and never without a country row', () => {
    expect(freeHelpFacts({ code: 'needs_input', variant: null }, 'US', true)).toEqual([]);
    expect(freeHelpFacts({ ...fits, readiness: { ready: false, missing: ['past_month_missing'] } }, 'US', true)).toEqual([]);
    expect(freeHelpFacts({ ...fits, readiness: { ready: true, missing: [] } }, 'US', true)).toHaveLength(1);
    expect(freeHelpFacts(fits, 'FR', true)).toEqual([]);
    expect(freeHelpFacts(fits, null, true)).toEqual([]);
  });
  it('a short month still carries it with no settle-up trouble', () => {
    expect(freeHelpFacts({ code: 'monthly_short', variant: null }, 'GB', false)).toHaveLength(1);
  });
});
