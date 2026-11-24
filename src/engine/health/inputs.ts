/**
 * Health score inputs (INS-06, D-02, D-25, ARC-21): the only file in engine/health that reads Decide.
 * Reads Decide's reading only; months of cover reads funds.emergency (decide/v3/funds/emergency.ts), never a goal seed id.
 * Short = leftAfterPlans < 0 or a short notice (07-RESEARCH A4).
 */
import { homeReading, monthPicture } from '../month/picture';
import type { Prepared } from '../decide/v3/prepare';
import { minorFromBigInt } from '../payoff/types';
import type { HealthInputs } from './types';

const FN = 'health/inputs';
const SHORT_CODES = new Set<string>(['typical_short', 'month_heading_short']);

export function healthInputsOf(p: Pick<Prepared, 'inputs' | 'readings'>): HealthInputs {
  const r = homeReading(p);
  const pic = monthPicture(p);
  let debt = 0n;
  for (const d of r.inputs.debts) {
    if (d.balance > 0) debt += BigInt(d.balance);
  }
  return {
    moneyIn: r.month.moneyIn,
    left: pic.leftAfterPlans,
    emergency: r.funds.emergency,
    monthlyEssential: r.net.starter,
    debtTotal: minorFromBigInt(debt, FN),
    typicalIncome: r.month.typicalIncome,
    billsDue: r.month.billsDue,
    moneyOut: r.month.moneyOut,
    hasBalance: (r.inputs.accounts?.length ?? 0) > 0,
    short: pic.leftAfterPlans < 0 || r.month.notices.some((n) => SHORT_CODES.has(n.code)),
  };
}
