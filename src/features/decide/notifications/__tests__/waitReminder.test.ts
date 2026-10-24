import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import {
  REMINDER_STORAGE_KEY,
  cancelCheckReminders,
  cancelWaitReminder,
  configureNotifications,
  localMorning,
  reconcileWaitReminders,
  scheduleCoolingOffReminder,
  scheduleWaitReminder,
} from '../waitReminder';
import { wipeDeviceData } from '@/services/storage/wipe';

jest.mock('expo-notifications', () =>
  require('@/features/decide/__tests__/helpers/mockNotifications').notificationsMock(),
);

type MockName =
  | 'setNotificationHandler'
  | 'setNotificationChannelAsync'
  | 'getPermissionsAsync'
  | 'requestPermissionsAsync'
  | 'scheduleNotificationAsync'
  | 'cancelScheduledNotificationAsync'
  | 'cancelAllScheduledNotificationsAsync'
  | 'getAllScheduledNotificationsAsync'
  | 'getLastNotificationResponseAsync'
  | 'addNotificationResponseReceivedListener';
const N = Notifications as unknown as Record<MockName, jest.Mock>;
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

/** What the fake OS holds: scheduling adds, cancelling removes. */
let osHeld: { identifier: string; content: { data: unknown } }[] = [];
const storedMap = async () => JSON.parse((await AsyncStorage.getItem(REMINDER_STORAGE_KEY))!) as Record<string, { id: string; at: string | null }>;

beforeEach(async () => {
  jest.clearAllMocks();
  jest.useFakeTimers({ now: new Date(2026, 10, 1, 8, 0, 0) });
  await AsyncStorage.clear();
  osHeld = [];
  N.getPermissionsAsync.mockResolvedValue({ granted: true });
  N.requestPermissionsAsync.mockResolvedValue({ granted: true });
  let n = 0;
  N.scheduleNotificationAsync.mockImplementation(async (req: { content: { data: unknown } }) => {
    const identifier = `n-${++n}`;
    osHeld.push({ identifier, content: { data: req.content.data } });
    return identifier;
  });
  N.cancelScheduledNotificationAsync.mockImplementation(async (id: string) => {
    osHeld = osHeld.filter((x) => x.identifier !== id);
  });
  N.getAllScheduledNotificationsAsync.mockImplementation(async () => osHeld.slice());
});
afterEach(() => jest.useRealTimers());

