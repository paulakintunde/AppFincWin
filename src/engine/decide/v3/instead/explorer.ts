/**
 * Trade-off explorer (05.1 plan 26, v3 §3.8, I30). Only everyday spending and flexible saving can be flexed: the
 * levers are typed, so bills, required debt payments, committed saving and the emergency fund are never inputs and
 * never change. The month model passed in is read, never modified.
 */
import { minorUnits, type MinorUnits } from '../../../money/types';
import { bisectLargest, type BisectResult } from '../../bisectCore';
import type { MonthModel } from '../types';
import { buyLater } from './futures';

export interface ExplorerLevers {
  readonly everydayCut: MinorUnits;
  readonly flexibleSavingCut: MinorUnits;
}

export function explore(input: {
  readonly month: MonthModel;
  readonly flexibleSaving: MinorUnits;
  readonly levers: ExplorerLevers;
  readonly price: MinorUnits;
  readonly unspent: MinorUnits | null;
}): { readonly typicalLeft: MinorUnits | null; readonly buyLater: ReturnType<typeof buyLater>; readonly clamped: boolean } {
  const { levers } = input;
  if (levers.everydayCut < 0 || levers.flexibleSavingCut < 0 || input.flexibleSaving < 0) {
    throw new RangeError('explore: levers must be >= 0');
  }
  const savingCut = Math.min(levers.flexibleSavingCut, input.flexibleSaving);
  const clamped = savingCut < levers.flexibleSavingCut;
  const typicalLeft =
    input.month.typicalLeft === null ? null : minorUnits(input.month.typicalLeft + levers.everydayCut + savingCut);
  return {
    typicalLeft,
    buyLater: buyLater({ price: input.price, unspent: input.unspent, typicalLeft, month: input.month.month }),
    clamped,
  };
}

export function largestPriceThatFits(upper: MinorUnits, fits: (p: MinorUnits) => boolean): BisectResult {
  return bisectLargest(upper, fits);
}
