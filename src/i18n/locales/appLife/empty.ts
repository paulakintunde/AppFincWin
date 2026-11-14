/**
 * 06.2-04: empty screens, one icon, one sentence, one button. Owner plan: 18 (plan 16 reads empty.accounts).
 * Board sources: L05 (Activity) and L06 (the rest). D-24: Activity has one button; the board's second button
 * "Import a statement" is not built, the sentence already points to import.
 */
export const empty = {
  activity: {
    heading: 'Nothing in {{month}} yet.',
    body: 'Add the first one, or bring in a month from your bank statement.',
    action: 'Add a transaction',
  },
  comingUp: {
    heading: 'Nothing outstanding in {{month}}.',
    body: 'Bills you add as monthly show here before they are due.',
    action: 'Add a bill',
  },
  search: {
    heading: 'Nothing matches.',
    body: 'Try a different search, or set the filter back to All.',
    action: 'Clear search',
  },
  offline: {
    heading: 'You’re offline.',
    body: 'This month hasn’t loaded on this phone yet. It loads when you’re back online.',
    action: 'Try again',
  },
  accounts: {
    heading: 'No accounts yet.',
    body: 'Add the account your pay goes into first. You can add more later.',
    action: 'Add an account',
  },
  history: {
    heading: 'No changes yet.',
    body: 'Changes you make show here, and each one can be undone.',
  },
} as const;
