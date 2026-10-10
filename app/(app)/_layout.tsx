// D-17: the signed-in route group. Redirects to the consent prompt first if the user
// hasn't answered it yet (skipped if already there, to avoid a redirect loop), otherwise
// renders the You screen (and later screens, as they're added in Phase 1+).
import { Redirect, Stack, usePathname } from 'expo-router';
import { View } from 'react-native';
import { useConsent } from '@/features/consent/useConsent';
import { DeviceHomeCurrencyDefault } from '@/features/record/useDeviceHomeCurrencyDefault';
import { UndoToastHost } from '@/features/record/history/UndoToastHost';
import { SampleBanner } from '@/features/record/samples/SampleBanner';
import { SampleClearPrompts } from '@/features/record/samples/SampleClearPrompts';
import { RouteErrorBoundary } from '@/ui/RouteErrorBoundary';
import { Screen } from '@/ui/Screen';

// Expo Router picks this up as the group's error boundary.
export { RouteErrorBoundary as ErrorBoundary };

export default function AppLayout() {
  const { loading, needsPrompt } = useConsent();
  const pathname = usePathname();

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
    <View style={{ flex: 1 }}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="activity" />
        <Stack.Screen name="accounts/index" />
        <Stack.Screen name="accounts/[id]" />
        <Stack.Screen name="categories" />
        <Stack.Screen name="history" />
        <Stack.Screen name="import" />
        <Stack.Screen name="setup/account" />
        <Stack.Screen name="setup/history" />
        <Stack.Screen name="you" />
        <Stack.Screen name="consent" options={{ gestureEnabled: false }} />
      </Stack>
      <SampleBanner />
      <UndoToastHost />
      <SampleClearPrompts />
      <DeviceHomeCurrencyDefault />
    </View>
  );
}
