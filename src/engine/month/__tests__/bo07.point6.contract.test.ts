// BO-07 point 6 (household scope) contract todos. Owner: Phase 8 plan 08-25.
// Phase 8 turns these on in its own file src/engine/household/__tests__/bo07.point6.contract.test.ts using the same titles.
// Switching a todo on keeps the exact title. The frozen list lives in src/test/contracts/contractManifest.test.ts.

describe('BO-07 point 6: household scope (turned on by Phase 8, plan 08-25)', () => {
  test.todo('a record is personal unless shared');
  test.todo('my share of a shared line is its stored split, never recomputed from current weights');
  test.todo("a partner's money counts only with that partner's opt-in (off by default)");
  test.todo("a partner's personal line never reaches my figures");
});
