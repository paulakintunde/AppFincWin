// 05.3-80 (UAT step 75 item 1): a card's paid-in-full history, derived from its account's records. Month ends stand in
// for statement dates; a month counts as paid in full when nothing was owed at its end, or when the payments into the
// card in the next PAYMENT_WINDOW_MONTHS months cover what was owed.
import type { MinorUnits } from '../../../money/types';
import { minorFromBigInt } from '../../../payoff/types';
import { addYearMonths, daysInYearMonth, yearMonthOf } from '../dates';
import type { LocalDate, YearMonth } from '../types';

export interface CardLedgerInput {
  readonly asOf: LocalDate;
  /** The card account's paid balance today in its own currency. Negative = owed. */
  readonly balanceNow: MinorUnits;
  /** The card account's paid lines in its own currency, any order. Spending negative; payments and refunds positive. Must hold every paid line dated after fromMonth's first day. */
  readonly lines: readonly { readonly date: LocalDate; readonly amount: MinorUnits }[];
  /** The first month whose end can be walked back to (the first month the lines fully cover). */
  readonly fromMonth: YearMonth;
}

const PAYMENT_WINDOW_MONTHS = 2;

const lastDayOf = (ym: YearMonth): LocalDate => `${ym}-${String(daysInYearMonth(ym)).padStart(2, '0')}`;

export function cardPaidInFullHistory(input: CardLedgerInput): readonly boolean[] {
  const last = addYearMonths(yearMonthOf(input.asOf), -(PAYMENT_WINDOW_MONTHS + 1));
  const out: boolean[] = [];
  for (let m: YearMonth = input.fromMonth; m <= last; m = addYearMonths(m, 1)) {
    const end = lastDayOf(m);
    const windowEnd = lastDayOf(addYearMonths(m, PAYMENT_WINDOW_MONTHS));
    let after = 0n;
    let paid = 0n;
    for (const l of input.lines) {
      if (l.date <= end) continue;
      after += BigInt(l.amount);
      if (l.amount > 0 && l.date <= windowEnd) paid += BigInt(l.amount);
    }
    const balanceAtEnd = BigInt(input.balanceNow) - after;
    minorFromBigInt(balanceAtEnd, 'cardPaidInFullHistory');
    const owed = balanceAtEnd < 0n ? -balanceAtEnd : 0n;
    out.push(owed === 0n || paid >= owed);
  }
  return out;
}
