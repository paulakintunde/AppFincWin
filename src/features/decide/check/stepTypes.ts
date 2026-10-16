import type { MoneyFormatter } from '@/ui/money/useMoneyFormatter';
import type { CheckComputation, CheckInputs, SnapshotResult, StackSelection } from '../snapshot/types';
export type StepNumber = 1 | 2 | 3 | 4 | 5;
export interface StepProps {
  inputs: CheckInputs;
  update: (patch: Partial<CheckInputs>) => void;   // autosaved by the flow shell (05-24)
  computation: CheckComputation;
  source: SnapshotResult;
  goToStep: (step: StepNumber) => void;
  whole: MoneyFormatter;   // whole currency units (UI-SPEC assumption 12)
  exact: MoneyFormatter;   // exact minor units (month table, "What gets written")
  today: string;           // 'YYYY-MM-DD'
  readOnly: boolean;       // true for a decided (bought/waiting/passed) check
  stack: StackSelection;   // D-24 (part 2): other open checks and the left-out counts (05-12 selectOtherChecks; EMPTY_STACK when the toggle is off)
}
