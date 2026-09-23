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
// source, so the 100% folders (money/decide/payoff/split) can arrive in later phases
// without anyone needing to remember to edit this config.
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
for (const f of ['money', 'decide', 'payoff', 'split']) {
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
  testMatch: ['<rootDir>/src/**/*.test.ts?(x)', '<rootDir>/supabase/functions/**/*.test.ts'],
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/__tests__/**', '!src/**/*.d.ts', '!src/**/*.typecheck.ts'],
  coverageThreshold,
};
