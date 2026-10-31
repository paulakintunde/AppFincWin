/**
 * 05.3-15: the Decide home month bar as a pure model. Integer minor units only; copy keys, no English.
 * A4 (owner, 2026-10-31): money set aside this month is not 'still to come'; it is its own part of the bar.
 */
import type { MonthModel } from '@/engine/decide/v3';
import { minorUnits, type MinorUnits } from '@/engine/money';

export type BarSegment = { readonly kind: 'out' | 'setAside' | 'toCome' | 'left' | 'over'; readonly amount: MinorUnits };

export interface MonthBar {
  readonly moneyIn: MinorUnits;
  readonly outSoFar: MinorUnits;
  readonly setAside: MinorUnits;
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
  const stillToCome = minorUnits(month.billsDue + month.erest);
  const setAside = month.setAside;
  const negative = month.monthLeft < 0;
  const left = negative ? minorUnits(0) : month.monthLeft;
  const over = negative ? minorUnits(-month.monthLeft) : minorUnits(0);

  // Overspent: the bar is money in split between out and to-come, then the over segment past the end.
  const outDrawn = negative ? minorUnits(Math.min(outSoFar, Math.max(moneyIn, 0))) : outSoFar;
  const setDrawn = negative ? minorUnits(Math.min(setAside, Math.max(moneyIn, 0) - outDrawn)) : setAside;
  const toComeDrawn = negative ? minorUnits(Math.min(stillToCome, Math.max(moneyIn, 0) - outDrawn - setDrawn)) : stillToCome;

  const segments: BarSegment[] = [];
  const push = (kind: BarSegment['kind'], amount: MinorUnits): void => {
    if (amount > 0) segments.push({ kind, amount });
  };
  push('out', outDrawn);
  push('setAside', setDrawn);
  push('toCome', toComeDrawn);
  push('left', left);
  push('over', over);

  return {
    moneyIn,
    outSoFar,
    setAside,
    stillToCome,
    left,
    over,
    negative,
    segments,
    captionKey: negative ? 'decide.v3.ui.home.onTrackOver' : 'decide.v3.ui.home.onTrack',
    figure: negative ? over : left,
  };
}
