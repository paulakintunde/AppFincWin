// 09-19 (D-18, Owner Answer 4): the local trial-end reminder.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import type { PlanView } from '../../types';
import { TRIAL_REMINDER_STORAGE_KEY, syncTrialReminder } from '../trialReminder';

jest.mock('expo-notifications', () => require('@/features/decide/__tests__/helpers/mockNotifications').notificationsMock());

const N = Notifications as unknown as Record<string, jest.Mock>;
const NOW = new Date('2026-11-19T12:00:00Z');
const END = '2026-11-28T18:00:00Z';

function view(over: Partial<PlanView> = {}): PlanView {
  return {
    status: 'trial', kind: 'trial', writable: true, householdId: 'h1', planKey: 'duo', planSize: 2, period: 'month', seats: 2,
    members: 1, payerId: 'me', payerIsMe: true, payerName: null, store: 'APP_STORE', productId: 'p', willRenew: true,
    coveredUntil: END, trialEndsAt: END, graceUntil: null, promoKind: null, prelaunch: false, leftGrace: false,
    trialAvailable: false, billingIssueAt: null, loading: false, isError: false, ...over,
  };
}

beforeEach(async () => {
  jest.clearAllMocks();
  jest.useFakeTimers({ now: NOW });
  await AsyncStorage.clear();
  N.getPermissionsAsync!.mockResolvedValue({ granted: true });
  let i = 0;
  N.scheduleNotificationAsync!.mockImplementation(async () => `n-${++i}`);
});
afterEach(() => jest.useRealTimers());

describe('syncTrialReminder', () => {
  it('schedules one reminder 2 days before the end, with the date and price and no emoji', async () => {
    await syncTrialReminder(view(), '$9.99');
    expect(N.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    const req = N.scheduleNotificationAsync!.mock.calls[0]![0] as {
      content: { title: string; body: string; data: unknown };
      trigger: { date: Date };
    };
    expect(req.trigger.date.toISOString()).toBe('2026-11-26T18:00:00.000Z');
    expect(req.content.data).toEqual({ kind: 'trial_end' });
    expect(req.content.title).toBe('Trial ends soon');
    expect(req.content.body).toMatch(/^Your free trial ends on .+2026\. \$9\.99 is charged unless you cancel\.$/);
    expect(/\p{Extended_Pictographic}/u.test(req.content.body)).toBe(false);
    expect(N.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('re-running with the same date does not duplicate', async () => {
    await syncTrialReminder(view(), '$9.99');
    await syncTrialReminder(view(), '$9.99');
    expect(N.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    expect(N.cancelScheduledNotificationAsync).not.toHaveBeenCalled();
  });

  it('a new end date replaces the old reminder', async () => {
    await syncTrialReminder(view(), '$9.99');
    await syncTrialReminder(view({ trialEndsAt: '2026-11-29T18:00:00Z' }), '$9.99');
    expect(N.cancelScheduledNotificationAsync).toHaveBeenCalledWith('n-1');
    expect(N.scheduleNotificationAsync).toHaveBeenCalledTimes(2);
  });

  it('cancels when the trial will not renew or is no longer a trial', async () => {
    await syncTrialReminder(view(), '$9.99');
    await syncTrialReminder(view({ willRenew: false }), '$9.99');
    expect(N.cancelScheduledNotificationAsync).toHaveBeenCalledWith('n-1');
    expect(await AsyncStorage.getItem(TRIAL_REMINDER_STORAGE_KEY)).toBeNull();
    await syncTrialReminder(view(), '$9.99');
    await syncTrialReminder(view({ status: 'active' }), '$9.99');
    expect(N.cancelScheduledNotificationAsync).toHaveBeenCalledWith('n-2');
  });

  it('without permission schedules nothing and never asks', async () => {
    N.getPermissionsAsync!.mockResolvedValue({ granted: false });
    await syncTrialReminder(view(), '$9.99');
    expect(N.scheduleNotificationAsync).not.toHaveBeenCalled();
    expect(N.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('waits for the store price before scheduling', async () => {
    await syncTrialReminder(view(), null);
    expect(N.scheduleNotificationAsync).not.toHaveBeenCalled();
  });
});
