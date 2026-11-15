// 05.5-17 (D-18): the limits the shared pay and bill forms hold a figure to. One copy, so Decide's setup frame and Activity's screens
// accept and refuse the same amounts. The amount limit equals the old Decide input limit (10^12 minor units).
export const MAX_INPUT_MINOR = 1_000_000_000_000;
export const BILL_NAME_MAX = 40;
export const OTHER_INCOME_NAME_MAX = 40;

/** An amount the forms accept: a whole number of minor units above zero and within the limit. */
export const validAmount = (minor: number | null): minor is number => minor !== null && minor > 0 && minor <= MAX_INPUT_MINOR;
