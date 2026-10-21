// 05-11 (D-10, D-35): Wait-and-save and cooling-off reminders. Local only; the server's
// ready_by / cooling_off_at are the source of truth (reconcile).
// Lock-screen privacy: fixed copy, data carries only { checkId, kind }.
// CR-B03: every read-modify-write of the reminder map runs through one module-level queue, so overlapping calls
// (Wait schedules cooling-off and the wait reminder at once, while the reconcile effect re-runs) never lose an id.
// WR-B10: the map stores { id, at } per key; reconcile reschedules when the server time differs or the OS no
// longer holds the notification, and cancels any Decide notification nothing in the live lists accounts for.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { i18n } from '@/i18n';
import { registerWipeHandler } from '@/services/storage/wipe';

export const REMINDER_CHANNEL = 'decide-reminders';
export const REMINDER_STORAGE_KEY = 'fincwin:decide-reminders';

export type ReminderKind = 'wait' | 'cooling_off';
type ScheduleResult = { scheduled: true; id: string } | { scheduled: false };
/** `at` is the trigger time as an ISO string; null for an entry stored before the time was recorded. */
interface Entry {
  id: string;
  at: string | null;
}
type ReminderMap = Record<string, Entry>;

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

let chain: Promise<unknown> = Promise.resolve();
/** Runs `fn` after every earlier map operation has settled. A failure never blocks the queue. */
function locked<T>(fn: () => Promise<T>): Promise<T> {
  const next = chain.then(fn, fn);
  chain = next.catch(() => undefined);
  return next;
}

async function readMap(): Promise<ReminderMap> {
  const raw = await AsyncStorage.getItem(REMINDER_STORAGE_KEY);
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const out: ReminderMap = {};
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof v === 'string') out[k] = { id: v, at: null };
        else if (v && typeof v === 'object' && typeof (v as Entry).id === 'string') {
          const at = (v as Entry).at;
          out[k] = { id: (v as Entry).id, at: typeof at === 'string' ? at : null };
        }
      }
      return out;
    }
  } catch {
    // fall through to empty
  }
  return {};
}

async function writeMap(map: ReminderMap): Promise<void> {
  await AsyncStorage.setItem(REMINDER_STORAGE_KEY, JSON.stringify(map));
}

async function cancelKey(key: string): Promise<void> {
  const map = await readMap();
  const entry = map[key];
  if (entry === undefined) return;
  await Notifications.cancelScheduledNotificationAsync(entry.id);
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
  map[keyOf(kind, checkId)] = { id, at: when.toISOString() };
  await writeMap(map);
  return { scheduled: true, id };
}

/** today is a local YYYY-MM-DD; the "still ahead" test for today uses the real clock. */
export function scheduleWaitReminder(checkId: string, readyBy: string, today: string): Promise<ScheduleResult> {
  return locked(async () => {
    if (readyBy < today) return { scheduled: false };
    const when = localMorning(readyBy);
    if (when.getTime() <= Date.now()) return { scheduled: false };
    return scheduleAt('wait', checkId, when, true);
  });
}

export function scheduleCoolingOffReminder(checkId: string, at: string, now: Date): Promise<ScheduleResult> {
  return locked(async () => {
    const when = new Date(at);
    if (Number.isNaN(when.getTime()) || when.getTime() <= now.getTime()) return { scheduled: false };
    return scheduleAt('cooling_off', checkId, when, true);
  });
}

export function cancelWaitReminder(checkId: string): Promise<void> {
  return locked(() => cancelKey(keyOf('wait', checkId)));
}

export function cancelCheckReminders(checkId: string): Promise<void> {
  return locked(async () => {
    await cancelKey(keyOf('wait', checkId));
    await cancelKey(keyOf('cooling_off', checkId));
  });
}

/** The identifiers and Decide payloads the OS still holds; null when the OS list cannot be read. */
async function scheduledOnDevice(): Promise<{ ids: Set<string>; decide: { id: string; key: string }[] } | null> {
  try {
    const all = await Notifications.getAllScheduledNotificationsAsync();
    const ids = new Set<string>();
    const decide: { id: string; key: string }[] = [];
    for (const n of all) {
      ids.add(n.identifier);
      const data = n.content.data as { checkId?: unknown; kind?: unknown } | null | undefined;
      if (data && typeof data.checkId === 'string' && (data.kind === 'wait' || data.kind === 'cooling_off')) {
        decide.push({ id: n.identifier, key: keyOf(data.kind, data.checkId) });
      }
    }
    return { ids, decide };
  } catch {
    return null;
  }
}

export function reconcileWaitReminders(
  waiting: readonly { id: string; readyBy: string | null }[],
  today: string,
  coolingOff: readonly { id: string; coolingOffAt: string | null }[] = [],
): Promise<void> {
  return locked(async () => {
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
    const device = await scheduledOnDevice();
    if (device !== null) {
      // An orphan: a Decide notification whose id the map does not hold for its key (a lost write, or an older build).
      const current = await readMap();
      for (const n of device.decide) {
        if (current[n.key]?.id !== n.id) await Notifications.cancelScheduledNotificationAsync(n.id);
      }
    }
    const perm = await Notifications.getPermissionsAsync();
    if (!perm.granted) return;
    const current = await readMap();
    const now = new Date();
    const upToDate = (key: string, when: Date) => {
      const entry = current[key];
      return entry !== undefined && entry.at === when.toISOString() && (device === null || device.ids.has(entry.id));
    };
    for (const w of waiting) {
      if (!w.readyBy || w.readyBy < today) continue;
      const when = localMorning(w.readyBy);
      if (when.getTime() <= now.getTime() || upToDate(keyOf('wait', w.id), when)) continue;
      await scheduleAt('wait', w.id, when, false);
    }
    for (const c of coolingOff) {
      if (!c.coolingOffAt) continue;
      const when = new Date(c.coolingOffAt);
      if (Number.isNaN(when.getTime()) || when.getTime() <= now.getTime() || upToDate(keyOf('cooling_off', c.id), when)) continue;
      await scheduleAt('cooling_off', c.id, when, false);
    }
  });
}

registerWipeHandler({
  id: 'decide-reminders',
  wipe: () => Notifications.cancelAllScheduledNotificationsAsync(),
});
