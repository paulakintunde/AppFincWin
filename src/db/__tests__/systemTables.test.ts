// 10-03: db access for the Phase 10 tables, with a recording fake client.
import { createFakeSupabase } from './fakeSupabase';
import {
  ALERT_KINDS,
  AlertInputError,
  DEFAULT_ALERT_PREFS,
  fetchAlertPrefs,
  fetchAlertSettings,
  upsertAlertSetting,
} from '../alerts';
import { deleteArchivedMonth, fetchArchivedMonths, insertArchivedMonth } from '../archivedMonths';
import { listMyDevices, revokeMySession } from '../devices';

const ok = (data: unknown) => ({ data, error: null, status: 200 });

describe('alerts', () => {
  it('returns all five kinds in order, filling missing ones from defaults', async () => {
    const fake = createFakeSupabase();
    fake.respondWith(
      ok([
        { kind: 'large_txn', enabled: true, threshold_minor: '250000', threshold_currency: 'USD', lead_days: null, version: 2 },
        { kind: 'bills_due', enabled: false, threshold_minor: null, threshold_currency: null, lead_days: 3, version: 1 },
      ])
    );
    const out = await fetchAlertSettings(fake, 'u1');
    expect(out.map((s) => s.kind)).toEqual([...ALERT_KINDS]);
    expect(out[0]).toMatchObject({ kind: 'bills_due', enabled: false, leadDays: 3, version: 1 });
    expect(out[1]).toMatchObject({ kind: 'over_cap', enabled: false });
    expect(out[2]).toMatchObject({ kind: 'goal_reached', enabled: true });
    expect(out[3]).toMatchObject({ kind: 'large_txn', enabled: true, thresholdMinor: 250000, thresholdCurrency: 'USD' });
    expect(out[4]).toMatchObject({ kind: 'low_balance', enabled: false });
  });

  it('defaults bills_due to on with one day lead when there is no row', async () => {
    const fake = createFakeSupabase();
    fake.respondWith(ok([]));
    const out = await fetchAlertSettings(fake, 'u1');
    expect(out[0]).toMatchObject({ enabled: true, leadDays: 1 });
  });

  it('returns default prefs when no row exists and trims quiet times to HH:MM', async () => {
    const fake = createFakeSupabase();
    fake.respondWith(ok(null));
    expect(await fetchAlertPrefs(fake, 'u1')).toEqual(DEFAULT_ALERT_PREFS);
    fake.respondWith(
      ok({ mode: 'digest', quiet_enabled: true, quiet_start: '22:00:00', quiet_end: '07:30:00', time_zone: 'Europe/London', partner_alerts: false, version: 3 })
    );
    expect(await fetchAlertPrefs(fake, 'u1')).toMatchObject({ mode: 'digest', quietStart: '22:00', quietEnd: '07:30', partnerAlerts: false });
  });

  it('sends the threshold as an integer and refuses a fraction', async () => {
    const fake = createFakeSupabase();
    fake.respondWith(ok({ kind: 'large_txn', enabled: true, threshold_minor: 5000, threshold_currency: 'USD', lead_days: null, version: 2 }));
    const base = { kind: 'large_txn' as const, enabled: true, thresholdMinor: 5000, thresholdCurrency: 'USD', leadDays: null, version: 1 };
    await upsertAlertSetting(fake, 'u1', base, 2);
    const call = fake.calls.find((c) => c.method === 'upsert');
    const row = call?.args[0] as { threshold_minor: number; version: number };
    expect(Number.isSafeInteger(row.threshold_minor)).toBe(true);
    expect(row.version).toBe(2);
    await expect(upsertAlertSetting(fake, 'u1', { ...base, thresholdMinor: 50.5 }, 2)).rejects.toBeInstanceOf(AlertInputError);
  });
});

describe('archived months', () => {
  it('sorts descending', async () => {
    const fake = createFakeSupabase();
    fake.respondWith(ok([{ month: '2026-01' }, { month: '2026-11' }, { month: '2025-12' }]));
    expect(await fetchArchivedMonths(fake, 'u1')).toEqual(['2026-11', '2026-01', '2025-12']);
  });

  it('rejects a bad month before any call', async () => {
    const fake = createFakeSupabase();
    await expect(insertArchivedMonth(fake, 'u1', '2026-13')).rejects.toThrow(TypeError);
    await expect(deleteArchivedMonth(fake, 'u1', '26-03')).rejects.toThrow(TypeError);
    expect(fake.calls).toHaveLength(0);
  });
});

describe('devices', () => {
  const dev = (id: string, last: string, cur: boolean) => ({
    session_id: id, model: 'm', os: 'o', app_version: '1', last_active: last, signed_in_at: last, is_current: cur,
  });

  it('puts the current device first, the rest newest first', async () => {
    const fake = createFakeSupabase();
    fake.respondWith(ok([dev('a', '2026-11-01T00:00:00Z', false), dev('b', '2026-10-01T00:00:00Z', true), dev('c', '2026-11-10T00:00:00Z', false)]));
    const out = await listMyDevices(fake);
    expect(out.map((d) => d.sessionId)).toEqual(['b', 'c', 'a']);
    expect(fake.calls[0]?.args[0]).toBe('list_my_devices');
  });

  it('revokes through the rpc and returns the boolean', async () => {
    const fake = createFakeSupabase();
    fake.respondWith(ok(true));
    expect(await revokeMySession(fake, 's1')).toBe(true);
    expect(fake.calls[0]?.args).toEqual(['revoke_my_session', { p_session: 's1' }]);
  });
});
