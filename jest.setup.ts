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

// Sheet wraps its Modal in a GestureHandlerRootView; stub the native module for every suite.
// eslint-disable-next-line @typescript-eslint/no-require-imports
require('react-native-gesture-handler/jestSetup');

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  selectionAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

// Open-handle fix (05-79): TanStack Query schedules a 5 minute gc timer for every mutation and the
// default 5 minute query gc timers; in a test those pin the process, so a single in-band suite
// (e.g. markMonthly) finished green but never exited. Unref them for the test environment only.
// The wrappers read the global setTimeout at call time, so jest fake timers still drive them.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { timeoutManager } = require('@tanstack/query-core');
const unref = <T>(timer: T): T => {
  const t = timer as unknown as { unref?: () => void };
  if (typeof t === 'object' && t !== null && typeof t.unref === 'function') t.unref();
  return timer;
};
timeoutManager.setTimeoutProvider({
  setTimeout: (cb: () => void, ms: number) => unref(setTimeout(cb, ms)),
  clearTimeout: (id: Parameters<typeof clearTimeout>[0]) => clearTimeout(id),
  setInterval: (cb: () => void, ms: number) => unref(setInterval(cb, ms)),
  clearInterval: (id: Parameters<typeof clearInterval>[0]) => clearInterval(id),
});
