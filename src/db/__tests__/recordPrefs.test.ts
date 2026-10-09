import { VersionConflictError } from '../errors';
import {
  RatesUnavailableError,
  changeHomeCurrency,
  fetchHouseholdHorizon,
  fetchRecordPrefs,
  updateRecordPrefs,
} from '../recordPrefs';
import { createFakeSupabase } from './fakeSupabase';

describe('record prefs', () => {
  it('fetchRecordPrefs selects the two columns and returns null without a row', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: null, error: null, status: 200 });
    await expect(fetchRecordPrefs(client, 'u1')).resolves.toBeNull();
    expect(client.calls.find((c) => c.method === 'select')?.args).toEqual(['week_start, sample_prompt_answered_at']);
  });

  it('updateRecordPrefs writes an allowed key and rejects others before any call', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: { week_start: 0, sample_prompt_answered_at: null }, error: null, status: 200 });
    await expect(updateRecordPrefs(client, 'u1', { week_start: 0 })).resolves.toEqual({
      week_start: 0,
      sample_prompt_answered_at: null,
    });
    const before = client.calls.length;
    await expect(updateRecordPrefs(client, 'u1', { home_currency: 'USD' } as never)).rejects.toBeInstanceOf(TypeError);
    expect(client.calls.length).toBe(before);
  });

  it('fetchHouseholdHorizon returns the string or null', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: { horizon_month: '2027-03' }, error: null, status: 200 });
    client.respondWith({ data: { horizon_month: null }, error: null, status: 200 });
    await expect(fetchHouseholdHorizon(client, 'hh')).resolves.toBe('2027-03');
    await expect(fetchHouseholdHorizon(client, 'hh')).resolves.toBeNull();
  });
});

describe('changeHomeCurrency', () => {
  const args = { next: 'USD', from: 'GBP', today: '2026-10-09' };

  it('returns status and capsConverted', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: { status: 'applied', caps_converted: 3 }, error: null, status: 200 });
    await expect(changeHomeCurrency(client, args)).resolves.toEqual({ status: 'applied', capsConverted: 3 });
    expect(client.calls.find((c) => c.method === 'rpc')?.args).toEqual([
      'change_home_currency',
      { p_new: 'USD', p_from: 'GBP', p_today: '2026-10-09' },
    ]);
  });

  it('maps P0001 with the rates-unavailable hint, and 40001', async () => {
    const client = createFakeSupabase();
    client.respondWith({
      data: null,
      error: { message: 'x', code: 'P0001', hint: 'rates-unavailable' } as never,
      status: 400,
    });
    client.respondWith({ data: null, error: { message: 'x', code: '40001' }, status: 409 });
    await expect(changeHomeCurrency(client, args)).rejects.toBeInstanceOf(RatesUnavailableError);
    await expect(changeHomeCurrency(client, args)).rejects.toBeInstanceOf(VersionConflictError);
  });

  it('rejects a malformed envelope', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: { status: 'weird' }, error: null, status: 200 });
    await expect(changeHomeCurrency(client, args)).rejects.toMatchObject({ code: 'bad-response' });
  });
});
