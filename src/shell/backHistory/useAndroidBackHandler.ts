// D-06 steps 2-4: pop the history, else Home from another tab, else return false so the system
// exits. Step 1 (close the top sheet with the D-25..D-27 rules) is NOT here: while an RN Modal is
// open BackHandler does not fire and the top Modal's onRequestClose receives the press
// (reactnative.dev/docs/modal; 03-RESEARCH Pattern 8). Requires
// android.predictiveBackGestureEnabled: false (03-01).
import { useEffect } from 'react';
import { BackHandler } from 'react-native';
import { useBackHistory } from './BackHistoryProvider';

export function useAndroidBackHandler(): void {
  const { goBack } = useBackHistory();
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => goBack());
    return () => {
      sub.remove();
    };
  }, [goBack]);
}

/** Mounts the hook; rendered once inside the (app) layout (03-13). */
export function AndroidBackHandler(): null {
  useAndroidBackHandler();
  return null;
}
