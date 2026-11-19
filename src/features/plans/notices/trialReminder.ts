// 09-19 (D-18, Owner Answer 4): one local reminder 2 days before a free trial ends, only when notifications are already
// allowed. This file never asks for permission. Server push for plans is Phase 10's.
// Lock-screen privacy (T-09-66): the text names only the end date and the plan price; data carries only { kind }.
// Same discipline as decide/notifications/waitReminder.ts: one stored { id, at, body }, every change through one queue.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { i18n } from '@/i18n';
import { dateIn } from '../subscriptionModel';
import type { PlanView } from '../types';

export const TRIAL_REMINDER_CHANNEL = 'plan-reminders';
export const TRIAL_REMINDER_STORAGE_KEY = 'fincwin:trial-reminder';
const LEAD_MS = 2 * 86_400_000;

interface Entry {
  id: string;
  at: string;
  body: string;
}

let chain: Promise<unknown> = Promise.resolve();
function locked<T>(fn: () => Promise<T>): Promise<T> {
  const next = chain.then(fn, fn);
  chain = next.catch(() => undefined);
  return next;
}

async function readEntry(): Promise<Entry | null> {
  const raw = await AsyncStorage.getItem(TRIAL_REMINDER_STORAGE_KEY);
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<Entry> | null;
    return v && typeof v.id === 'string' && typeof v.at === 'string' ? { id: v.id, at: v.at, body: typeof v.body === 'string' ? v.body : '' } : null;
  } catch {
    return null;
  }
}

async function cancelStored(): Promise<void> {
  const entry = await readEntry();
  if (!entry) return;
  await Notifications.cancelScheduledNotificationAsync(entry.id);
  await AsyncStorage.removeItem(TRIAL_REMINDER_STORAGE_KEY);
}

function deviceTz(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'UTC';
  }
}

/**
 * Keeps the one trial reminder in step with the plan: scheduled for a renewing trial, cancelled otherwise. Re-running with
 * the same end date and price changes nothing. Without permission, or without the store price yet, nothing is scheduled.
 */
export function syncTrialReminder(plan: PlanView, price: string | null): Promise<void> {
  return locked(async () => {
    const end = plan.trialEndsAt ? new Date(plan.trialEndsAt).getTime() : NaN;
    if (plan.status !== 'trial' || !plan.willRenew || Number.isNaN(end)) {
      await cancelStored();
      return;
    }
    const when = new Date(end - LEAD_MS);
    if (when.getTime() <= Date.now()) {
      await cancelStored();
      return;
    }
    const perm = await Notifications.getPermissionsAsync();
    if (!perm.granted || !price) return;
    const body = i18n.t('plans.notices.trialPush.body', {
      date: dateIn(plan.trialEndsAt, deviceTz(), i18n.language || 'en'),
      price,
    });
    const at = when.toISOString();
    const stored = await readEntry();
    if (stored && stored.at === at && stored.body === body) return;
    await cancelStored();
    await Notifications.setNotificationChannelAsync(TRIAL_REMINDER_CHANNEL, {
      name: i18n.t('plans.subscription.title'),
      importance: Notifications.AndroidImportance.DEFAULT,
    });
    const id = await Notifications.scheduleNotificationAsync({
      content: { title: i18n.t('plans.notices.trialReminder.title'), body, data: { kind: 'trial_end' } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: when, channelId: TRIAL_REMINDER_CHANNEL },
    });
    await AsyncStorage.setItem(TRIAL_REMINDER_STORAGE_KEY, JSON.stringify({ id, at, body } satisfies Entry));
  });
}

/** True for a tap on the trial reminder (the host opens Subscription). */
export function isTrialReminderResponse(r: Notifications.NotificationResponse | null): boolean {
  if (!r || r.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return false;
  const data = r.notification.request.content.data as Record<string, unknown> | undefined;
  return data?.kind === 'trial_end';
}
