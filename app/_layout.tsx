import { Stack } from 'expo-router';
import { initErrorReporting } from '@/services/errors';

// D-18: always-on, independent of analytics consent — initialised unconditionally at boot.
initErrorReporting();

export default function RootLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
