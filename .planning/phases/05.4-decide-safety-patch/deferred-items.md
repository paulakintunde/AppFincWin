# Deferred items (05.4)

- 05.4-03: `src/db/__tests__/columns05_2.test.ts` (decide_settings) fails: SQL grants list `custom_options` (migration 20261031001000, plan 05.4-02) but the `decide_settings` patch keys in `src/db` do not. Not caused by the engine harvest (no src/db file changed). Needs `custom_options` added to the patch keys when the plan that reads/writes custom options lands.
  RESOLVED in 05.4-04: `src/db/decideSettings.ts` harvested from the parked branch (adds `custom_options`); `npx jest src/db` passes. `src/db/decideOutcomes.ts` (client use of the 4-arg record_decide_outcome overload, migration 20261031000100) was NOT harvested: main's client still works with the 3-key call. Left for 05.4-06.

- 05.4-06: RESOLVED `src/db/decideOutcomes.ts` (4-arg record_decide_outcome overload) harvested with its test.
