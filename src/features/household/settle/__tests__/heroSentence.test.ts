import type { PairBalance } from '@/engine/household/balances';
import { minorUnits } from '@/engine/money/types';
import { heroSentence } from '../heroSentence';

const pair = (otherKey: string, net: number): PairBalance => ({
  otherKey,
  net: minorUnits(net),
  pending: minorUnits(0),
  lineIds: ['l1'],
});

describe('heroSentence', () => {
  it('names one person who owes the viewer', () => {
    expect(heroSentence([pair('sam', 8400)])).toEqual([
      { key: 'household.home.sentence.owesYou', params: { otherKey: 'sam', amount: 8400 } },
    ]);
  });

  it('names the one person the viewer owes, as a positive amount', () => {
    expect(heroSentence([pair('sam', -2500)])).toEqual([
      { key: 'household.home.sentence.youOwe', params: { otherKey: 'sam', amount: 2500 } },
    ]);
  });

  it('adds up several people who owe the viewer', () => {
    expect(heroSentence([pair('a', 1000), pair('b', 500)])).toEqual([
      { key: 'household.home.sentence.owedAcross', params: { amount: 1500, count: 2 } },
    ]);
  });

  it('says square when nothing is owed or every pair nets to zero', () => {
    const square = [{ key: 'household.home.sentence.square', params: {} }];
    expect(heroSentence([])).toEqual(square);
    expect(heroSentence([pair('sam', 0)])).toEqual(square);
  });

  it('gives the owed-to-you sentence first and the you-owe sentence second when both exist', () => {
    expect(heroSentence([pair('a', 1000), pair('b', -300)])).toEqual([
      { key: 'household.home.sentence.owesYou', params: { otherKey: 'a', amount: 1000 } },
      { key: 'household.home.sentence.youOwe', params: { otherKey: 'b', amount: 300 } },
    ]);
  });

  it('adds up several people the viewer owes', () => {
    expect(heroSentence([pair('a', -1000), pair('b', -500)])).toEqual([
      { key: 'household.settle.sentence.youOweAcross', params: { amount: 1500, count: 2 } },
    ]);
  });
});
