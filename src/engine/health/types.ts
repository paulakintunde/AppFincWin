import type { MinorUnits } from '../money/types';

/** Health score inputs (INS-06, ARC-21). Every figure comes from Decide's own reading through healthInputsOf. */
export interface HealthInputs {
  readonly moneyIn: MinorUnits;
  readonly left: MinorUnits;
  readonly emergency: MinorUnits | null;
  readonly monthlyEssential: MinorUnits;
  readonly debtTotal: MinorUnits;
  readonly typicalIncome: MinorUnits;
  readonly billsDue: MinorUnits;
  readonly moneyOut: MinorUnits;
  readonly hasBalance: boolean;
  readonly short: boolean;
}

export type HealthMissing = 'income' | 'spending' | 'balance';
export type HealthPartId = 'kept' | 'cover' | 'debt' | 'billsToPay';

export interface HealthPart {
  readonly id: HealthPartId;
  readonly points: number;
  readonly max: 35 | 30 | 20 | 15;
  /** kept = whole percent of money in kept; cover = tenths of a month; debt = whole percent of a year's income; billsToPay = whole percent of money out */
  readonly figure: number;
}

export type HealthScore =
  | { readonly kind: 'thin'; readonly missing: HealthMissing }
  | {
      readonly kind: 'score';
      readonly score: number;
      readonly parts: readonly HealthPart[];
      readonly capped: boolean;
      /** Points the short-month cap took off the parts' sum (0 when not capped), so the parts and the score reconcile. */
      readonly capReduction: number;
      readonly short: boolean;
    };
