// D-33: has the user changed an existing entry's form since it opened?
import { isStructurallyEqual } from '@/ui/useIsDirty';
import type { FormState } from './transactionForm';

/** statusTouched is bookkeeping, not an edit, so it is ignored. */
export function isFormDirty(current: FormState, initial: FormState): boolean {
  return !isStructurallyEqual({ ...current, statusTouched: false }, { ...initial, statusTouched: false });
}
