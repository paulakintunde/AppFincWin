// Global test setup. Plans that need their own module mocks do so inside their own
// test files — this file stays limited to setup every test in the suite needs.

// Phase 9: the plan state, lock host and write gate reach the Supabase client from most screens, and the client reads
// EXPO_PUBLIC_* when it loads. CI has no .env, so give every suite inert placeholder values (never a real project).
// Suites that test env validation pass their own values to readClientEnv or set process.env themselves.
process.env.EXPO_PUBLIC_APP_ENV ??= 'development';
process.env.EXPO_PUBLIC_SUPABASE_URL ??= 'https://placeholder.invalid';
process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??= 'test-placeholder-key';
process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ??= 'test-placeholder.apps.googleusercontent.com';

// The Google sign-in SDK needs its native module at import time. Screens now reach it through usePlanState ->
// AuthProvider, so every suite gets an inert stub; google.test.ts mocks it with its own spies.
jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    configure: jest.fn(),
    hasPlayServices: jest.fn(() => Promise.resolve(true)),
    signIn: jest.fn(() => Promise.resolve({ type: 'cancelled', data: null })),
    signInSilently: jest.fn(() => Promise.resolve({ type: 'noSavedCredentialFound', data: null })),
    signOut: jest.fn(() => Promise.resolve(null)),
    revokeAccess: jest.fn(() => Promise.resolve(null)),
  },
}));

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.mock('@react-native-community/netinfo', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-community/netinfo/jest/netinfo-mock.js')
);

// 06.1-72: device reads (time zone, locale, today) are held for a second in the app; tests change mocked device values between
// calls, so the hold is off in every suite (deviceReadCache.test turns it on for its own cases).
jest.mock('./src/services/locale/deviceReadCache', () => {
  const actual = jest.requireActual<typeof import('./src/services/locale/deviceReadCache')>('./src/services/locale/deviceReadCache');
  actual.setDeviceReadTtl(0);
  return actual;
});

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

// 06.2-06 (D-25): lottie-react-native is a native view; every suite gets a plain View stand-in.
jest.mock('lottie-react-native', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: (p: Record<string, unknown>) => React.createElement(View, { testID: 'lottie-view', ...p }),
  };
});
