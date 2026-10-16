/** Position layer (D-41, D-45, D-53): RED stub, implemented in the next commit. */
import type { MinorUnits } from '../money/types';
import type {
  AssessContext,
  FutureChange,
  Position,
  PurchaseCheck,
  StackedCheck,
  StackedCheckInput,
} from './types';

export function stackCheck(
  _context: AssessContext,
  _input: StackedCheckInput,
  _index: number
): { readonly context: AssessContext; readonly stacked: StackedCheck } {
  throw new Error('not implemented');
}

export function applyChanges(
  _context: AssessContext,
  _changes: readonly FutureChange[],
  _stacked: readonly StackedCheck[],
  _expectedIncomeIncluded: boolean
): AssessContext {
  throw new Error('not implemented');
}

export function positionContext(
  _base: AssessContext,
  _check: PurchaseCheck,
  _otherChecks: readonly StackedCheckInput[],
  _options: { readonly includeExpectedIncome?: boolean } = {}
): Position {
  throw new Error('not implemented');
}

export type { MinorUnits };
