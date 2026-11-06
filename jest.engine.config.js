// Slim engine-only Jest config used by Stryker (05.4-01). Pure TS, node environment.
const base = require('./jest.config.js');

module.exports = {
  ...base,
  roots: ['<rootDir>/src/engine'],
  testEnvironment: 'node',
  collectCoverage: false,
  coverageThreshold: undefined,
};
