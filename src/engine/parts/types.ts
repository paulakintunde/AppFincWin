// 10.1-04 (D-01, D-02): the shapes of a line's category parts. Amounts are signed integer minor units.
export interface Part {
  readonly categoryId: string | null;
  readonly amount: number; // same sign as the line
  readonly label?: 'taxTip' | null;
}

export interface LinePartsInput {
  readonly id: string;
  readonly amount: number;
  readonly categoryId: string | null;
  readonly parts: readonly Part[] | null;
}

export interface CategoryAmount {
  readonly lineId: string;
  readonly categoryId: string | null;
  readonly amount: number;
  readonly isGap: boolean;
  readonly label: 'taxTip' | null;
}

export type PartsInvalidReason =
  | 'too_few'
  | 'too_many'
  | 'zero_part'
  | 'mixed_sign'
  | 'not_integer'
  | 'over_total'
  | 'not_total';

// amount is a positive magnitude
export type Balance =
  | { readonly state: 'addsUp'; readonly amount: 0 }
  | { readonly state: 'left' | 'over'; readonly amount: number };
