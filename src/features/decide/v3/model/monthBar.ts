/**
 * 05.3-15: the Decide home month bar as a pure model. Integer minor units only; copy keys, no English.
 * A4: setAside counts as "still to come" (UI-SPEC yardstick); the owner confirms at the walkthrough.
 */
import type { MonthModel } from '@/engine/decide/v3';
import { minorUnits, type MinorUnits } from '@/engine/money';

export type BarSegment = { readonly kind: 'out' | 'toCome' | 'left' | 'over'; readonly amount: MinorUnits };

export interface MonthBar {
  readonly moneyIn: MinorUnits;
  readonly outSoFar: MinorUnits;
  readonly stillToCome: MinorUnits;
  readonly left: MinorUnits;
  readonly over: MinorUnits;
  readonly negative: boolean;
  readonly segments: readonly BarSegment[];
  readonly captionKey: string;
  readonly figure: MinorUnits;
}

export function monthBar(month: MonthModel): MonthBar {
  const moneyIn = month.moneyIn;
  const outSoFar = minorUnits(month.billsPaid + month.everydayLogged);
  const stillToCome = minorUnits(month.billsDue + month.erest + month.setAside);
  const negative = month.monthLeft < 0;
  const left = negative ? minorUnits(0) : month.monthLeft;
  const over = negative ? minorUnits(-month.monthLeft) : minorUnits(0);

  // Overspent: the bar is money in split between out and to-come, then the over segment past the end.
  const outDrawn = negative ? minorUnits(Math.min(outSoFar, Math.max(moneyIn, 0))) : outSoFar;
  const toComeDrawn = negative ? minorUnits(Math.min(stillToCome, Math.max(moneyIn, 0) - outDrawn)) : stillToCome;

  const segments: BarSegment[] = [];
  const push = (kind: BarSegment['kind'], amount: MinorUnits): void => {
    if (amount > 0) segments.push({ kind, amount });
  };
  push('out', outDrawn);
  push('toCome', toComeDrawn);
  push('left', left);
  push('over', over);

  return {
    moneyIn,
    outSoFar,
    stillToCome,
    left,
    over,
    negative,
    segments,
    captionKey: negative ? 'decide.v3.ui.home.onTrackOver' : 'decide.v3.ui.home.onTrack',
    figure: negative ? over : left,
  };
}
