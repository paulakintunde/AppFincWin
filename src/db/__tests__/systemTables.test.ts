// 10-03: db access for the Phase 10 tables, with a recording fake client.
import { createFakeSupabase } from './fakeSupabase';
import {
  ALERT_KINDS,
  AlertInputError,
  DEFAULT_ALERT_PREFS,
  fetchAlertPrefs,
  fetchAlertSettings,
  upsertAlertPrefs,
  upsertAlertSetting,
} from '../alerts';
import { VersionConflictError } from '../errors';
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
    fake.respondWith(ok([{ kind: 'large_txn', enabled: true, threshold_minor: 5000, threshold_currency: 'USD', lead_days: null, version: 2 }]));
    const base = { kind: 'large_txn' as const, enabled: true, thresholdMinor: 5000, thresholdCurrency: 'USD', leadDays: null, version: 1 };
    await upsertAlertSetting(fake, 'u1', base, 1);
    const call = fake.calls.find((c) => c.method === 'update');
    const row = call?.args[0] as { threshold_minor: number; version: number };
    expect(Number.isSafeInteger(row.threshold_minor)).toBe(true);
    expect(row.version).toBe(2);
    await expect(upsertAlertSetting(fake, 'u1', { ...base, thresholdMinor: 50.5 }, 1)).rejects.toBeInstanceOf(AlertInputError);
  });

  // 10-review L-1 (alert version concurrency): compare-and-set on version, server copy wins.
  const setting = { kind: 'large_txn' as const, enabled: true, thresholdMinor: 5000, thresholdCurrency: 'USD', leadDays: null, version: 3 };
  const serverSetting = { kind: 'large_txn', enabled: false, threshold_minor: 9000, threshold_currency: 'EUR', lead_days: null, version: 4 };

  it('updates a known setting only while its version still matches', async () => {
    const fake = createFakeSupabase();
    fake.respondWith(ok([{ ...serverSetting, enabled: true, threshold_minor: 5000, threshold_currency: 'USD' }]));
    const out = await upsertAlertSetting(fake, 'u1', setting, 3);
    expect(out).toMatchObject({ enabled: true, version: 4 });
    expect(fake.calls.filter((c) => c.method === 'eq').map((c) => c.args)).toEqual([
      ['user_id', 'u1'],
      ['kind', 'large_txn'],
      ['version', 3],
    ]);
    expect(fake.calls.some((c) => c.method === 'upsert')).toBe(false);
  });

  it('throws a version conflict carrying the server row when another save landed first', async () => {
    const fake = createFakeSupabase();
    fake.respondWith(ok([])).respondWith(ok(serverSetting));
    const err = await upsertAlertSetting(fake, 'u1', setting, 3).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(VersionConflictError);
    expect((err as VersionConflictError).entity).toBe('alert_settings');
    expect((err as VersionConflictError).serverRow).toMatchObject({ kind: 'large_txn', enabled: false, thresholdMinor: 9000, version: 4 });
  });

  it('inserts a first save and turns a duplicate first save into a conflict', async () => {
    const fake = createFakeSupabase();
    fake.respondWith(ok({ ...serverSetting, version: 1 }));
    await upsertAlertSetting(fake, 'u1', { ...setting, version: 0 }, 0);
    expect((fake.calls.find((c) => c.method === 'insert')?.args[0] as { version: number }).version).toBe(1);

    const raced = createFakeSupabase();
    raced.respondWith({ data: null, error: { message: 'duplicate key', code: '23505' }, status: 409 }).respondWith(ok(serverSetting));
    await expect(upsertAlertSetting(raced, 'u1', { ...setting, version: 0 }, 0)).rejects.toBeInstanceOf(VersionConflictError);
  });

  it('prefs: a stale version conflicts with the server prefs, a first save inserts', async () => {
    const fake = createFakeSupabase();
    const serverPrefs = { mode: 'digest', quiet_enabled: false, quiet_start: '22:00:00', quiet_end: '07:00:00', time_zone: 'Europe/London', partner_alerts: true, version: 5 };
    fake.respondWith(ok([])).respondWith(ok(serverPrefs));
    const err = await upsertAlertPrefs(fake, 'u1', { ...DEFAULT_ALERT_PREFS, version: 4 }, 4).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(VersionConflictError);
    expect((err as VersionConflictError).serverRow).toMatchObject({ mode: 'digest', quietEnabled: false, version: 5 });
    expect(fake.calls.find((c) => c.method === 'eq' && c.args[0] === 'version')?.args).toEqual(['version', 4]);

    const first = createFakeSupabase();
    first.respondWith(ok({ ...serverPrefs, version: 1 }));
    await expect(upsertAlertPrefs(first, 'u1', DEFAULT_ALERT_PREFS, 0)).resolves.toMatchObject({ version: 1 });
    expect(first.calls.some((c) => c.method === 'insert')).toBe(true);
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
