// 05.3-110 (UAT gap 27): system Back and the edge swipe from an answer land on Decide home in one press. The app-wide handler
// does router.back(), which reveals whichever tab sits under the answer (Activity, when the check was started from the FAB).
// The listener is the newest hardwareBackPress listener, so RN calls it first; returning true stops the app-wide one.
import { useCallback, useRef } from 'react';
import { BackHandler } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { setSwipeBackInterceptor } from '@/features/navigation/swipeBackGesture';
import { DECIDE_TAB_HREF } from './hrefs';

/** Two Backs inside this window navigate once. */
const DOUBLE_BACK_MS = 600;

/** `enabled` is false while a sheet is open: the sheet's own Modal closes first (D-06 step 1). */
export function useBackToDecide(enabled: boolean): void {
  const lastRef = useRef(0);
  useFocusEffect(
    useCallback(() => {
      if (!enabled) return undefined;
      const toDecide = (): boolean => {
        const now = Date.now();
        if (now - lastRef.current >= DOUBLE_BACK_MS) {
          lastRef.current = now;
          router.navigate(DECIDE_TAB_HREF);
        }
        return true;
      };
      const release = setSwipeBackInterceptor(toDecide);
      const sub = BackHandler.addEventListener('hardwareBackPress', toDecide);
      return () => {
        sub.remove();
        release();
      };
    }, [enabled])
  );
}
