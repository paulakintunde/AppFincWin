// D-32: v3 + shared files only; the old engine is deleted in 05.4/05.5
export default {
  testRunner: 'jest',
  jest: { configFile: 'jest.engine.config.js', enableFindRelatedTests: true },
  coverageAnalysis: 'perTest',
  checkers: ['typescript'],
  tsconfigFile: 'tsconfig.json',
  mutate: [
    'src/engine/decide/v3/**/*.ts',
    '!src/engine/decide/v3/**/__tests__/**',
    '!**/*.d.ts',
    // Shared: old-engine root files that v3 source imports
    'src/engine/decide/bisectCore.ts',
    'src/engine/decide/cardRule.ts',
    'src/engine/decide/lineDefaults.ts',
    'src/engine/decide/pots.ts',
    'src/engine/decide/share.ts',
  ],
  incremental: true,
  incrementalFile: '.stryker-cache/incremental.json',
  reporters: ['clear-text', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/index.html' },
  jsonReporter: { fileName: 'reports/mutation/mutation.json' },
  // D-174: 90% must pass, 95% is the target. The full run applies it to the merged score of all parts
  // (scripts/mutation-merge.mjs); stryker.part.config.mjs turns break off for a single part.
  thresholds: { high: 95, low: 90, break: 90 },
  // 05.4-08: the whole engine suite (backtest alone ~2 min) takes longer than the 5-minute default for the first run
  dryRunTimeoutMinutes: 45,
  // Keep the sandbox small: build output, reports and caches are not source
  ignorePatterns: ['coverage', 'reports', '.stryker-cache', '.stryker-tmp', '.planning', 'android', 'ios', '.expo', 'scratch-jest.txt', 'FincWin United.dc.html'],
  timeoutMS: 60000,
  timeoutFactor: 3,
  concurrency: 4,
  tempDirName: '.stryker-tmp',
};
