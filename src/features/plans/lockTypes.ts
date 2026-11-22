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

export type LockVariant = 'locked' | 'sample';
