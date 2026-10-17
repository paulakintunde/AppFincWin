// D-17 consent gate, then the shell: the (tabs) group (Home, Activity) plus app-wide pushed
// screens that cover the tab bar (D-22). SwipeBack wraps every outer route (D-07). The app-layer
// toast renders only when no sheet is open; the top sheet hosts it otherwise via
// SheetOverlayProvider (D-16). Multi-step flows (Decide check, import, onboarding) are
// outer-stack screens (D-12).
import { Redirect, Stack, usePathname } from 'expo-router';
import { Platform, View } from 'react-native';
import { SwipeBack } from '@/features/navigation/SwipeBack';
import { isSwipeBackRoute } from '@/features/navigation/swipeBackGesture';
import { useReduceMotion } from '@/theme/motion';
import { useNotificationObserver } from '@/features/decide/notifications/useNotificationObserver';
import { useConsent } from '@/features/consent/useConsent';
import { DeviceHomeCurrencyDefault } from '@/features/record/useDeviceHomeCurrencyDefault';
import { SheetToastOverlay, UndoToastHost } from '@/features/record/history/UndoToastHost';
import { SampleBanner } from '@/features/record/samples/SampleBanner';
import { SampleClearPrompts } from '@/features/record/samples/SampleClearPrompts';
import { BackHistoryProvider } from '@/shell/backHistory/BackHistoryProvider';
import { AndroidBackHandler } from '@/shell/backHistory/useAndroidBackHandler';
import { ShellLayoutProvider } from '@/shell/layout/ShellLayoutProvider';
import { SheetOverlayProvider } from '@/ui/sheetOverlay';
import { RouteErrorBoundary } from '@/ui/RouteErrorBoundary';
import { Screen } from '@/ui/Screen';

// D-10: mounted after the consent redirect, so a reminder tap routes only after sign-in and consent.
function DecideNotificationObserver({ enabled }: { enabled: boolean }) {
  useNotificationObserver(enabled);
  return null;
}

// Expo Router picks this up as the group's error boundary.
export { RouteErrorBoundary as ErrorBoundary };

export default function AppLayout() {
  const { loading, needsPrompt } = useConsent();
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
          <View style={{ flex: 1 }}>
            <Stack
              screenOptions={{ headerShown: false, animation }}
              screenLayout={({ children, route }) => <SwipeBack enabled={isSwipeBackRoute(route.name)}>{children}</SwipeBack>}
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
              <Stack.Screen name="setup/rough" />
              <Stack.Screen name="setup/first-check" />
              <Stack.Screen name="decide/check/[id]" />
              <Stack.Screen name="decide/past" />
              <Stack.Screen name="you" />
              <Stack.Screen name="consent" options={{ gestureEnabled: false }} />
            </Stack>
            <SampleBanner />
            <UndoToastHost />
            <DecideNotificationObserver enabled={!needsPrompt} />
            <SampleClearPrompts />
            <DeviceHomeCurrencyDefault />
          </View>
        </SheetOverlayProvider>
      </ShellLayoutProvider>
    </BackHistoryProvider>
  );
}
