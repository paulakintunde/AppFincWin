// D-17 consent gate, then the shell: the (tabs) group (Home, Activity) plus app-wide pushed
// screens that cover the tab bar (D-22). SwipeBack wraps every outer route (D-07). The app-layer
// toast renders only when no sheet is open; the top sheet hosts it otherwise via
// SheetOverlayProvider (D-16). Multi-step flows (Decide check, import, onboarding) are
// outer-stack screens (D-12).
import { Redirect, Stack, usePathname } from 'expo-router';
import { Profiler } from 'react';
import { Platform, View } from 'react-native';
import { SwipeBack } from '@/features/navigation/SwipeBack';
import { isSwipeBackRoute } from '@/features/navigation/swipeBackGesture';
import { useReduceMotion } from '@/theme/motion';
import { DECIDE_OPEN } from '@/features/decide/availability';
import { harnessEnabled } from '@/features/devHarness/harnessEnabled';
import { useNotificationObserver } from '@/features/decide/notifications/useNotificationObserver';
import { useConsent } from '@/features/consent/useConsent';
import { consentAnswered } from '@/features/consent/consentAnswered';
import { DeviceHomeCurrencyDefault } from '@/features/record/useDeviceHomeCurrencyDefault';
import { SheetToastOverlay, UndoToastHost } from '@/features/record/history/UndoToastHost';
import { SampleBanner } from '@/features/record/samples/SampleBanner';
import { SampleClearPrompts } from '@/features/record/samples/SampleClearPrompts';
import { BackHistoryProvider } from '@/shell/backHistory/BackHistoryProvider';
import { AndroidBackHandler } from '@/shell/backHistory/useAndroidBackHandler';
import { FabProvider } from '@/shell/fab/FabProvider';
import { ShellLayoutProvider } from '@/shell/layout/ShellLayoutProvider';
import { SheetOverlayProvider } from '@/ui/sheetOverlay';
import { RouteErrorBoundary } from '@/ui/RouteErrorBoundary';
import { Screen } from '@/ui/Screen';
import { perfEnabled } from '@/features/decide/perf/perfMarks';
import { probeCommit } from '@/data/perf/cacheProbe';
import { DecideV3Scope } from '@/data/queries/decideV3';

// D-10: mounted after the consent redirect, so a reminder tap routes only after sign-in and consent.
function DecideNotificationObserver({ enabled }: { enabled: boolean }) {
  useNotificationObserver(enabled);
  return null;
}

// Expo Router picks this up as the group's error boundary.
export { RouteErrorBoundary as ErrorBoundary };

