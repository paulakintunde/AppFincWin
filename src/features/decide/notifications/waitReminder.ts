// 05-11 (D-10, D-35): Wait-and-save and cooling-off reminders. Local only; the server's
// ready_by / cooling_off_at are the source of truth (reconcile).
// Lock-screen privacy: fixed copy, data carries only { checkId, kind }.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { i18n } from '@/i18n';
import { registerWipeHandler } from '@/services/storage/wipe';

export const REMINDER_CHANNEL = 'decide-reminders';
export const REMINDER_STORAGE_KEY = 'fincwin:decide-reminders';

export type ReminderKind = 'wait' | 'cooling_off';
type ScheduleResult = { scheduled: true; id: string } | { scheduled: false };

let configured = false;

export function configureNotifications(): void {
  if (configured) return;
  configured = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

/** 09:00 local wall clock on the given YYYY-MM-DD. Never via a UTC conversion. */
export function localMorning(readyBy: string): Date {
  const [y = 0, m = 1, d = 1] = readyBy.split('-').map(Number);
  return new Date(y, m - 1, d, 9, 0, 0);
}

const keyOf = (kind: ReminderKind, checkId: string) => `${kind}:${checkId}`;

async function readMap(): Promise<Record<string, string>> {
  const raw = await AsyncStorage.getItem(REMINDER_STORAGE_KEY);
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(parsed)) if (typeof v === 'string') out[k] = v;
      return out;
    }
  } catch {
    // fall through to empty
  }
  return {};
}

async function writeMap(map: Record<string, string>): Promise<void> {
  await AsyncStorage.setItem(REMINDER_STORAGE_KEY, JSON.stringify(map));
}

async function cancelKey(key: string): Promise<void> {
  const map = await readMap();
  const id = map[key];
  if (id === undefined) return;
  await Notifications.cancelScheduledNotificationAsync(id);
  delete map[key];
  await writeMap(map);
}

async function ensureChannel(): Promise<void> {
  await Notifications.setNotificationChannelAsync(REMINDER_CHANNEL, {
    name: i18n.t('decide.notify.channel'),
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

async function scheduleAt(
  kind: ReminderKind,
  checkId: string,
  when: Date,
  requestPermission: boolean,
): Promise<ScheduleResult> {
  await ensureChannel();
  let perm = await Notifications.getPermissionsAsync();
  if (!perm.granted && requestPermission) perm = await Notifications.requestPermissionsAsync();
  if (!perm.granted) return { scheduled: false };
  await cancelKey(keyOf(kind, checkId));
  const cooling = kind === 'cooling_off';
  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: i18n.t(cooling ? 'decide.notify.coolingTitle' : 'decide.notify.title'),
      body: i18n.t(cooling ? 'decide.notify.coolingBody' : 'decide.notify.body'),
      data: cooling ? { checkId, kind: 'cooling_off' } : { checkId, kind: 'wait' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: when,
      channelId: REMINDER_CHANNEL,
    },
  });
  const map = await readMap();
  map[keyOf(kind, checkId)] = id;
  await writeMap(map);
  return { scheduled: true, id };
}

/** today is a local YYYY-MM-DD; the "still ahead" test for today uses the real clock. */
export async function scheduleWaitReminder(
  checkId: string,
  readyBy: string,
  today: string,
): Promise<ScheduleResult> {
  if (readyBy < today) return { scheduled: false };
  const when = localMorning(readyBy);
  if (when.getTime() <= Date.now()) return { scheduled: false };
  return scheduleAt('wait', checkId, when, true);
}

export async function scheduleCoolingOffReminder(
  checkId: string,
  at: string,
  now: Date,
): Promise<ScheduleResult> {
  const when = new Date(at);
  if (Number.isNaN(when.getTime()) || when.getTime() <= now.getTime()) return { scheduled: false };
  return scheduleAt('cooling_off', checkId, when, true);
}

export async function cancelWaitReminder(checkId: string): Promise<void> {
  await cancelKey(keyOf('wait', checkId));
}

export async function cancelCheckReminders(checkId: string): Promise<void> {
  await cancelKey(keyOf('wait', checkId));
  await cancelKey(keyOf('cooling_off', checkId));
}

export async function reconcileWaitReminders(
  waiting: readonly { id: string; readyBy: string | null }[],
  today: string,
  coolingOff: readonly { id: string; coolingOffAt: string | null }[] = [],
): Promise<void> {
  const waitIds = new Set(waiting.map((w) => w.id));
  const coolIds = new Set(coolingOff.map((c) => c.id));
  const stored = await readMap();
  for (const key of Object.keys(stored)) {
    const sep = key.indexOf(':');
    const kind = key.slice(0, sep);
    const checkId = key.slice(sep + 1);
    if ((kind === 'wait' && !waitIds.has(checkId)) || (kind === 'cooling_off' && !coolIds.has(checkId))) {
      await cancelKey(key);
    }
  }
  const perm = await Notifications.getPermissionsAsync();
  if (!perm.granted) return;
  const current = await readMap();
  const now = new Date();
  for (const w of waiting) {
    if (!w.readyBy || w.readyBy < today || current[keyOf('wait', w.id)] !== undefined) continue;
    const when = localMorning(w.readyBy);
    if (when.getTime() <= now.getTime()) continue;
    await scheduleAt('wait', w.id, when, false);
  }
  for (const c of coolingOff) {
    if (!c.coolingOffAt || current[keyOf('cooling_off', c.id)] !== undefined) continue;
    const when = new Date(c.coolingOffAt);
    if (Number.isNaN(when.getTime()) || when.getTime() <= now.getTime()) continue;
    await scheduleAt('cooling_off', c.id, when, false);
  }
}

registerWipeHandler({
  id: 'decide-reminders',
  wipe: () => Notifications.cancelAllScheduledNotificationsAsync(),
});
