import type { MinorUnits } from '../money/types';
import type { LocalDate, YearMonth } from '../decide/v3/types';

export interface CountsLine {
  readonly id: string;
  /** Signed minor units in the viewer's home currency; for a shared line, already the viewer's stored share. */
  readonly amount: MinorUnits;
  readonly isShared: boolean;
  /** true when the viewer created the line or it is the viewer's own copy. */
  readonly isMine: boolean;
  /** Same field name as Phase 8 plan 08-30 (TotalsInput, MonthFigureRow). */
  readonly isSettlement?: boolean;
  /** A partner's personal money counts only with that partner's opt-in; absent = off. */
  readonly partnerOptIn?: boolean;
}

export interface MonthBar {
  readonly month: YearMonth;
  readonly comesIn: MinorUnits;
  readonly goesOut: MinorUnits;
  readonly left: MinorUnits;
}

export interface MonthPicture {
  readonly asOf: LocalDate;
  readonly balanceOn: MinorUnits;
  readonly afterBillsBeforePayday: MinorUnits;
  /** "left after the month's plans": the one figure Home's small line and Decide's lead both show (D-04, D-05, D-19). */
  readonly leftAfterPlans: MinorUnits;
  readonly unusedOverdraft: MinorUnits;
  readonly payday: LocalDate | null;
  readonly usual: { readonly comesIn: MinorUnits; readonly goesOut: MinorUnits; readonly left: MinorUnits } | null;
  readonly low: {
    readonly month: YearMonth;
    readonly comesIn: MinorUnits;
    readonly goesOut: MinorUnits;
    readonly left: MinorUnits;
  } | null;
}
