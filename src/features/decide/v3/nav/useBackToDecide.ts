// 05.3-110 (UAT gap 27): system Back and the edge swipe from an answer land on Decide home in one press. The app-wide handler
// does router.back(), which reveals whichever tab sits under the answer (Activity, when the check was started from the FAB).
// The listener is the newest hardwareBackPress listener, so RN calls it first; returning true stops the app-wide one.
// 05.3-114 (UAT gap 33): router.navigate('/decide') from this outer screen pushed a SECOND (tabs) in expo-router 57.0.22, so
// Back on Decide home popped it and showed the answer again. returnToTab dismisses to the (tabs) beneath instead. The old
// 600 ms window kept its timestamp across focus and could swallow the first Back on a re-opened answer; an in-flight flag
// reset at every focus replaces it.
import { useCallback, useEffect, useRef } from 'react';
import { BackHandler } from 'react-native';
import { useFocusEffect, useRootNavigationState } from 'expo-router';
import { setSwipeBackInterceptor } from '@/features/navigation/swipeBackGesture';
import type { NavStateLike } from '@/shell/backHistory/navLocation';
import { returnToTab } from '@/shell/navigation/returnToTab';
import { DECIDE_TAB_HREF } from './hrefs';

/** `enabled` is false while a sheet is open: the sheet's own Modal closes first (D-06 step 1). */
export function useBackToDecide(enabled: boolean): void {
  const navState = useRootNavigationState() as unknown as NavStateLike | undefined;
  const navStateRef = useRef(navState);
  // The listener reads the latest state at press time; refs are written in an effect, not during render.
  useEffect(() => {
    navStateRef.current = navState;
  });
  useFocusEffect(
    useCallback(() => {
      if (!enabled) return undefined;
      // Set by the first Back while this focus lasts; a second press before the screen blurs is swallowed once.
      let inFlight = false;
      const toDecide = (): boolean => {
        if (inFlight) return true;
        inFlight = true;
        returnToTab(DECIDE_TAB_HREF, navStateRef.current);
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
