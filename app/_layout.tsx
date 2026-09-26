import '@/i18n';
import { createContext, useEffect, useState } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ReducedMotionConfig, ReduceMotion } from 'react-native-reanimated';
import { ThemeProvider, useTheme, useThemeFonts } from '@/theme';
import { AuthProvider, useAuth } from '@/features/auth/AuthProvider';
import { useMinVersionGate } from '@/features/system/useMinVersionGate';
import { resolveRoute, type Route } from '@/features/system/routeDecision';
import { initErrorReporting, captureError } from '@/services/errors';
import { QueryProvider } from '@/data/QueryProvider';
import { setFailureReporter } from '@/data/sync/failedWrites';

// D-18: always-on, independent of analytics consent — initialised unconditionally at boot,
// before anything else can throw.
initErrorReporting();
SplashScreen.preventAutoHideAsync();

// T-01-15-01: every permanently failed or conflicting write is reported as a scrubbed
// entity/kind/code event only -- no amounts, ids or notes ever leave the device via this
// path. 00-16's Sentry beforeSend scrubber runs on top of this as a second layer.
setFailureReporter((f) => captureError(new Error(`write-failed:${f.entity}:${f.kind}:${f.code}`), { area: 'sync' }));

// T-00-17-03: a hard timeout so a stuck theme-cache/fonts/version-gate promise can never
// leave the splash screen up forever — render into whatever route is current and report it,
// rather than trap the user on a blank screen.
const SPLASH_TIMEOUT_MS = 5000;

/**
 * The route resolveRoute() last settled on, shared with app/index.tsx so it can redirect
 * without re-running useMinVersionGate()/useAuth() a second time (which would double the
 * version-gate network call and could flash a blank screen while it re-resolves).
 */
export const RouteContext = createContext<Route>('splash');

function Gate() {
  const theme = useTheme();
  const [fontsLoaded, fontsError] = useThemeFonts();
  const { status: authStatus } = useAuth();
  const gate = useMinVersionGate();
  const route = resolveRoute({ gate: gate.status, auth: authStatus });

  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (fontsError) captureError(fontsError, { area: 'boot' });
  }, [fontsError]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setTimedOut(true);
      captureError(new Error('Splash timeout: boot did not settle within 5s'), { area: 'boot' });
    }, SPLASH_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, []);

  const ready = (theme.ready && fontsLoaded && route !== 'splash') || timedOut;

  useEffect(() => {
    if (ready) {
      void SplashScreen.hideAsync();
    }
  }, [ready]);

  if (!ready) return null; // splash stays up: no flash of default theme (D-14)

  return (
    <RouteContext.Provider value={route}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={route === 'update-required'}>
          <Stack.Screen name="update-required" />
        </Stack.Protected>
        <Stack.Protected guard={route === 'welcome'}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
        <Stack.Protected guard={route === 'app'}>
          {/* (app) is created by 00-18 — Expo Router logs an unknown-screen-name warning
              until then; expected, see the 00-17 SUMMARY. */}
          <Stack.Screen name="(app)" />
        </Stack.Protected>
      </Stack>
    </RouteContext.Provider>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <QueryProvider>
            <AuthProvider>
              <ReducedMotionConfig mode={ReduceMotion.System} />
              <Gate />
            </AuthProvider>
          </QueryProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
