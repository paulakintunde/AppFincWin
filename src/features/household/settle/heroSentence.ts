// 08-21 (HH-07, D-23): the one declarative sentence that says who owes whom. Pure: it takes the pair balances from the
// engine and returns copy keys with raw values (a person key, minor units, a count). The screen turns a key into a name
// through the member resolver (D-32) and an amount through the money formatter, so no name or amount is built here.
import type { PairBalance } from '@/engine/household/balances';

export type HeroKey =
  | 'household.home.sentence.owesYou'
  | 'household.home.sentence.youOwe'
  | 'household.home.sentence.owedAcross'
  | 'household.settle.sentence.youOweAcross'
  | 'household.home.sentence.square';

export interface HeroLine {
  key: HeroKey;
  params: {
    /** The person's key when exactly one person is named. */
    otherKey?: string;
    /** Minor units of the household currency, always positive. */
    amount?: number;
    count?: number;
  };
}

/**
 * One line when only one direction has a balance, two (owed to you, then you owe) when both do, and the square line when
 * nothing is owed. A balance is a pair whose net is not zero; a pair that nets to zero is square.
 */
export function heroSentence(pairs: readonly PairBalance[]): HeroLine[] {
  const owed = pairs.filter((p) => p.net > 0);
  const owing = pairs.filter((p) => p.net < 0);
  const lines: HeroLine[] = [];
  if (owed.length === 1) {
    lines.push({ key: 'household.home.sentence.owesYou', params: { otherKey: owed[0]!.otherKey, amount: owed[0]!.net } });
  } else if (owed.length > 1) {
    lines.push({
      key: 'household.home.sentence.owedAcross',
      params: { amount: owed.reduce((sum, p) => sum + p.net, 0), count: owed.length },
    });
  }
  if (owing.length === 1) {
    lines.push({ key: 'household.home.sentence.youOwe', params: { otherKey: owing[0]!.otherKey, amount: -owing[0]!.net } });
  } else if (owing.length > 1) {
    lines.push({
      key: 'household.settle.sentence.youOweAcross',
      params: { amount: owing.reduce((sum, p) => sum - p.net, 0), count: owing.length },
    });
  }
  if (lines.length === 0) lines.push({ key: 'household.home.sentence.square', params: {} });
  return lines;
}