export default function AppLayout() {
  const { loading, needsPrompt, consent } = useConsent();
  const pathname = usePathname();
  const reduceMotion = useReduceMotion();
  const animation = Platform.OS === 'android' ? (reduceMotion ? 'none' : 'slide_from_right') : 'default';

  if (loading) {
    // The root layout's splash has already hidden by the time this group renders (app/
    // _layout.tsx's Gate only mounts the Stack once theme/fonts/route have all settled), so
    // a bare empty Screen — not the splash — covers this brief profile-fetch window.
    return <Screen>{null}</Screen>;
  }

  if (needsPrompt && pathname !== '/consent') {
    return <Redirect href="/consent" />;
  }

  // The undo toast host is mounted once here so every undoable change anywhere in the
  // signed-in app shows its toast (D-31). It lives beside the Stack, not inside a screen.
  return (
    <BackHistoryProvider>
      <ShellLayoutProvider>
        <SheetOverlayProvider overlay={SheetToastOverlay}>
          <AndroidBackHandler />
          {/* One FAB registry for the tabs and the outer stack: You > Add runs the quick actions the tabs register (05-98). */}
          <FabProvider>
            <View style={{ flex: 1 }}>
              <Stack
                // 06.1-73 (DB-1): screens two or more below the top stop re-rendering until they are near the top again.
                // On Fabric the screen directly below the top is never frozen (react-native-screens), so Back shows it at once.
                screenOptions={{ headerShown: false, animation, freezeOnBlur: true }}
                screenLayout={({ children, route }) => {
                  // 06.1-72 (G-73-1): each Decide screen runs the Decide reads once, shared by all its hooks.
                  const body = DECIDE_OPEN && route.name.startsWith('decide/') ? <DecideV3Scope>{children}</DecideV3Scope> : children;
                  // 06.1-73: perf builds count each outer screen's commits (route name only).
                  return perfEnabled() ? (
                    <Profiler id={`stack.${route.name}`} onRender={probeCommit}>
                      <SwipeBack enabled={isSwipeBackRoute(route.name)}>{body}</SwipeBack>
                    </Profiler>
                  ) : (
                    <SwipeBack enabled={isSwipeBackRoute(route.name)}>{body}</SwipeBack>
                  );
                }}
              >
                <Stack.Screen name="(tabs)" options={{ gestureEnabled: false }} />
                <Stack.Screen name="accounts/index" />
                <Stack.Screen name="accounts/[id]" />
                <Stack.Screen name="categories" />
                <Stack.Screen name="category-rules" />
                <Stack.Screen name="history" />
                <Stack.Screen name="import" />
                <Stack.Screen name="setup/account" />
                <Stack.Screen name="setup/history" />
                {/* 06-13 (D-21): the Calculators page and its four typed calculators; not behind the Decide gate. */}
                <Stack.Screen name="grow/calculators/index" />
                <Stack.Screen name="grow/calculators/loan" />
                <Stack.Screen name="grow/calculators/savings" />
                <Stack.Screen name="grow/calculators/growth" />
                <Stack.Screen name="grow/calculators/payoff" />
                {/* 06-19 (D-17..D-19): the record calculators, also outside the Decide gate. */}
                <Stack.Screen name="grow/calculators/goal/[id]" />
                <Stack.Screen name="grow/calculators/debt/[id]" />
                <Stack.Screen name="grow/calculators/illustration" />
                {/* 06-22 (G02): one goal. Outside the Decide gate like the rest of Grow. */}
                <Stack.Screen name="grow/goal/[id]" />
                {/* 06-16 / 06-17 / 06-18: the rest of the Grow detail screens, also outside the Decide gate. */}
                <Stack.Screen name="grow/debt/[id]" />
                <Stack.Screen name="grow/holding/[id]" />
                <Stack.Screen name="grow/safety-net" />
                <Stack.Screen name="grow/lines" />
                {/* quick-261025-f46: today's Decide screens stay unreachable, deep links included, while DECIDE_OPEN is false. */}
                <Stack.Protected guard={DECIDE_OPEN}>
                  {/* 06.1-28 (D-05): the one Decide. Old paths (check/[id], settings, open, changes, lines, pots, setup/rough, setup/first-check) are redirect files. */}
                  <Stack.Screen name="setup/rough" />
                  <Stack.Screen name="setup/first-check" />
                  <Stack.Screen name="decide/check/[id]" />
                  <Stack.Screen name="decide/check/kind" />
                  <Stack.Screen name="decide/check/price" />
                  <Stack.Screen name="decide/check/costs" />
                  <Stack.Screen name="decide/answer/[id]" />
                  <Stack.Screen name="decide/compare/[id]" />
                  <Stack.Screen name="decide/save/[id]" />
                  <Stack.Screen name="decide/bought/[id]" />
                  <Stack.Screen name="decide/safety-net" />
                  <Stack.Screen name="decide/setup/index" />
                  <Stack.Screen name="decide/setup/pay" />
                  <Stack.Screen name="decide/setup/bills" />
                  <Stack.Screen name="decide/setup/debts" />
                  <Stack.Screen name="decide/setup/net" />
                  <Stack.Screen name="decide/setup/rules" />
                  <Stack.Screen name="decide/setup/records" />
                  <Stack.Screen name="decide/setup/quick-estimates" />
                  <Stack.Screen name="decide/settings" />
                  <Stack.Screen name="decide/past/index" />
                  <Stack.Screen name="decide/past/[id]" />
                  <Stack.Screen name="decide/open" />
                  <Stack.Screen name="decide/changes" />
                  <Stack.Screen name="decide/lines" />
                  <Stack.Screen name="decide/pots" />
                </Stack.Protected>
                {/* 05.4-34 (BO-03, APP-04): the dev harness, only in a dev build or a build made with EXPO_PUBLIC_PERF=1. Linked from nowhere. */}
                <Stack.Protected guard={harnessEnabled()}>
                  <Stack.Screen name="decide/dev-harness" />
                </Stack.Protected>
                <Stack.Screen name="you" />
                <Stack.Screen name="consent" options={{ gestureEnabled: false }} />
              </Stack>
              <SampleBanner />
              <UndoToastHost />
              {/* WR-D13: a reminder tap routes only once consent is on record; a missing profile is not consent.
                  quick-261025-f46: while Decide is closed a reminder tap must not push /decide/check/[id] (a redirect to the answer). */}
              <DecideNotificationObserver enabled={DECIDE_OPEN && consentAnswered({ loading, consent })} />
              <SampleClearPrompts />
              <DeviceHomeCurrencyDefault />
            </View>
          </FabProvider>
        </SheetOverlayProvider>
      </ShellLayoutProvider>
    </BackHistoryProvider>
  );
}