describe('waitReminder', () => {
  it('localMorning is 09:00 local wall clock', () => {
    const d = localMorning('2026-12-01');
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()]).toEqual([2026, 11, 1, 9, 0]);
  });

  it('configureNotifications sets the handler once', async () => {
    configureNotifications();
    configureNotifications();
    expect(N.setNotificationHandler).toHaveBeenCalledTimes(1);
    const h = N.setNotificationHandler.mock.calls[0]![0] as { handleNotification: () => Promise<Record<string, boolean>> };
    expect(await h.handleNotification()).toEqual({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    });
  });

  it('schedules a wait reminder with private-data-free content', async () => {
    const r = await scheduleWaitReminder(A, '2026-12-01', '2026-11-01');
    expect(r).toEqual({ scheduled: true, id: 'n-1' });
    expect(N.setNotificationChannelAsync).toHaveBeenCalledWith('decide-reminders', expect.anything());
    const arg = N.scheduleNotificationAsync.mock.calls[0]![0] as {
      content: { title: string; body: string; data: unknown };
      trigger: { type: string; date: Date; channelId: string };
    };
    expect(arg.content.data).toEqual({ checkId: A, kind: 'wait' });
    expect(arg.trigger.type).toBe('date');
    expect(arg.trigger.date.getHours()).toBe(9);
    expect(`${arg.content.title} ${arg.content.body}`).not.toMatch(/[0-9$£€]/);
    expect(await storedMap()).toEqual({ [`wait:${A}`]: { id: 'n-1', at: localMorning('2026-12-01').toISOString() } });
  });

  it('requests permission when not granted and returns unscheduled when refused', async () => {
    N.getPermissionsAsync.mockResolvedValue({ granted: false });
    N.requestPermissionsAsync.mockResolvedValue({ granted: false });
    expect(await scheduleWaitReminder(A, '2026-12-01', '2026-11-01')).toEqual({ scheduled: false });
    expect(N.requestPermissionsAsync).toHaveBeenCalled();
    expect(N.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('requests permission then schedules when the user grants it', async () => {
    N.getPermissionsAsync.mockResolvedValue({ granted: false });
    expect((await scheduleWaitReminder(A, '2026-12-01', '2026-11-01')).scheduled).toBe(true);
  });

  it('skips past ready-by dates and a morning already gone', async () => {
    expect(await scheduleWaitReminder(A, '2026-10-31', '2026-11-01')).toEqual({ scheduled: false });
    jest.setSystemTime(new Date(2026, 10, 1, 10, 0, 0));
    expect(await scheduleWaitReminder(A, '2026-11-01', '2026-11-01')).toEqual({ scheduled: false });
    jest.setSystemTime(new Date(2026, 10, 1, 8, 0, 0));
    expect((await scheduleWaitReminder(A, '2026-11-01', '2026-11-01')).scheduled).toBe(true);
  });

  it('keeps one reminder per check per kind', async () => {
    await scheduleWaitReminder(A, '2026-12-01', '2026-11-01');
    await scheduleWaitReminder(A, '2026-12-02', '2026-11-01');
    expect(N.cancelScheduledNotificationAsync).toHaveBeenCalledWith('n-1');
  });

  it('cancelWaitReminder cancels and clears; resolves when nothing matches', async () => {
    await scheduleWaitReminder(A, '2026-12-01', '2026-11-01');
    await cancelWaitReminder(A);
    expect(N.cancelScheduledNotificationAsync).toHaveBeenCalledWith('n-1');
    expect(JSON.parse((await AsyncStorage.getItem(REMINDER_STORAGE_KEY))!)).toEqual({});
    await expect(cancelWaitReminder(B)).resolves.toBeUndefined();
  });

  it('a wait and a cooling-off reminder coexist for one check; cancelCheckReminders clears both', async () => {
    await scheduleWaitReminder(A, '2026-12-01', '2026-11-01');
    const at = new Date(2026, 10, 3, 8, 0, 0).toISOString();
    const r = await scheduleCoolingOffReminder(A, at, new Date());
    expect(r).toEqual({ scheduled: true, id: 'n-2' });
    const arg = N.scheduleNotificationAsync.mock.calls[1]![0] as {
      content: { title: string; body: string; data: unknown };
      trigger: { date: Date };
    };
    expect(arg.content.data).toEqual({ checkId: A, kind: 'cooling_off' });
    expect(arg.trigger.date.toISOString()).toBe(at);
    expect(`${arg.content.title} ${arg.content.body}`).not.toMatch(/[0-9$£€]/);
    expect(Object.keys(JSON.parse((await AsyncStorage.getItem(REMINDER_STORAGE_KEY))!)).sort()).toEqual([
      `cooling_off:${A}`,
      `wait:${A}`,
    ]);
    await cancelCheckReminders(A);
    expect(JSON.parse((await AsyncStorage.getItem(REMINDER_STORAGE_KEY))!)).toEqual({});
  });

  it('cooling-off in the past or invalid is not scheduled', async () => {
    expect(await scheduleCoolingOffReminder(A, new Date(2026, 9, 1).toISOString(), new Date())).toEqual({ scheduled: false });
    expect(await scheduleCoolingOffReminder(A, 'nope', new Date())).toEqual({ scheduled: false });
  });

  it('reconcile schedules missing reminders of both kinds without asking permission', async () => {
    await reconcileWaitReminders(
      [
        { id: A, readyBy: '2026-12-01' },
        { id: B, readyBy: null },
      ],
      '2026-11-01',
      [{ id: A, coolingOffAt: new Date(2026, 10, 3).toISOString() }],
    );
    expect(N.scheduleNotificationAsync).toHaveBeenCalledTimes(2);
    expect(N.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('reconcile does not reschedule existing, skips past dates, and cancels no-longer-qualifying', async () => {
    await scheduleWaitReminder(A, '2026-12-01', '2026-11-01');
    await scheduleCoolingOffReminder(A, new Date(2026, 10, 3).toISOString(), new Date());
    N.scheduleNotificationAsync.mockClear();
    await reconcileWaitReminders(
      [
        { id: A, readyBy: '2026-12-01' },
        { id: B, readyBy: '2026-10-01' },
      ],
      '2026-11-01',
      [
        { id: A, coolingOffAt: new Date(2026, 10, 3).toISOString() },
        { id: B, coolingOffAt: new Date(2026, 9, 1).toISOString() },
        { id: B, coolingOffAt: null },
      ],
    );
    expect(N.scheduleNotificationAsync).not.toHaveBeenCalled();
    await reconcileWaitReminders([], '2026-11-01', []);
    expect(N.cancelScheduledNotificationAsync).toHaveBeenCalledTimes(2);
  });

  it('CR-B03: overlapping schedule calls for one check keep both ids, so cancel reaches both', async () => {
    const at = new Date(2026, 10, 3, 8, 0, 0).toISOString();
    await Promise.all([
      scheduleCoolingOffReminder(A, at, new Date()),
      scheduleWaitReminder(A, '2026-12-01', '2026-11-01'),
      reconcileWaitReminders([{ id: A, readyBy: '2026-12-01' }], '2026-11-01', [{ id: A, coolingOffAt: at }]),
    ]);
    expect(Object.keys(await storedMap()).sort()).toEqual([`cooling_off:${A}`, `wait:${A}`]);
    expect(osHeld).toHaveLength(2);
    await cancelCheckReminders(A);
    expect(osHeld).toEqual([]);
  });

  it('CR-B03: reconcile cancels a Decide notification the map does not account for', async () => {
    osHeld.push({ identifier: 'orphan', content: { data: { checkId: A, kind: 'wait' } } });
    osHeld.push({ identifier: 'other-feature', content: { data: { something: 1 } } });
    await reconcileWaitReminders([], '2026-11-01', []);
    expect(N.cancelScheduledNotificationAsync).toHaveBeenCalledWith('orphan');
    expect(osHeld.map((x) => x.identifier)).toEqual(['other-feature']);
  });

  it('WR-B10: reconcile reschedules when the server time differs from the stored one', async () => {
    await scheduleCoolingOffReminder(A, new Date(2026, 10, 3, 8).toISOString(), new Date());
    await scheduleWaitReminder(B, '2026-12-01', '2026-11-01');
    N.scheduleNotificationAsync.mockClear();
    const server = new Date(2026, 10, 3, 20).toISOString();
    await reconcileWaitReminders([{ id: B, readyBy: '2026-12-05' }], '2026-11-01', [{ id: A, coolingOffAt: server }]);
    expect(N.scheduleNotificationAsync).toHaveBeenCalledTimes(2);
    const map = await storedMap();
    expect(map[`cooling_off:${A}`]!.at).toBe(server);
    expect(map[`wait:${B}`]!.at).toBe(localMorning('2026-12-05').toISOString());
    expect(osHeld).toHaveLength(2);
  });

  it('WR-B10: reconcile reschedules a reminder the OS no longer holds, and a legacy entry with no time', async () => {
    await scheduleWaitReminder(A, '2026-12-01', '2026-11-01');
    osHeld = []; // dropped by the OS
    await AsyncStorage.setItem(
      REMINDER_STORAGE_KEY,
      JSON.stringify({ ...(await storedMap()), [`wait:${B}`]: 'legacy-id', junk: 7 }),
    );
    N.scheduleNotificationAsync.mockClear();
    await reconcileWaitReminders(
      [
        { id: A, readyBy: '2026-12-01' },
        { id: B, readyBy: '2026-12-02' },
      ],
      '2026-11-01',
    );
    expect(N.scheduleNotificationAsync).toHaveBeenCalledTimes(2);
    expect(N.cancelScheduledNotificationAsync).toHaveBeenCalledWith('legacy-id');
  });

  it('WR-B10: an unreadable OS list falls back to the stored times', async () => {
    await scheduleWaitReminder(A, '2026-12-01', '2026-11-01');
    N.getAllScheduledNotificationsAsync.mockRejectedValueOnce(new Error('no'));
    N.scheduleNotificationAsync.mockClear();
    await reconcileWaitReminders([{ id: A, readyBy: '2026-12-01' }], '2026-11-01');
    expect(N.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('a failed map operation does not block the next one', async () => {
    N.setNotificationChannelAsync.mockRejectedValueOnce(new Error('boom'));
    await expect(scheduleWaitReminder(A, '2026-12-01', '2026-11-01')).rejects.toThrow('boom');
    expect((await scheduleWaitReminder(A, '2026-12-01', '2026-11-01')).scheduled).toBe(true);
  });

  it('reconcile cancels but schedules nothing when permission is not granted', async () => {
    N.getPermissionsAsync.mockResolvedValue({ granted: false });
    await reconcileWaitReminders([{ id: A, readyBy: '2026-12-01' }], '2026-11-01');
    expect(N.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('tolerates corrupt storage', async () => {
    await AsyncStorage.setItem(REMINDER_STORAGE_KEY, '{bad');
    expect((await scheduleWaitReminder(A, '2026-12-01', '2026-11-01')).scheduled).toBe(true);
    await AsyncStorage.setItem(REMINDER_STORAGE_KEY, '[1]');
    await expect(cancelWaitReminder(A)).resolves.toBeUndefined();
  });

  it('the wipe handler cancels everything', async () => {
    await wipeDeviceData();
    expect(N.cancelAllScheduledNotificationsAsync).toHaveBeenCalled();
  });
});
