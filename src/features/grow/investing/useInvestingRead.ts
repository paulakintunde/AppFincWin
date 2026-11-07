// 06-14 (GRW-05, GRW-06, GRW-10, D-11, D-12, D-24): the Investing segment's read model. PURE composition of the engine's
// lots, gain and staleness maths; nothing here is stored in the cache and no figure is worked out in this file apart from
// the whole-percent allocation (half up, via the engine's divideHalfUp).
//
// Put in = the average-cost basis after replaying the entries; the opening put-in counts as the first buy. Value = the
// holding's latest known value (the server moves it with each 'value' entry). Totals, allocation and the monthly figure are
// in the home currency; a holding that cannot convert is shown but left out of them.
import { useCallback, useMemo } from 'react';
import { convertLatest } from '@/data/queries/fxConvert';
import { useHoldingLotRows, useHoldingRows } from '@/data/queries/growHoldings';
import type { HoldingLotRow } from '@/db/holdingLots';
import type { HoldingRow, HoldingType } from '@/db/holdings';
import { gainPercentTenths, holdingGain, isValueStale, replayLots, totalGain, type LotEntry } from '@/engine/grow';
import { divideHalfUp, minorUnits, type MinorUnits } from '@/engine/money';
import { usePastContext, type PastContext } from '@/features/decide/past/usePastDecisions';
import type { ToHome } from '../connect';

export type InvestingStatus = 'loading' | 'error' | 'ready';

export interface HoldingLine {
  id: string;
  name: string;
  type: HoldingType;
  currency: string;
  /** Own-currency minor units. */
  value: number;
  putIn: number;
  gain: number;
  /** Tenths of a percent (112 = 11.2%); null when nothing was put in. */
  gainPercentTenths: number | null;
  realisedGain: number;
  dividends: number;
  fees: number;
  /** The date the value was last given. */
  asOf: string;
  /** D-12: the value is more than 30 days old. */
  stale: boolean;
  /** Own-currency minor units a month. */
  monthlyAmount: number | null;
  /** Whole percent of the home-currency total; null when this holding could not be converted. */
  allocationPercent: number | null;
  /** The entries do not replay (a sale beyond the units held); the figures above fall back to the opening put-in. */
  entriesBroken: boolean;
  accountId: string | null;
}

export interface InvestingModel {
  holdings: HoldingLine[];
  /** Home-currency minor units. */
  totals: { value: number; putIn: number; gain: number; gainPercentTenths: number | null };
  monthlyIn: number;
  /** Holdings left out of the totals because no stored rate converts them. */
  unconverted: number;
  anyStale: boolean;
}

export interface InvestingRead {
  status: InvestingStatus;
  model: InvestingModel;
  refetch: () => void;
  userId: string | null;
  householdId: string | null;
  today: string;
}

export const EMPTY_INVESTING_MODEL: InvestingModel = {
  holdings: [],
  totals: { value: 0, putIn: 0, gain: 0, gainPercentTenths: null },
  monthlyIn: 0,
  unconverted: 0,
  anyStale: false,
};

function entriesOf(h: HoldingRow, lots: readonly HoldingLotRow[]): LotEntry[] {
  const out: LotEntry[] = [];
  if (h.opening_put_in > 0) out.push({ kind: 'buy', amount: minorUnits(h.opening_put_in), units: null, localDate: '0000-01-01' });
  for (const l of lots) {
    if (l.kind === 'value') continue;
    out.push({ kind: l.kind, amount: minorUnits(l.amount), units: l.units, localDate: l.local_date, valueBefore: minorUnits(h.value) });
  }
  return out;
}

