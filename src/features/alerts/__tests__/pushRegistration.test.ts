import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { ensureAlertChannels, resetAlertChannelsForTest } from '../channels';
import { getPushPermission, requestPushPermissionAndRegister } from '../pushRegistration';

jest.mock('expo-notifications', () => ({
  setNotificationChannelAsync: jest.fn().mockResolvedValue(null),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn().mockResolvedValue({ data: 'ExponentPushToken[abc]' }),
  AndroidImportance: { HIGH: 4, DEFAULT: 3 },
}));

let mockProjectId: string | undefined = 'proj-1';
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    get expoConfig() {
      return { extra: { eas: { projectId: mockProjectId } } };
    },
  },
}));

const mockRpc = jest.fn().mockResolvedValue({ error: null });
jest.mock('@/services/supabase', () => ({ supabase: { rpc: (...a: unknown[]) => mockRpc(...a) } }));

const N = Notifications as unknown as {
  setNotificationChannelAsync: jest.Mock;
  getPermissionsAsync: jest.Mock;
  requestPermissionsAsync: jest.Mock;
  getExpoPushTokenAsync: jest.Mock;
};

beforeEach(() => {
  jest.clearAllMocks();
  mockProjectId = 'proj-1';
  resetAlertChannelsForTest();
  Platform.OS = 'android';
});

describe('ensureAlertChannels', () => {
  it('creates alerts and digest once on Android, never asks permission', async () => {
    await ensureAlertChannels();
    await ensureAlertChannels();
    expect(N.setNotificationChannelAsync).toHaveBeenCalledTimes(2);
    expect(N.setNotificationChannelAsync).toHaveBeenCalledWith('alerts', { name: 'Alerts', importance: 4 });
    expect(N.setNotificationChannelAsync).toHaveBeenCalledWith('digest', { name: 'Daily summary', importance: 3 });
    expect(N.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('does nothing on iOS', async () => {
    Platform.OS = 'ios';
    await ensureAlertChannels();
    expect(N.setNotificationChannelAsync).not.toHaveBeenCalled();
  });
});

describe('requestPushPermissionAndRegister', () => {
  it('asks when undetermined, then registers the token to the person', async () => {
    N.getPermissionsAsync.mockResolvedValue({ granted: false, status: 'undetermined', canAskAgain: true });
    N.requestPermissionsAsync.mockResolvedValue({ granted: true, status: 'granted' });
    await expect(requestPushPermissionAndRegister()).resolves.toBe('granted');
    expect(N.getExpoPushTokenAsync).toHaveBeenCalledWith({ projectId: 'proj-1' });
    expect(mockRpc).toHaveBeenCalledWith('register_push_token', { p_token: 'ExponentPushToken[abc]', p_platform: 'android' });
  });

  it('does not ask again when already granted', async () => {
    N.getPermissionsAsync.mockResolvedValue({ granted: true, status: 'granted' });
    await expect(requestPushPermissionAndRegister()).resolves.toBe('granted');
    expect(N.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(mockRpc).toHaveBeenCalledTimes(1);
  });

  it('registers nothing when denied', async () => {
    N.getPermissionsAsync.mockResolvedValue({ granted: false, status: 'undetermined', canAskAgain: true });
    N.requestPermissionsAsync.mockResolvedValue({ granted: false, status: 'denied' });
    await expect(requestPushPermissionAndRegister()).resolves.toBe('denied');
    expect(N.getExpoPushTokenAsync).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('does not re-ask a permanent denial', async () => {
    N.getPermissionsAsync.mockResolvedValue({ granted: false, status: 'denied', canAskAgain: false });
    await expect(requestPushPermissionAndRegister()).resolves.toBe('denied');
    expect(N.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('skips registration without a project id, without throwing', async () => {
    mockProjectId = undefined;
    N.getPermissionsAsync.mockResolvedValue({ granted: true, status: 'granted' });
    await expect(requestPushPermissionAndRegister()).resolves.toBe('denied');
    expect(mockRpc).not.toHaveBeenCalled();
  });
});

describe('getPushPermission', () => {
  it('reads without asking', async () => {
    N.getPermissionsAsync.mockResolvedValue({ granted: false, status: 'denied', canAskAgain: false });
    await expect(getPushPermission()).resolves.toBe('denied');
    N.getPermissionsAsync.mockResolvedValue({ granted: false, status: 'undetermined', canAskAgain: true });
    await expect(getPushPermission()).resolves.toBe('undetermined');
    expect(N.requestPermissionsAsync).not.toHaveBeenCalled();
  });
});
