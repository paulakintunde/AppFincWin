// ANL-01/ANL-02 proofs: no event leaves the device before explicit consent, identity is the
// Supabase UUID only (no person properties), and disable() resets identity so a shared device
// never keeps capturing under the previous user.
import { createAnalytics } from '../posthog';

const UUID = '3f2a9c10-4b8e-4d2a-8c1a-7e6f5a4b3c2d';

function makeFakeClient() {
  return {
    optIn: jest.fn().mockResolvedValue(undefined),
    optOut: jest.fn().mockResolvedValue(undefined),
    identify: jest.fn(),
    reset: jest.fn(),
    capture: jest.fn(),
  };
}

function makeEnv(overrides: Partial<{ posthogKey?: string; posthogHost: string }> = {}) {
  return {
    posthogKey: 'phc_test_key',
    posthogHost: 'https://eu.i.posthog.com' as const,
    ...overrides,
  } as never;
}

describe('createAnalytics consent gate', () => {
  it('constructs PostHog with the EU host, defaultOptIn false and enableSessionReplay false, and opts out at init', () => {
    const client = makeFakeClient();
    const factory = jest.fn().mockReturnValue(client);

    createAnalytics(factory, makeEnv());

    expect(factory).toHaveBeenCalledWith(
      'phc_test_key',
      expect.objectContaining({
        host: 'https://eu.i.posthog.com',
        defaultOptIn: false,
        enableSessionReplay: false,
      })
    );
    expect(client.optOut).toHaveBeenCalledTimes(1);
  });

  it('never calls capture before enable()', () => {
    const client = makeFakeClient();
    const analytics = createAnalytics(() => client, makeEnv());

    analytics.track('app_opened', {});

    expect(client.capture).not.toHaveBeenCalled();
  });

  it('enable(uuid) calls optIn() then identify(uuid) with exactly one argument, and later track calls capture', () => {
    const client = makeFakeClient();
    const analytics = createAnalytics(() => client, makeEnv());

    analytics.enable(UUID);

    expect(client.optIn).toHaveBeenCalledTimes(1);
    expect(client.identify).toHaveBeenCalledWith(UUID);
    expect(client.identify.mock.calls[0]).toHaveLength(1);

    analytics.track('sign_in_completed', { provider: 'google' });
    expect(client.capture).toHaveBeenCalledWith('sign_in_completed', { provider: 'google' });
  });

  it('enable("not-a-uuid") throws and does not opt in', () => {
    const client = makeFakeClient();
    const analytics = createAnalytics(() => client, makeEnv());

    expect(() => analytics.enable('not-a-uuid')).toThrow();
    expect(client.optIn).not.toHaveBeenCalled();
    expect(client.identify).not.toHaveBeenCalled();
    expect(analytics.isEnabled()).toBe(false);
  });

  it('disable() calls optOut() and reset(), and subsequent track calls do not capture', async () => {
    const client = makeFakeClient();
    const analytics = createAnalytics(() => client, makeEnv());
    analytics.enable(UUID);
    client.capture.mockClear();
    client.optOut.mockClear();

    await analytics.disable();

    expect(client.optOut).toHaveBeenCalledTimes(1);
    expect(client.reset).toHaveBeenCalledTimes(1);

    analytics.track('signed_out', { had_pending_writes: false });
    expect(client.capture).not.toHaveBeenCalled();
  });

  it('returns a no-op service that never constructs PostHog when posthogKey is undefined', () => {
    const factory = jest.fn();
    const analytics = createAnalytics(factory, makeEnv({ posthogKey: undefined }));

    analytics.enable(UUID);
    analytics.track('app_opened', {});

    expect(factory).not.toHaveBeenCalled();
    expect(analytics.isEnabled()).toBe(false);
  });
});