/** Pure: the model from the rows. `toHome` converts own-currency minor units to the home currency (null = cannot). */
export function buildInvestingModel(
  holdings: readonly HoldingRow[],
  lots: readonly HoldingLotRow[],
  toHome: ToHome,
  today: string
): InvestingModel {
  const lotsBy = new Map<string, HoldingLotRow[]>();
  for (const l of lots) {
    if (l.deleted_at !== null) continue;
    const list = lotsBy.get(l.holding_id);
    if (list) list.push(l);
    else lotsBy.set(l.holding_id, [l]);
  }

  const lines: HoldingLine[] = [];
  const forTotals: { value: MinorUnits; putIn: MinorUnits }[] = [];
  let monthlyIn = 0;
  let unconverted = 0;
  const homeValues = new Map<string, number>();

  for (const h of holdings) {
    if (h.deleted_at !== null) continue;
    const replay = replayLots(entriesOf(h, lotsBy.get(h.id) ?? []));
    const broken = !replay.ok;
    const position = replay.ok ? replay.position : null;
    const putIn = position === null ? h.opening_put_in : position.costBasis;
    const value = minorUnits(h.value);
    const gain = holdingGain(value, minorUnits(putIn));

    const homeValue = toHome(h.value, h.currency);
    const homePutIn = toHome(putIn, h.currency);
    if (homeValue === null || homePutIn === null) {
      unconverted += 1;
    } else {
      forTotals.push({ value: minorUnits(homeValue), putIn: minorUnits(homePutIn) });
      homeValues.set(h.id, homeValue);
      if (h.monthly_amount !== null) monthlyIn += toHome(h.monthly_amount, h.currency) ?? 0;
    }

    lines.push({
      id: h.id,
      name: h.name,
      type: h.type,
      currency: h.currency,
      value: h.value,
      putIn,
      gain,
      gainPercentTenths: gainPercentTenths(gain, minorUnits(putIn)),
      realisedGain: position === null ? 0 : position.realisedGain,
      dividends: position === null ? 0 : position.dividends,
      fees: position === null ? 0 : position.fees,
      asOf: h.value_as_of,
      stale: isValueStale(h.value_as_of, today),
      monthlyAmount: h.monthly_amount,
      allocationPercent: null,
      entriesBroken: broken,
      accountId: h.account_id,
    });
  }

  const sum = totalGain(forTotals);
  if (sum.value > 0) {
    for (const line of lines) {
      const home = homeValues.get(line.id);
      line.allocationPercent = home === undefined ? null : Number(divideHalfUp(BigInt(home) * 100n, BigInt(sum.value)));
    }
  }

  return {
    holdings: lines,
    totals: { value: sum.value, putIn: sum.putIn, gain: sum.gain, gainPercentTenths: gainPercentTenths(sum.gain, sum.putIn) },
    monthlyIn,
    unconverted,
    anyStale: lines.some((l) => l.stale),
  };
}

function toHomeOf(ctx: PastContext): ToHome {
  return (amount, currency) => {
    if (amount === 0 || currency === ctx.home) return amount;
    return convertLatest(amount, currency, ctx.home, ctx.rates, ctx.customs, ctx.today)?.amount ?? null;
  };
}

export function useInvestingRead(): InvestingRead {
  const { userId, householdId, today, ctx } = usePastContext();
  const holdingsQuery = useHoldingRows(userId ?? undefined, householdId ?? undefined);
  const lotsQuery = useHoldingLotRows(userId ?? undefined, householdId ?? undefined);
  const holdings = holdingsQuery.data;
  const lots = lotsQuery.data;

  const model = useMemo(
    () => (holdings === undefined ? EMPTY_INVESTING_MODEL : buildInvestingModel(holdings, lots ?? [], toHomeOf(ctx), today)),
    [holdings, lots, ctx, today]
  );
  const refetch = useCallback(() => {
    void holdingsQuery.refetch();
    void lotsQuery.refetch();
  }, [holdingsQuery, lotsQuery]);

  const status: InvestingStatus =
    holdingsQuery.isError || lotsQuery.isError ? 'error' : holdings !== undefined && lots !== undefined ? 'ready' : 'loading';
  return { status, model, refetch, userId, householdId, today };
}
