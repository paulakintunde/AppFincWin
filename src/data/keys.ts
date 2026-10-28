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
  // D-32: fee lines linked to a statement purchase; under transactionsRoot so invalidations refresh it.
  linkedFees: (householdId: string, transactionId: string) =>
    ['transactions', householdId, 'linked-fees', transactionId] as const,
  // W6-13 IN-01: under transactionsRoot so merges, imports, bulk deletes and undo invalidate it.
  categoryUsage: (householdId: string, categoryId: string) =>
    ['transactions', householdId, 'category-usage', categoryId] as const,
  importProfile: (userId: string, accountId: string, signature: string) =>
    ['import-profiles', userId, accountId, signature] as const,
  // Phase 02.2 (Record polish)
  recordPrefs: (userId: string) => ['record-prefs', userId] as const,
  householdHorizon: (householdId: string) => ['household-horizon', householdId] as const,
  dismissedOffers: (userId: string) => ['dismissed-offers', userId] as const,
  // The next four sit under transactionsRoot so transaction writes invalidate them.
  sampleExists: (householdId: string) => ['transactions', householdId, 'sample-exists'] as const,
  pendingSplit: (householdId: string) => ['transactions', householdId, 'pending-split'] as const,
  paidBefore: (householdId: string, before: string) => ['transactions', householdId, 'paid-before', before] as const,
  offerHistory: (householdId: string, from: string, to: string) =>
    ['transactions', householdId, 'offer-history', from, to] as const,
  // Phase 02.3 (Record follow-ups)
  categoryRules: (userId: string, householdId: string) => ['category-rules', userId, householdId] as const,
  // Under transactionsRoot so any transaction write refreshes the learned map (D-07).
  categorisedNames: (householdId: string, userId: string) =>
    ['transactions', householdId, 'categorised-names', userId] as const,
  // Phase 5 (Decide)
  // Row-derived: nested under transactionsRoot so every transaction write refreshes the verdict (D-15).
  decideHistory: (householdId: string, from: string, to: string) =>
    ['transactions', householdId, 'decide-history', from, to] as const,
  decideUpcoming: (householdId: string, from: string) =>
    ['transactions', householdId, 'decide-upcoming', from] as const, // rows dated after the history window (pending one-offs, 05-06)
  decideLinkedLines: (householdId: string, checkId: string) =>
    ['transactions', householdId, 'decide-linked', checkId] as const,
  statementPeriods: (householdId: string) => ['transactions', householdId, 'statement-periods'] as const,
  decideAttachCandidates: (householdId: string, from: string, to: string) =>
    ['transactions', householdId, 'decide-attach', from, to] as const,
  // Own keys (not row-derived).
  decideChecks: (userId: string, householdId: string) => ['decide-checks', userId, householdId] as const,
  decideSettings: (userId: string) => ['decide-settings', userId] as const,
  debts: (householdId: string) => ['debts', householdId] as const,
  decideLinks: (userId: string, householdId: string) => ['decide-links', userId, householdId] as const,
  // Part 2 (05-12): depth reads.
  decideChanges: (userId: string, householdId: string) => ['decide-changes', userId, householdId] as const, // D-27
  savingsGoals: (userId: string, householdId: string) => ['savings-goals', userId, householdId] as const, // D-34
  decidePaymentLinks: (userId: string, householdId: string) =>
    ['decide-links', userId, householdId, 'payment'] as const, // 04 D-48 (prefix of decideLinks, so link writes refresh it)
  decideWrittenRowLinks: (userId: string, householdId: string) =>
    ['decide-links', userId, householdId, 'written-rows'] as const, // D-40 (same prefix, refreshed by link writes)
  goalLines: (householdId: string, goalIds: string) => ['transactions', householdId, 'goal-lines', goalIds] as const, // D-34: row-derived
  // 05.2 (Decide data and setup)
  decideAnswers: (userId: string, householdId: string) => ['decide-answers', userId, householdId] as const,
  recurringDismissals: (householdId: string) => ['recurring-dismissals', householdId] as const,
  incomePayerPrompts: (householdId: string) => ['income-payer-prompts', householdId] as const,
  // 05.2-33 (D-10): refund links across every month. Under transactionsRoot so any transaction write refreshes them.
  refundLinks: (householdId: string) => ['transactions', householdId, 'refund-links'] as const,
  refundPurchases: (householdId: string, ids: string) => ['transactions', householdId, 'refund-purchases', ids] as const,
  refundCandidates: (householdId: string, from: string, to: string) =>
    ['transactions', householdId, 'refund-candidates', from, to] as const,
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
  // Phase 02.2 (Record polish)
  cloneMonth: ['transactions', 'clone-month'] as const,
  pasteLines: ['transactions', 'paste-lines'] as const,
  markMonthly: ['recurring-series', 'mark-monthly'] as const,
  addMonth: ['household', 'add-month'] as const,
  deleteAccount: ['accounts', 'delete'] as const,
  dismissOffers: ['dismissed-offers', 'add'] as const,
  updateRecordPrefs: ['record-prefs', 'update'] as const,
  seedSamples: ['samples', 'seed'] as const,
  clearSamples: ['samples', 'clear'] as const,
  addRule: ['category-rules', 'add'] as const,
  editRule: ['category-rules', 'edit'] as const,
  bulkAdd: ['transactions', 'bulk-add'] as const,
  // Phase 5 (Decide)
  createCheck: ['decide-checks', 'create'] as const,
  saveCheckDraft: ['decide-checks', 'save-draft'] as const,
  editCheck: ['decide-checks', 'edit'] as const,
  decideGoAhead: ['decide-checks', 'go-ahead'] as const,
  decideOutcome: ['decide-checks', 'outcome'] as const,
  updateDecideSettings: ['decide-settings', 'update'] as const,
  saveCardRate: ['debts', 'save-card-rate'] as const,
  saveCardTerms: ['debts', 'save-card-terms'] as const, // D-40 (05-19 useSaveCardTerms)
  attachLine: ['decide-links', 'attach'] as const,
  editLink: ['decide-links', 'edit'] as const,
  recordStatementPeriod: ['statement-periods', 'add'] as const,
  // Part 2: D-27 change writes (05-40). Goal tagging uses Record's editTransaction key.
  addChange: ['decide-changes', 'add'] as const,
  editChange: ['decide-changes', 'edit'] as const,
  // 05-122 (D-101, D-103): pots (savings_goals) and the housing marker on a debt.
  addPot: ['savings-goals', 'add'] as const,
  editPot: ['savings-goals', 'edit'] as const,
  setDebtHousing: ['debts', 'set-housing'] as const,
  setDebtPaysInFull: ['debts', 'set-pays-in-full'] as const, // 05.2-15
  addDebt: ['debts', 'add'] as const, // 05.2-43
  editDebt: ['debts', 'edit'] as const, // 05.2-43
  setDebtPaidOff: ['debts', 'set-paid-off'] as const, // 05.2-43
  setSeriesStatus: ['recurring-series', 'status'] as const, // 05.2-44
  // 05.2 (Decide data and setup)
  updateDecideSetup: ['decide-setup', 'update'] as const, // settings forward write + undo (05.2-13)
  resetDecideSetup: ['decide-setup', 'reset'] as const, // 05.2-13
  saveAccountUses: ['account-use', 'save-many'] as const, // 05.2-14 "These look right" / account-use step
  saveAccountUse: ['account-use', 'save'] as const, // 05.2-14 one account (sheet + mixed placement)
  saveEmergencyFund: ['emergency-fund', 'save'] as const, // 05.2-14 D-04 batch
  confirmRegularCandidate: ['recurring-series', 'confirm-candidate'] as const, // 05.2-15
  patchSeriesAttributes: ['recurring-series', 'attributes'] as const, // 05.2-15
  addDismissal: ['recurring-dismissals', 'add'] as const, // 05.2-15
  removeDismissal: ['recurring-dismissals', 'remove'] as const, // 05.2-15
  tagIncome: ['income-tags', 'tag'] as const, // 05.2-16 (one batch incl. payer rule)
  linkRefund: ['refund-links', 'link'] as const, // 05.2-16
  unlinkRefund: ['refund-links', 'unlink'] as const, // 05.2-16
  saveDecideAnswer: ['decide-answers', 'save'] as const, // 05.2-17
  removeDecideAnswer: ['decide-answers', 'remove'] as const, // 05.2-17
};

// D-20: one scope means every paused write replays serially in the order it was queued --
// plan 01-12's setMutationDefaults registrations all share this scope so the write queue
// never reorders a household's mutations relative to each other.
export const WRITE_SCOPE = { id: 'fincwin-writes' } as const;
