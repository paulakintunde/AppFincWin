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
import { TesterBuildProvider } from '@/features/decide/screens/answer/TesterBuildProvider';
import { useDecideServerSwitch } from '@/features/decide/useDecideServerSwitch';
import { harnessEnabled } from '@/features/devHarness/harnessEnabled';
import { useNotificationObserver } from '@/features/decide/notifications/useNotificationObserver';
import { useConsent } from '@/features/consent/useConsent';
import { useFirstRunPending } from '@/features/onboarding/useFirstRunPending';
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
import { HouseholdRealtimeHost } from '@/data/realtime/HouseholdRealtimeHost';
import { ReceiptOutboxHost } from '@/features/record/receipt/ReceiptOutboxHost';
import { SystemHosts } from '@/features/system/SystemHosts';
import { RemovedNoticeHost } from '@/features/household/leave/RemovedNoticeHost';
import { AppPartnerFigurePublisher } from '@/features/household/decide/PartnerFigurePublisher';
import { PlanHost } from '@/features/plans/PlanHost';
import { LockHost } from '@/features/plans/LockHost';
import { useTrialReminderTap } from '@/features/plans/notices/useTrialReminderTap';
import { LockedSheetProvider } from '@/features/plans/useWriteGate';

// D-10: mounted after the consent redirect, so a reminder tap routes only after sign-in and consent.
function DecideNotificationObserver({ enabled }: { enabled: boolean }) {
  useNotificationObserver(enabled);
  return null;
}

// 09-19 / UAT C2-3: a tap on the trial reminder (warm or cold start) opens You > Subscription. Same consent gate as above.
function TrialReminderObserver({ enabled }: { enabled: boolean }) {
  useTrialReminderTap(enabled);
  return null;
}

// Expo Router picks this up as the group's error boundary.
export { RouteErrorBoundary as ErrorBoundary };

export default function AppLayout() {
  const { loading, needsPrompt, consent } = useConsent();
  const pathname = usePathname();
  const firstRunPending = useFirstRunPending();
  const reduceMotion = useReduceMotion();
  // 08.1-05 (APP-21): Decide switched off for everyone from the server; the routes close and the notification tap does not route.
  const { off: decideOff } = useDecideServerSwitch();
  const animation = Platform.OS === 'android' ? (reduceMotion ? 'none' : 'slide_from_right') : 'default';

  if (loading) {
    // The root layout's splash has already hidden by the time this group renders (app/
    // _layout.tsx's Gate only mounts the Stack once theme/fonts/route have all settled), so
    // a bare empty Screen — not the splash — covers this brief profile-fetch window.
    return <Screen>{null}</Screen>;
  }

  // 09-23 (ANL-07): onboarding asks consent as its last step, so the redirect does not interrupt the questions. Only the
  // screen is skipped: track() stays consent-gated (T-09-77).
  const inOnboarding = pathname.startsWith('/onboarding') || firstRunPending;
  if (needsPrompt && pathname !== '/consent' && !inOnboarding) {
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
            <TesterBuildProvider>
            <LockedSheetProvider>
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
                {/* 08-20 (D-13): the household Rules screens, linked from Household home's Rules card; outside the Decide gate. */}
                <Stack.Screen name="household/split-default" />
                <Stack.Screen name="household/category-defaults" />
                <Stack.Screen name="household/shared-accounts" />
                {/* 08.1-23: How spending is shared */}
                <Stack.Screen name="household/spending" />
                {/* 08-24 (HH-13): leaving and removing, from Household home and the member sheet; outside the Decide gate. */}
                <Stack.Screen name="household/leave" />
                <Stack.Screen name="household/remove" />
                {/* quick-261025-f46: today's Decide screens stay unreachable, deep links included, while DECIDE_OPEN is false. */}
                <Stack.Protected guard={DECIDE_OPEN && !decideOff}>
                  {/* 06.1-28 (D-05): the one Decide. Old paths (check/[id], settings, open, changes, lines, pots, setup/rough, setup/first-check) are redirect files. */}
                  <Stack.Screen name="setup/rough" />
                  <Stack.Screen name="setup/first-check" />
                  <Stack.Screen name="decide/check/[id]" />
                  {/* 06.1-64 (H-3, from 06.1-57): no native iOS edge swipe on the steps; the steps replace each other, so it would pop past
                      them. Their own Back rule (useStepNav) applies instead. */}
                  <Stack.Screen name="decide/check/kind" options={{ gestureEnabled: false }} />
                  <Stack.Screen name="decide/check/price" options={{ gestureEnabled: false }} />
                  <Stack.Screen name="decide/check/costs" options={{ gestureEnabled: false }} />
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
                <Stack.Screen name="plan-ended" />
                <Stack.Screen name="export" />
                <Stack.Screen name="features" />
                <Stack.Screen name="consent" options={{ gestureEnabled: false }} />
                {/* 09-23: the first-run, partner and re-run questions; no edge swipe (the flow owns Back, UI-SPEC 3). */}
                <Stack.Screen name="onboarding" options={{ gestureEnabled: false, headerShown: false }} />
              </Stack>
              <SampleBanner />
              <UndoToastHost />
              {/* WR-D13: a reminder tap routes only once consent is on record; a missing profile is not consent.
                  quick-261025-f46: while Decide is closed a reminder tap must not push /decide/check/[id] (a redirect to the answer). */}
              <DecideNotificationObserver enabled={DECIDE_OPEN && !decideOff && consentAnswered({ loading, consent })} />
              <TrialReminderObserver enabled={consentAnswered({ loading, consent })} />
              <SampleClearPrompts />
              <HouseholdRealtimeHost />
              {/* 10.1-17 (D-09): receipt uploads outside the write queue */}
              <ReceiptOutboxHost />
              {/* 10-27: alert channels, time-zone sync, push token refresh (only if already allowed) and the device heartbeat. */}
              <SystemHosts />
              {/* 09-10: store identity, plan Realtime and foreground refresh. */}
              <PlanHost />
              <LockHost />
              {/* 08-24 (D-28): "You're no longer in ..." once, for a person the owner removed. */}
              <RemovedNoticeHost />
              {/* 08.1-10: a partner's figure and the shared net's saved amount refresh from anywhere in the app, not only Household home. */}
              <AppPartnerFigurePublisher />
              <DeviceHomeCurrencyDefault />
            </View>
            </LockedSheetProvider>
            </TesterBuildProvider>
          </FabProvider>
        </SheetOverlayProvider>
      </ShellLayoutProvider>
    </BackHistoryProvider>
  );
}
