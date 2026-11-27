// 10-30 (D-04; owner 2026-11-27): Android's recents shows a live, frozen frame of the app being left, which the JS
// AppCover cannot beat and setRecentsScreenshotEnabled(false) does not hide. With "Lock FincWin" on, the window is
// secure (FLAG_SECURE via expo-screen-capture): the recents card is blank, and screenshots and screen recording of
// FincWin are blocked. With the lock off, screenshots stay allowed. iOS keeps the JS AppCover, which wins there.
import { Platform } from 'react-native';
import * as ScreenCapture from 'expo-screen-capture';

const KEY = 'fincwin-lock';

export async function setSecureWindow(on: boolean): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    if (on) await ScreenCapture.preventScreenCaptureAsync(KEY);
    else await ScreenCapture.allowScreenCaptureAsync(KEY);
  } catch {
    // A missing native module (an old dev build) must not break the lock itself.
  }
}
