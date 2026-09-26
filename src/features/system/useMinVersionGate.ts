// FND-09: runs the min-version check once on mount and again whenever the app returns to the
// foreground, so a value pushed to app_config while the app was backgrounded is picked up
// without requiring a fresh cold start. Uses the same .then()-chained-in-effect shape as
// ThemeProvider/AuthProvider (not an async function called directly), which is what keeps
// react-hooks/set-state-in-effect satisfied that setState only ever runs from an external
// callback, never synchronously in the effect body.
import { useEffect, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import * as Application from 'expo-application';
import { fetchMinSupportedVersion, isBelowMinimum } from './minVersion';
import type { GateStatus } from './routeDecision';

export interface MinVersionGateState {
  status: GateStatus;
  minVersion?: string;
}

export function useMinVersionGate(): MinVersionGateState {
  const [state, setState] = useState<MinVersionGateState>({ status: 'checking' });

  useEffect(() => {
    let cancelled = false;

    function check(): void {
      const current = Application.nativeApplicationVersion ?? '0.0.0';
      fetchMinSupportedVersion().then((min) => {
        if (cancelled) return;
        if (min && isBelowMinimum(current, min)) {
          setState({ status: 'blocked', minVersion: min });
        } else {
          setState({ status: 'ok' });
        }
      });
    }

    check();

    const subscription = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') check();
    });

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);

  return state;
}
