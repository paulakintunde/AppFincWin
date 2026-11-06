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
  putIn: MinorUnits;
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

export function replayLots(
  entries: readonly LotEntry[],
): { ok: true; position: Position } | { ok: false; error: 'sell-exceeds-units' | 'bad-units' } {
  const ordered = [...entries].sort((a, b) => (a.localDate < b.localDate ? -1 : a.localDate > b.localDate ? 1 : 0));
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
      if (entry.units !== null) {
        if (entryUnits > units) {
          return { ok: false, error: 'sell-exceeds-units' };
        }
        removed = entryUnits === units ? basis : divideHalfUp(basis * entryUnits, units);
        units -= entryUnits;
      } else if (entry.valueBefore != null && entry.valueBefore > 0) {
        removed = divideHalfUp(basis * amount, BigInt(entry.valueBefore));
      } else {
        removed = amount;
      }
      if (removed > basis) {
        removed = basis;
      }
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
      putIn: minorFromBigInt(basis, 'replayLots'),
    },
  };
}
