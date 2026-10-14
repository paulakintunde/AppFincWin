// D-11: quick-menu entries and their order. Pure: no React or I/O import.
// The same entries are exposed as named screen-reader actions; each appears only once its
// feature registers a handler (the D-02 availability idea).

export const QUICK_ACTION_ORDER = ['addExpense', 'addIncome', 'transfer', 'newCheck', 'importStatement'] as const;

export type QuickActionId = (typeof QUICK_ACTION_ORDER)[number];

export function availableQuickActions(registered: ReadonlySet<QuickActionId> | readonly QuickActionId[]): QuickActionId[] {
  const has = (id: QuickActionId): boolean =>
    Array.isArray(registered) ? (registered as readonly QuickActionId[]).includes(id) : (registered as ReadonlySet<QuickActionId>).has(id);
  return QUICK_ACTION_ORDER.filter(has);
}
