import { createFakeSupabase } from '@/db/__tests__/fakeSupabase';
import { redateOnSignIn } from '../redateOnSignIn';

describe('redateOnSignIn', () => {
  it('re-dates a stale sample household and reports it', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: true, error: null, status: 200 });
    const onRedated = jest.fn();
    await expect(redateOnSignIn({ client, householdId: 'hh', today: '2026-11-02', hasSamples: true, onRedated })).resolves.toBe(true);
    expect(onRedated).toHaveBeenCalledTimes(1);
  });

  it('does nothing when the server says the sample is current', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: false, error: null, status: 200 });
    const onRedated = jest.fn();
    await expect(redateOnSignIn({ client, householdId: 'hh', today: '2026-11-02', hasSamples: true, onRedated })).resolves.toBe(false);
    expect(onRedated).not.toHaveBeenCalled();
  });

  it('makes no call without sample data or a household', async () => {
    const client = createFakeSupabase();
    await expect(redateOnSignIn({ client, householdId: 'hh', today: '2026-11-02', hasSamples: false })).resolves.toBe(false);
    await expect(redateOnSignIn({ client, householdId: null, today: '2026-11-02', hasSamples: true })).resolves.toBe(false);
    expect(client.calls).toHaveLength(0);
  });

  it('errors are swallowed', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: null, error: { message: 'boom', code: '42501' }, status: 403 });
    await expect(redateOnSignIn({ client, householdId: 'hh', today: '2026-11-02', hasSamples: true })).resolves.toBe(false);
  });
});
