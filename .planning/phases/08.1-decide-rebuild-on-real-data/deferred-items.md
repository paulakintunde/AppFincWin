# 08.1 deferred items (found during execution, out of scope)

| Found in | Item |
|---|---|
| 08.1-23 | `src/data/queries/__tests__/recordQueries.test.tsx` "useRecurringSeries selects from recurring_series filtered by household_id" fails: the hook's rows now carry `amount_kind: 'exact'` (52f878dd, 08.1-02) and the test still expects `{ id }` only. Not touched by plan 23. |
