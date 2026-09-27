// WR-04: on a misconfigured environment, services/supabase/client.ts's load-time getEnv()
// throws while app/_layout.tsx's imports are still being evaluated. Error reporting must
// already be initialised by then, or the boot crash it exists to report is lost. These tests
// load the real root layout with getEnv() forced to throw and pin the order of events.
import fs from 'fs';
import path from 'path';

const mockEvents: string[] = [];

jest.mock('../errorReporter', () => ({
  initErrorReporting: jest.fn(() => {
    mockEvents.push('initErrorReporting');
    return 'enabled';
  }),
  captureError: jest.fn(),
}));

jest.mock('@/config/env', () => ({
  ...jest.requireActual('@/config/env'),
  getEnv: jest.fn(() => {
    mockEvents.push('getEnv');
    throw new Error('EnvError: EXPO_PUBLIC_SUPABASE_URL is wrapped in quotes');
  }),
}));

beforeEach(() => {
  mockEvents.length = 0;
  jest.resetModules();
});

describe('error-reporting boot module (WR-04)', () => {
  it('initialises error reporting as a side effect of being imported', () => {
    jest.isolateModules(() => {
      require('../boot');
    });
    expect(mockEvents).toEqual(['initErrorReporting']);
  });

  it('runs before any root-layout import that calls getEnv() at load time', () => {
    jest.isolateModules(() => {
      // The misconfigured env makes the layout's own import chain throw, as it would at boot.
      expect(() => require('../../../../app/_layout')).toThrow(/EnvError/);
    });
    expect(mockEvents[0]).toBe('initErrorReporting');
    expect(mockEvents).toContain('getEnv');
  });

  it('is the first import of the root layout', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '..', '..', '..', '..', 'app', '_layout.tsx'), 'utf8');
    const firstImport = src
      .split(/\r?\n/)
      .find((line) => /^import\b/.test(line))
      ?.trim();
    expect(firstImport).toBe("import '@/services/errors/boot';");
  });
});
