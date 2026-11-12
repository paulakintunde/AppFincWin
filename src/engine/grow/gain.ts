/** Gain or loss per holding and in total (GRW-06). Signed minor units; numbers only, no wording. */
import { divideHalfUp } from '../money/rounding';
import { minorUnits, type MinorUnits } from '../money/types';
import { minorFromBigInt } from '../payoff/types';

export function holdingGain(value: MinorUnits, putIn: MinorUnits): MinorUnits {
  return minorUnits(value - putIn);
}

export function totalGain(rows: readonly { value: MinorUnits; putIn: MinorUnits }[]): {
  value: MinorUnits;
  putIn: MinorUnits;
  gain: MinorUnits;
} {
  let value = 0n;
  let putIn = 0n;
  for (const r of rows) {
    value += BigInt(r.value);
    putIn += BigInt(r.putIn);
  }
  return {
    value: minorFromBigInt(value, 'totalGain'),
    putIn: minorFromBigInt(putIn, 'totalGain'),
    gain: minorFromBigInt(value - putIn, 'totalGain'),
  };
}

/** Gain as tenths of a percent (112 = 11.2%), half-up; null when nothing was put in. */
export function gainPercentTenths(gain: MinorUnits, putIn: MinorUnits): number | null {
  if (putIn <= 0) {
    return null;
  }
  return Number(divideHalfUp(BigInt(gain) * 1000n, BigInt(putIn)));
}
