/**
 * Average-cost lot replay (D-24, GRW-05). Units are decimal text held as a bigint scaled by 10^8; never a float.
 * Dividends and fees are recorded but never move the cost basis.
 */
import { divideHalfUp } from '../money/rounding';
import { type MinorUnits } from '../money/types';
import { minorFromBigInt } from '../payoff/types';

export type LotKind = 'buy' | 'sell' | 'dividend' | 'fee';

export interface LotEntry {
  kind: LotKind;
  amount: MinorUnits;
  units: string | null;
  localDate: string;
  /** Holding value just before a sale; used for a sale with no units (simple holding). */
  valueBefore?: MinorUnits | null;
}

export interface Position {
  costBasis: MinorUnits;
  unitsScaled: bigint;
  realisedGain: MinorUnits;
  dividends: MinorUnits;
  fees: MinorUnits;
}

const UNITS_PATTERN = /^(\d{1,12})(?:\.(\d{1,8}))?$/;
const UNIT_SCALE_DIGITS = 8;

function parseUnits(text: string): bigint | null {
  const match = UNITS_PATTERN.exec(text);
  if (!match) {
    return null;
  }
  return BigInt(match[1]! + (match[2] ?? '').padEnd(UNIT_SCALE_DIGITS, '0'));
}

/** Same-day order (P2-WR-06): buys first, then dividends and fees, then sells, so a same-day buy and sell never fails on order. */
const KIND_ORDER: Readonly<Record<LotKind, number>> = { buy: 0, dividend: 1, fee: 1, sell: 2 };

/**
 * Replays the entries by date (same day: KIND_ORDER, then as given). A negative amount is refused (RangeError, P2-IN-02): the
 * database stores amounts of 0 or more, so one here is a caller's bug.
 */
export function replayLots(
  entries: readonly LotEntry[],
): { ok: true; position: Position } | { ok: false; error: 'sell-exceeds-units' | 'bad-units' } {
  for (const entry of entries) {
    if (entry.amount < 0) throw new RangeError(`replayLots: amount ${entry.amount} must be 0 or more`);
  }
  const ordered = [...entries].sort((a, b) =>
    a.localDate < b.localDate ? -1 : a.localDate > b.localDate ? 1 : KIND_ORDER[a.kind] - KIND_ORDER[b.kind],
  );
  let basis = 0n;
  let units = 0n;
  let realised = 0n;
  let dividends = 0n;
  let fees = 0n;
  for (const entry of ordered) {
    const amount = BigInt(entry.amount);
    let entryUnits = 0n;
    if (entry.units !== null) {
      const parsed = parseUnits(entry.units);
      if (parsed === null) {
        return { ok: false, error: 'bad-units' };
      }
      entryUnits = parsed;
    }
    if (entry.kind === 'buy') {
      basis += amount;
      units += entryUnits;
    } else if (entry.kind === 'sell') {
      let removed: bigint;
      // P2-WR-07: a sale with no units still sells units of a holding that has them, in the same proportion as the cost it takes out.
      let unitsOut: bigint;
      if (entry.units !== null) {
        if (entryUnits > units) {
          return { ok: false, error: 'sell-exceeds-units' };
        }
        removed = entryUnits === units ? basis : divideHalfUp(basis * entryUnits, units);
        unitsOut = entryUnits;
      } else if (entry.valueBefore != null && entry.valueBefore > 0) {
        const before = BigInt(entry.valueBefore);
        removed = divideHalfUp(basis * amount, before);
        unitsOut = amount >= before ? units : divideHalfUp(units * amount, before);
      } else {
        removed = amount;
        unitsOut = amount >= basis ? units : divideHalfUp(units * amount, basis);
      }
      if (removed > basis) {
        removed = basis;
      }
      units -= unitsOut;
      basis -= removed;
      realised += amount - removed;
    } else if (entry.kind === 'dividend') {
      dividends += amount;
    } else {
      fees += amount;
    }
  }
  return {
    ok: true,
    position: {
      costBasis: minorFromBigInt(basis, 'replayLots'),
      unitsScaled: units,
      realisedGain: minorFromBigInt(realised, 'replayLots'),
      dividends: minorFromBigInt(dividends, 'replayLots'),
      fees: minorFromBigInt(fees, 'replayLots'),
    },
  };
}
