// Global test setup. Plans that need their own module mocks do so inside their own
// test files — this file stays limited to setup every test in the suite needs.

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.mock('@react-native-community/netinfo', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-community/netinfo/jest/netinfo-mock.js')
);

// eslint-disable-next-line @typescript-eslint/no-require-imports
require('react-native-reanimated').setUpTests();
