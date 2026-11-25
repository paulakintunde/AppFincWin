// 08-25 (HH-09, UI-SPEC Screen 9): the Mine / Household scope of a screen's figures. Default Mine; the choice is kept per
// screen on this device. The key starts with `fincwin:` so wipeDeviceData() clears it on sign-out and account deletion.
// A failed read keeps Mine; a failed write is swallowed (the switch still moves for this session).
import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { FigureScope } from '@/data/queries/figureScope';
import { STORAGE_PREFIX } from '@/services/storage/wipe';

export type FigureScreen = 'home' | 'insights';

export function figureScopeKey(screen: FigureScreen): string {
  return `${STORAGE_PREFIX}figureScope.${screen}`;
}

export function useFigureScope(screen: FigureScreen): [FigureScope, (scope: FigureScope) => void] {
  const [scope, setScopeState] = useState<FigureScope>('mine');
  // IN-05: a tap made before the stored read resolves wins; the late read is ignored once the user has chosen.
  const touched = useRef(false);
  useEffect(() => {
    let live = true;
    AsyncStorage.getItem(figureScopeKey(screen))
      .then((raw) => {
        if (live && !touched.current && raw === 'household') setScopeState('household');
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [screen]);
  const setScope = useCallback(
    (next: FigureScope) => {
      touched.current = true;
      setScopeState(next);
      AsyncStorage.setItem(figureScopeKey(screen), next).catch(() => undefined);
    },
    [screen]
  );
  return [scope, setScope];
}
