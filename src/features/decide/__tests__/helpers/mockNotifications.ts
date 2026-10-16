// 05-11: jest mock for expo-notifications. Use per test file:
// jest.mock('expo-notifications', () => require('@/features/decide/__tests__/helpers/mockNotifications').notificationsMock())
export function notificationsMock() {
  return {
    setNotificationHandler: jest.fn(),
    setNotificationChannelAsync: jest.fn().mockResolvedValue(null),
    getPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
    requestPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
    scheduleNotificationAsync: jest.fn().mockResolvedValue('notif-1'),
    cancelScheduledNotificationAsync: jest.fn().mockResolvedValue(undefined),
    cancelAllScheduledNotificationsAsync: jest.fn().mockResolvedValue(undefined),
    getAllScheduledNotificationsAsync: jest.fn().mockResolvedValue([]),
    getLastNotificationResponseAsync: jest.fn().mockResolvedValue(null),
    addNotificationResponseReceivedListener: jest.fn().mockReturnValue({ remove: jest.fn() }),
    SchedulableTriggerInputTypes: { DATE: 'date' },
    AndroidImportance: { DEFAULT: 3 },
    DEFAULT_ACTION_IDENTIFIER: 'expo.modules.notifications.actions.DEFAULT',
  };
}
