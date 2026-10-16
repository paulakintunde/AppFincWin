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
  | 'getLastNotificationResponseAsync'
  | 'addNotificationResponseReceivedListener';
const N = Notifications as unknown as Record<MockName, jest.Mock>;
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

beforeEach(async () => {
  jest.clearAllMocks();
  jest.useFakeTimers({ now: new Date(2026, 10, 1, 8, 0, 0) });
  await AsyncStorage.clear();
  N.getPermissionsAsync.mockResolvedValue({ granted: true });
  N.requestPermissionsAsync.mockResolvedValue({ granted: true });
  let n = 0;
  N.scheduleNotificationAsync.mockImplementation(async () => `n-${++n}`);
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
    expect(JSON.parse((await AsyncStorage.getItem(REMINDER_STORAGE_KEY))!)).toEqual({ [`wait:${A}`]: 'n-1' });
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
