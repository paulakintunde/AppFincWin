# Deferred items (05.4)

- 05.4-03: `src/db/__tests__/columns05_2.test.ts` (decide_settings) fails: SQL grants list `custom_options` (migration 20261031001000, plan 05.4-02) but the `decide_settings` patch keys in `src/db` do not. Not caused by the engine harvest (no src/db file changed). Needs `custom_options` added to the patch keys when the plan that reads/writes custom options lands.
