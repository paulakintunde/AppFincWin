// 05-126 (D-103): my housing cost as a share of the money-in basis, for the housing editor's info line. Bigint maths,
// half-up, the same grammar as the other percent labels; the caller guards incomeBasis > 0.
import { ONE_HUNDRED_PERCENT, percentFromScaled } from '@/engine/payoff';
import { percentLabel } from '../copy/percentText';

export function housingShareLabel(monthly: number, incomeBasis: number): string {
  const num = BigInt(monthly) * ONE_HUNDRED_PERCENT;
  const den = BigInt(incomeBasis);
  return percentLabel(percentFromScaled((2n * num + den) / (2n * den)));
}
