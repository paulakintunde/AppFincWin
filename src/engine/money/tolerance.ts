// One amount tolerance for recurring bills (05.5-10): a line is within 10% of a bill when |a - m| * 10 <= |m|, so no division.
// Shared by the bill detector (recurring/detect) and the paid-line matcher (month/model/settle). FincWin choice.
export const AMOUNT_TOLERANCE_DIVISOR = 10;
