// 09-16: the write actions a lock can name in its sheet (TIER-09). Each maps to plans.paywall.lockActions.<id>.
export type LockActionId =
  | 'addTransaction'
  | 'importStatement'
  | 'newDecideCheck'
  | 'editRecord'
  | 'settleUp'
  | 'invite'
  | 'addAccount'
  | 'addGoal'
  | 'addDebt'
  | 'addHolding';

// 10-24 (D-14): 'archived' = a write inside an archived month; the restore sheet explains it (archivedMonthGate.tsx).
export type LockVariant = 'locked' | 'sample' | 'archived';
