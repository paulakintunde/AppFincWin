const base = require('./jest.config.js');

// 08-08: the two-client Realtime spike against a running local Supabase. `npm run test:realtime`.
// Lives in tests/realtime, outside src (ENV-04: no service-role key text in src or app), so the default suite never sees it.
module.exports = {
  preset: base.preset,
  resolver: base.resolver,
  testEnvironment: 'node',
  roots: ['<rootDir>/tests/realtime'],
  testMatch: ['**/tests/realtime/**/*.realtime.test.ts'],
  testTimeout: 60000,
  forceExit: true,
};
