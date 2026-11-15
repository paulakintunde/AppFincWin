const base = require('./jest.config.js');

// 08-08: the two-client Realtime spike against a running local Supabase. `npm run test:realtime`.
// Not part of the default suite (jest.config.js ignores __spike__).
module.exports = {
  preset: base.preset,
  resolver: base.resolver,
  testEnvironment: 'node',
  roots: ['<rootDir>/src/data/realtime'],
  testMatch: ['**/__spike__/**/*.realtime.test.ts'],
  testTimeout: 30000,
  forceExit: true,
};
