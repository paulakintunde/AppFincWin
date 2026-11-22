/**
 * Trade-off explorer (05.1 plan 26, v3 §3.8, I30). Only everyday spending and flexible saving can be flexed: the
 * levers are typed, so bills, required debt payments, committed saving and the emergency fund are never inputs and
 * never change. The month model passed in is read, never modified.
 */
import { minorUnits, type MinorUnits } from '../../../money/types';
import { bisectLargest, type BisectResult } from '../../bisectCore';
import type { MonthModel } from '../types';
import { alignBuyLater, buyLater } from './futures';

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
  /**
   * 08.1 D-05: the answer's own ready-by month (null: no date inside a year). Buy it later follows it, moved by what the levers
   * save, so at lever 0 it is exactly the answer's month. Absent: the usual-month figure, as before.
   */
  readonly answerReadyBy?: string | null;
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
  const later = (left: MinorUnits | null, lift: MinorUnits): ReturnType<typeof buyLater> =>
    buyLater({
      price: input.price,
      unspent: input.unspent,
      typicalLeft: left,
      month: input.month.month,
      // D-12: the season follows the slider; the lever lifts every month of the seasonal walk (saved = max(0, left + lift))
      // Stryker disable next-line ConditionalExpression: an absent picture or a picture key holding undefined reads the same in buyLater
      ...(input.month.incomePicture === undefined ? {} : { picture: input.month.incomePicture }),
      lift,
      ...(input.answerWaits === true ? { waitsAtLeastAMonth: true } : {}),
    });
  const usual = later(typicalLeft, minorUnits(everydayCut + savingCut));
  return {
    typicalLeft,
    buyLater:
      input.answerReadyBy === undefined
        ? usual
        : alignBuyLater(usual, later(input.month.typicalLeft, minorUnits(0)), input.month.month, input.answerReadyBy),
    clamped,
  };
}

export function largestPriceThatFits(upper: MinorUnits, fits: (p: MinorUnits) => boolean): BisectResult {
  return bisectLargest(upper, fits);
}
