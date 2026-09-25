import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { initErrorReporting, maybeFireSpikeError } from '@/services/errors';

// D-18: always-on, independent of analytics consent — initialised unconditionally at boot.
initErrorReporting();

export default function RootLayout() {
  // T-00-16-05: no-ops unless a build was started with EXPO_PUBLIC_ERROR_SPIKE=1 (Task 2's
  // live EAS spike only). Removed in Task 3.
  useEffect(() => {
    maybeFireSpikeError();
  }, []);

  return <Stack screenOptions={{ headerShown: false }} />;
}
