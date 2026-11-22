/**
 * Health score (INS-06; D-01, D-03, D-05, D-20; ARC-21). Pure integer maths: BigInt inside, integers out.
 * Rounding rule: each part rounded half-up once; score = sum of rounded parts, clamped 0..100; short months
 * capped at 74. This can differ from the prototype's single end rounding by up to 2 points (07-RESEARCH A5).
 * Imports only money helpers; every input arrives through healthInputsOf (inputs.ts).
 */
import { divideHalfUp } from '../money/rounding';
import type { HealthInputs, HealthPart, HealthScore } from './types';

export const HEALTH_SHORT_CAP = 74;

const big = (n: number): bigint => BigInt(n);
const min = (a: bigint, b: bigint): bigint => (a < b ? a : b);
const pos = (a: bigint): bigint => (a > 0n ? a : 0n);

export function healthScore(i: HealthInputs): HealthScore {
  if (i.moneyIn <= 0) return { kind: 'thin', missing: 'income' };
  if (i.moneyOut <= 0) return { kind: 'thin', missing: 'spending' };
  if (!i.hasBalance) return { kind: 'thin', missing: 'balance' };

  const moneyIn = big(i.moneyIn);
  const moneyOut = big(i.moneyOut);

  // Kept (max 35): left after planned bills and saving, 30% of money in or more is full marks.
  const posLeft = pos(big(i.left));
  const keptPoints = divideHalfUp(35n * min(10n * posLeft, 3n * moneyIn), 3n * moneyIn);
  const keptPercent = divideHalfUp(100n * posLeft, moneyIn);

  // Cover (max 30): savings over one month of essential costs, 3 months or more is full marks.
  const e = pos(i.emergency === null ? 0n : big(i.emergency));
  const month = i.monthlyEssential > 0 ? big(i.monthlyEssential) : moneyOut;
  const coverPoints = divideHalfUp(30n * min(e, 3n * month), 3n * month);
  const coverTenths = divideHalfUp(10n * e, month);

  // Debt (max 20): debt over a year's income, 60% or more scores nothing.
  const base = i.typicalIncome > 0 ? big(i.typicalIncome) : moneyIn;
  const yearly = 12n * base;
  const d = pos(big(i.debtTotal));
  const debtPoints = divideHalfUp(20n * (3n * yearly - min(5n * d, 3n * yearly)), 3n * yearly);
  const debtPercent = divideHalfUp(100n * d, yearly);

  // Bills still to pay this month (max 15, D-20): Decide's billsDue over moneyOut.
  const bills = pos(big(i.billsDue));
  const billsPoints = divideHalfUp(15n * (3n * moneyOut - min(5n * bills, 3n * moneyOut)), 3n * moneyOut);
  const billsPercent = divideHalfUp(100n * bills, moneyOut);

  const parts: HealthPart[] = [
    { id: 'kept', points: Number(keptPoints), max: 35, figure: Number(keptPercent) },
    { id: 'cover', points: Number(coverPoints), max: 30, figure: Number(coverTenths) },
    { id: 'debt', points: Number(debtPoints), max: 20, figure: Number(debtPercent) },
    { id: 'billsToPay', points: Number(billsPoints), max: 15, figure: Number(billsPercent) },
  ];
  const sum = parts.reduce((s, p) => s + p.points, 0);
  const capped = i.short && sum > HEALTH_SHORT_CAP;
  return { kind: 'score', score: capped ? HEALTH_SHORT_CAP : sum, parts, capped, short: i.short };
}
