// The complete Phase 1 + Phase 2 query/mutation key registry. Every read hook
// (src/data/queries/) and every mutation builds its TanStack Query key from here, so a key
// never drifts between where it is set and where it is invalidated.

export const queryKeys = {
  household: (userId: string) => ['household', userId] as const,
  accounts: (householdId: string) => ['accounts', householdId] as const,
  transactionsRoot: (householdId: string) => ['transactions', householdId] as const,
  transactionsMonth: (householdId: string, month: string) => ['transactions', householdId, month] as const,
  customCurrencies: (userId: string) => ['custom-currencies', userId] as const,
  fxLatest: () => ['fx-latest'] as const,
  moneyPrefs: (userId: string) => ['money-prefs', userId] as const,
  // The signed-in user's own profiles row (identity, theme, analytics consent) -- one shared
  // cache entry, so the (app) layout's consent gate and every screen read the same copy.
  profile: (userId: string) => ['profile', userId] as const,
  // Phase 2 (Record)
  categories: (userId: string) => ['categories', userId] as const,
  recurringSeries: (householdId: string) => ['recurring-series', householdId] as const,
  undoLog: (userId: string) => ['undo-log', userId] as const,
  transactionsSearch: (householdId: string, term: string) => ['transactions', householdId, 'search', term] as const,
  // C-WR-04: every search term at once, for invalidation after a write.
  transactionsSearchRoot: (householdId: string) => ['transactions', householdId, 'search'] as const,
  // Both nested under transactionsRoot's ['transactions', householdId] prefix so any
  // transaction invalidation refreshes them too.
  transactionMonths: (householdId: string) => ['transactions', householdId, 'months'] as const,
  accountBalances: (householdId: string) => ['transactions', householdId, 'balances'] as const,
  householdMembers: (householdId: string) => ['household-members', householdId] as const,
  // transferIds: sorted ids joined with ',' -- also nested under transactionsRoot.
  transferLegs: (householdId: string, transferIds: string) =>
    ['transactions', householdId, 'transfer-legs', transferIds] as const,
  // W6-13 IN-01: under transactionsRoot so merges, imports, bulk deletes and undo invalidate it.
  categoryUsage: (householdId: string, categoryId: string) =>
    ['transactions', householdId, 'category-usage', categoryId] as const,
  importProfile: (userId: string, accountId: string, signature: string) =>
    ['import-profiles', userId, accountId, signature] as const,
};

export const mutationKeys = {
  addTransaction: ['transactions', 'add'] as const,
  editTransaction: ['transactions', 'edit'] as const,
  addAccount: ['accounts', 'add'] as const,
  editAccount: ['accounts', 'edit'] as const,
  addCustomCurrency: ['custom-currencies', 'add'] as const,
  editCustomCurrency: ['custom-currencies', 'edit'] as const,
  updateMoneyPrefs: ['money-prefs', 'update'] as const,
  // Phase 2 (Record)
  addCategory: ['categories', 'add'] as const,
  editCategory: ['categories', 'edit'] as const,
  mergeCategory: ['categories', 'merge'] as const,
  bulkPatch: ['patches', 'apply'] as const,
  createSeries: ['recurring-series', 'create'] as const,
  editSeriesFrom: ['recurring-series', 'edit-from'] as const,
  endSeries: ['recurring-series', 'end'] as const,
  recordUndoStep: ['undo', 'record'] as const,
  undoStep: ['undo', 'apply'] as const,
  rollbackUndo: ['undo', 'rollback'] as const,
  importChunk: ['transactions', 'import-chunk'] as const,
  importFinalize: ['transactions', 'import-finalize'] as const,
  addTransfer: ['transfers', 'add'] as const,
  editTransfer: ['transfers', 'edit'] as const,
  deleteTransfer: ['transfers', 'delete'] as const,
  saveImportProfile: ['import-profiles', 'save'] as const,
};

// D-20: one scope means every paused write replays serially in the order it was queued --
// plan 01-12's setMutationDefaults registrations all share this scope so the write queue
// never reorders a household's mutations relative to each other.
export const WRITE_SCOPE = { id: 'fincwin-writes' } as const;
