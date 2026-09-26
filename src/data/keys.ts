// The complete Phase 1 query/mutation key registry. Every read hook (src/data/queries/)
// and every mutation (plan 01-12) builds its TanStack Query key from here, so a key never
// drifts between where it is set and where it is invalidated.

export const queryKeys = {
  household: (userId: string) => ['household', userId] as const,
  accounts: (householdId: string) => ['accounts', householdId] as const,
  transactionsRoot: (householdId: string) => ['transactions', householdId] as const,
  transactionsMonth: (householdId: string, month: string) => ['transactions', householdId, month] as const,
  currencies: () => ['currencies'] as const,
  customCurrencies: (userId: string) => ['custom-currencies', userId] as const,
  fxLatest: () => ['fx-latest'] as const,
  moneyPrefs: (userId: string) => ['money-prefs', userId] as const,
  // The signed-in user's own profiles row (identity, theme, analytics consent) -- one shared
  // cache entry, so the (app) layout's consent gate and every screen read the same copy.
  profile: (userId: string) => ['profile', userId] as const,
};

export const mutationKeys = {
  addTransaction: ['transactions', 'add'] as const,
  editTransaction: ['transactions', 'edit'] as const,
  addAccount: ['accounts', 'add'] as const,
  editAccount: ['accounts', 'edit'] as const,
  addCustomCurrency: ['custom-currencies', 'add'] as const,
  editCustomCurrency: ['custom-currencies', 'edit'] as const,
  updateMoneyPrefs: ['money-prefs', 'update'] as const,
};

// D-20: one scope means every paused write replays serially in the order it was queued --
// plan 01-12's setMutationDefaults registrations all share this scope so the write queue
// never reorders a household's mutations relative to each other.
export const WRITE_SCOPE = { id: 'fincwin-writes' } as const;
