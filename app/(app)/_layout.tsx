// D-17: the signed-in route group. Redirects to the consent prompt first if the user
// hasn't answered it yet (skipped if already there, to avoid a redirect loop), otherwise
// renders the You screen (and later screens, as they're added in Phase 1+).
import { Redirect, Stack, usePathname } from 'expo-router';
import { useConsent } from '@/features/consent/useConsent';
import { Screen } from '@/ui/Screen';

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

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="you" />
      <Stack.Screen name="consent" options={{ gestureEnabled: false }} />
    </Stack>
  );
}
