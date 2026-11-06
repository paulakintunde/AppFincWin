/** Thresholds restated from the right-answer table's rule statements. Not copied from engine constants (QA-03). */
export const TIGHT_SHARE_BP = 8000; // 80%: spending more than this share of the month's money is tight
export const FLOOR_DIVISOR = 10; // a tenth of a month's spending is the floor to keep
export const EXPENSIVE_APR_BP = 2000; // 20% a year
export const EXPENSIVE_INTEREST_BP = 1000; // 10% of the amount borrowed
export const PAY_GAP_LINE_BP = 500; // FIN-15 (QE-06): "over the 5% line, so the gap is named"
