const fs = require('fs');
const path = require('path');

// Deviation (Rule 3 - blocking): expo's winter runtime installs `global.fetch` as a lazy
// getter backed by a native-module lookup (expo/src/winter/runtime.native.ts). Something in
// the Jest+jest-expo 57.0.5 bootstrap (independent of this project's own setup) eagerly reads
// that getter, which then hits an upstream jest-expo bug in its native-module auto-mocker
// (`attemptLookup` in jest-expo/src/preset/setup.js walks up from a stack-trace-derived file
// path looking for the nearest package.json; for ExpoFetchModule this walk never finds one and
// returns null, and `path.join(null, ...)` then throws) — reproduces even with an empty
// jest.setup.ts, so it is not specific to any mock this plan adds. Opting into React Native's
// own fetch polyfill instead of expo's custom one for the test environment only (this has no
// effect on the shipped app) avoids the broken code path entirely.
process.env.EXPO_PUBLIC_USE_RN_FETCH = '1';

// D-21: engine/ branch-coverage thresholds are per-directory, but jest errors if a
// threshold path matches no files. Only add a threshold for a folder once it has real
// source, so the 100% folders (money/decide/payoff/split, Phase 2's
// recurring/csv/categorize/undo/activity, and the statement-import extension
// folders ofx/statement/transfer/accounts) can arrive in later phases without
// anyone needing to remember to edit this config. The import extension folders
// are 100% too: a wrong sign, balance or transfer pair moves real money the
// wrong way.
const isSource = (f) => /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f) && !/\.d\.ts$/.test(f);
function hasSource(dir) {
  if (!fs.existsSync(dir)) return false;
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .some((e) =>
      e.isDirectory() ? e.name !== '__tests__' && hasSource(path.join(dir, e.name)) : isSource(e.name)
    );
}

const FULL = { branches: 100, functions: 100, lines: 100, statements: 100 };
const REST = { branches: 95, functions: 95, lines: 95, statements: 95 };

const coverageThreshold = {};
if (hasSource('src/engine')) coverageThreshold['./src/engine/'] = REST; // D-21: 95% on the rest of engine/
for (const f of ['money', 'decide', 'payoff', 'split', 'recurring', 'csv', 'categorize', 'undo', 'activity', 'ofx', 'statement', 'transfer', 'accounts']) {
  // D-21: 100% folders
  if (hasSource(`src/engine/${f}`)) coverageThreshold[`./src/engine/${f}/`] = FULL;
}

module.exports = {
  preset: 'jest-expo',
  // react-native-worklets ships its own jest resolver that strips `.native.js` module
  // resolution for its own package so requiring it in Jest doesn't try to load the real
  // native module (see node_modules/react-native-worklets/jest/resolver.js).
  resolver: 'react-native-worklets/jest/resolver',
  setupFiles: ['./jest.setup.ts'],
  // Deviation (Rule 3 - blocking): plain '<rootDir>/...' patterns break when rootDir sits
  // under a dot-prefixed directory (e.g. a Claude Code worktree at .claude/worktrees/<id>).
  // jest-config's testMatch normalization escapes rootDir for glob-safety, then
  // jest-util's replacePathSepForGlob deliberately skips converting a backslash that is
  // followed by a regex-special char -- including '.' -- so 'C:\...\.claude\...' keeps one
  // literal backslash before '.claude' and the resulting glob matches nothing (verified via
  // `npx jest --showConfig`: testMatch printed with mixed / and \ separators, 0 matches
  // against 241 candidate files). Anchoring with '**/' instead of '<rootDir>/' sidesteps the
  // rootDir substitution entirely; testPathIgnorePatterns still excludes node_modules.
  // roots confines the crawl to this checkout's sources, so the '**/' testMatch cannot
  // pick up tests from nested worktrees under .claude/worktrees/ (gitignored).
  roots: ['<rootDir>/src', '<rootDir>/supabase/functions'],
  testMatch: ['**/src/**/*.test.ts?(x)', '**/supabase/functions/**/*.test.ts'],
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/__tests__/**', '!src/**/*.d.ts', '!src/**/*.typecheck.ts'],
  coverageThreshold,
};
