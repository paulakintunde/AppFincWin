// 10-30 (D-04, owner 2026-11-27): secure window follows the lock on Android only.
import { Platform } from 'react-native';
import * as ScreenCapture from 'expo-screen-capture';
import { setSecureWindow } from '../secureWindow';

jest.mock('expo-screen-capture', () => ({
  preventScreenCaptureAsync: jest.fn(() => Promise.resolve()),
  allowScreenCaptureAsync: jest.fn(() => Promise.resolve()),
}));

const prevent = ScreenCapture.preventScreenCaptureAsync as jest.Mock;
const allow = ScreenCapture.allowScreenCaptureAsync as jest.Mock;
const realOS = Platform.OS;

afterEach(() => {
  jest.clearAllMocks();
  Object.defineProperty(Platform, 'OS', { value: realOS, configurable: true });
});

const setOS = (os: 'android' | 'ios') => Object.defineProperty(Platform, 'OS', { value: os, configurable: true });

describe('setSecureWindow (10-30, D-04)', () => {
  it('on Android, lock on makes the window secure under one key', async () => {
    setOS('android');
    await setSecureWindow(true);
    expect(prevent).toHaveBeenCalledWith('fincwin-lock');
    expect(allow).not.toHaveBeenCalled();
  });

  it('on Android, lock off allows screenshots again', async () => {
    setOS('android');
    await setSecureWindow(false);
    expect(allow).toHaveBeenCalledWith('fincwin-lock');
    expect(prevent).not.toHaveBeenCalled();
  });

  it('does nothing on iOS (the JS cover handles the switcher there)', async () => {
    setOS('ios');
    await setSecureWindow(true);
    await setSecureWindow(false);
    expect(prevent).not.toHaveBeenCalled();
    expect(allow).not.toHaveBeenCalled();
  });

  it('a failing native call does not throw', async () => {
    setOS('android');
    prevent.mockImplementationOnce(() => Promise.reject(new Error('no module')));
    await expect(setSecureWindow(true)).resolves.toBeUndefined();
  });
});
