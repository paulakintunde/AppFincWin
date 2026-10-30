/**
 * 05.3-21 (DSV-10): view-model for "What could I do instead?". Four cards in FUTURE_ORDER from insteadFutures; the
 * Buy-it-later card and its slider come from explore(). Every figure is the engine's.
 *
 * D-12: the explorer is called on the judge's own basis (price = dayOne, unspent = max(0, available), answerWaits when the
 * answer is "not yet"), so at lever 0 its month is the answer's ready-by month for a one-off purchase.
 * A plan purchase (monthly > 0) is dated by the judge from the plan's start, a different question from "buy the whole
 * price later", and the two can differ by one month. For those the lever-0 month is anchored to the answer's own ready
 * month and the same whole-month offset is applied at every other lever value, so slider 0 never shows a date other
 * than the answer's and moving the slider still moves the date by the explorer's own steps.
 */
import { FUTURE_ORDER, explore, insteadFutures } from '@/engine/decide/v3';
import type { Evaluation, Futures } from '@/engine/decide/v3';
import { minorUnits, type MinorUnits } from '@/engine/money';
import type { Percent } from '@/engine/payoff';

type DepositView = Futures['deposit']['views'][number];
type FutureKind = Futures['order'][number];

export type InsteadCard =
  | {
      readonly id: 'buy_now';
      readonly head: { readonly kind: 'spent'; readonly price: MinorUnits } | { readonly kind: 'notCovered' };
      readonly before: MinorUnits | null;
      readonly after: MinorUnits | null;
      readonly emergencyUntouched: boolean;
      readonly planTotal: MinorUnits | null;
    }
  | { readonly id: 'keep'; readonly head: { readonly amount: MinorUnits | null } }
  | {
      readonly id: 'deposit';
      readonly state: 'enterRate' | 'rate';
      readonly years: 1 | 3 | 5;
      readonly months: number;
      /** The 0% view's interest given up (0 for a one-off purchase): shown while no rate is typed. */
      readonly zeroFigure: MinorUnits;
      readonly zeroView: DepositView | null;
      /** The view at the typed rate (0% is a rate); null until one is typed. */
      readonly view: DepositView | null;
    }
  | {
      readonly id: 'buy_later';
      /** The head at slider 0: the answer's ready-by month (D-12). */
      readonly head: { readonly month: string | null; readonly months: number | null };
      /** The slider's result at the chosen lever. */
      readonly result: {
        readonly month: string | null;
        readonly months: number | null;
        readonly resultKey: 'decide.v3.ui.instead.then' | 'decide.v3.ui.instead.thenSeasonal';
      };
      readonly monthlyAmount: MinorUnits | null;
      readonly clamped: boolean;
    };

export interface InsteadModel {
  readonly cards: readonly InsteadCard[];
  readonly seasonal: boolean;
}

/** 0..200 in steps of 25 major units, as minor units: [0, 25, ..., 200] x 10^exponent. */
export function sliderStops(exponent: number): readonly MinorUnits[] {
  if (!Number.isInteger(exponent) || exponent < 0) throw new RangeError(`sliderStops: exponent ${exponent} must be an integer >= 0`);
  const unit = 10 ** exponent;
  return Array.from({ length: 9 }, (_, i) => minorUnits(i * 25 * unit));
}

const monthIndex = (ym: string): number => Number(ym.slice(0, 4)) * 12 + Number(ym.slice(5, 7)) - 1;
const fromIndex = (n: number): string => `${Math.floor(n / 12)}-${String((n % 12) + 1).padStart(2, '0')}`;

export function insteadModel(args: { ev: Evaluation; userRate: Percent | null; years: 1 | 3 | 5; everydayCut: MinorUnits }): InsteadModel | null {
  const { ev, userRate, years, everydayCut } = args;
  const purchase = ev.purchase;
  if (purchase === null) return null;
  const { result, month, funds } = ev;
  const futures = insteadFutures({ result, month, funds, purchase, userRate, years });
  const seasonal = month.incomePicture?.treated === 'seasonal';

  // D-12: the explorer on the judge's own basis.
  const unspentRaw = funds.unspent === null ? null : (funds.unspent.available ?? funds.unspent.value);
  const unspent = unspentRaw === null ? null : minorUnits(Math.max(0, unspentRaw));
  const run = (cut: MinorUnits) =>
    explore({
      month,
      flexibleSaving: minorUnits(0),
      levers: { everydayCut: cut, flexibleSavingCut: minorUnits(0) },
      price: purchase.dayOne,
      unspent,
      ...(result.code === 'not_yet' ? { answerWaits: true } : {}),
    });
  const at0 = run(minorUnits(0));
  const atCut = everydayCut === 0 ? at0 : run(everydayCut);

  // Plan purchases: anchor to the answer's own ready month (see the header).
  const answer = result.readyBy !== null && result.readyBy.kind === 'month' ? result.readyBy.month : null;
  const offset =
    purchase.monthly > 0 && answer !== null && at0.buyLater.readyBy !== null ? monthIndex(answer) - monthIndex(at0.buyLater.readyBy) : 0;
  const shifted = (b: typeof at0.buyLater): { month: string | null; months: number | null } =>
    b.readyBy === null || b.months === null
      ? { month: null, months: null }
      : offset === 0
        ? { month: b.readyBy, months: b.months }
        : { month: fromIndex(Math.max(monthIndex(b.readyBy) + offset, monthIndex(month.month) + 1)), months: Math.max(1, b.months + offset) };
  const head = shifted(at0.buyLater);
  const then = shifted(atCut.buyLater);

  const zeroView = futures.deposit.views.find((v) => v.rate === 0n) ?? null;
  const typedView = userRate === null ? null : (futures.deposit.views.find((v) => v.rate === userRate) ?? null);

  const byKind: Record<FutureKind, InsteadCard> = {
    buy_now: {
      id: 'buy_now',
      head: result.code === 'not_yet' ? { kind: 'notCovered' } : { kind: 'spent', price: purchase.dayOne },
      before: unspentRaw === null ? null : minorUnits(unspentRaw),
      after: futures.buyNow.unspentAfter,
      emergencyUntouched: futures.buyNow.emergencyUntouched,
      planTotal: futures.buyNow.planTotal,
    },
    keep: { id: 'keep', head: { amount: futures.keep.unspentKept } },
    deposit: {
      id: 'deposit',
      state: userRate === null ? 'enterRate' : 'rate',
      years,
      months: futures.deposit.months,
      zeroFigure: zeroView === null ? minorUnits(0) : zeroView.interestGivenUp,
      zeroView,
      view: typedView,
    },
    buy_later: {
      id: 'buy_later',
      head,
      result: {
        ...then,
        resultKey: seasonal || then.months === 0 ? 'decide.v3.ui.instead.thenSeasonal' : 'decide.v3.ui.instead.then',
      },
      monthlyAmount: atCut.typicalLeft,
      clamped: atCut.clamped,
    },
  };
  return { cards: FUTURE_ORDER.map((k) => byKind[k]), seasonal };
}
