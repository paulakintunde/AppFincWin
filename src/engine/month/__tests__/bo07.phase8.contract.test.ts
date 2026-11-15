// BO-07 Phase 8 contract todos. Owners: 08-30 (settlements), 08.1 (income profile), 08-25 (visibility).
// Switching a todo on keeps the exact title. The frozen list lives in src/test/contracts/contractManifest.test.ts.

describe('BO-07 Phase 8 contracts (settlements, income profile, visibility)', () => {
  test.todo('settlements count as neither spending nor income in Activity totals');
  test.todo('settlements count as neither spending nor income in the month picture');
  test.todo("one income profile per member; a partner's pay never overwrites mine");
  test.todo('database rules gate reading; countsForMe gates counting; no screen adds its own filter');
});
