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
  /**
   * D-12, finding 6: the judge's own basis for the wait. price is its day-one price and unspent is its available
   * unspent money; set this when the answer is "not yet" so a covered price still waits a month, as the answer does.
   */
  readonly answerWaits?: boolean;
}): { readonly typicalLeft: MinorUnits | null; readonly buyLater: ReturnType<typeof buyLater>; readonly clamped: boolean } {
  const { levers } = input;
  if (levers.everydayCut < 0 || levers.flexibleSavingCut < 0 || input.flexibleSaving < 0) {
    throw new RangeError('explore: levers must be >= 0');
  }
  const savingCut = Math.min(levers.flexibleSavingCut, input.flexibleSaving);
  // L-04: the everyday lever cannot give back more than the user actually spends (E)
  const everydayCut = Math.min(levers.everydayCut, Math.max(0, input.month.e ?? 0));
  const clamped = savingCut < levers.flexibleSavingCut || everydayCut < levers.everydayCut;
  const typicalLeft =
    input.month.typicalLeft === null ? null : minorUnits(input.month.typicalLeft + everydayCut + savingCut);
  return {
    typicalLeft,
    buyLater: buyLater({
      price: input.price,
      unspent: input.unspent,
      typicalLeft,
      month: input.month.month,
      // D-12: the season follows the slider; the lever lifts every month of the seasonal walk (saved = max(0, left + lift))
      ...(input.month.incomePicture === undefined ? {} : { picture: input.month.incomePicture }),
      lift: minorUnits(everydayCut + savingCut),
      ...(input.answerWaits === true ? { waitsAtLeastAMonth: true } : {}),
    }),
    clamped,
  };
}

export function largestPriceThatFits(upper: MinorUnits, fits: (p: MinorUnits) => boolean): BisectResult {
  return bisectLargest(upper, fits);
}
