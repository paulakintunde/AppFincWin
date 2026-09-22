import type { ConfigContext, ExpoConfig } from 'expo/config';

const APP_ID = 'com.fincwin.app'; // decided in 00-02 Task 1; permanent after first store registration
const googleIosUrlScheme = process.env.GOOGLE_IOS_URL_SCHEME; // reversed iOS OAuth client ID, set in 00-15

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'FincWin',
  slug: 'fincwin',
  owner: process.env.EXPO_OWNER ?? 'fincwin',
  scheme: 'fincwin',
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'light',
  icon: './assets/icon.png',
  runtimeVersion: { policy: 'fingerprint' }, // FND-11, see docs/ops/ota-policy.md (00-14)
  updates: process.env.EAS_PROJECT_ID
    ? { url: `https://u.expo.dev/${process.env.EAS_PROJECT_ID}`, checkAutomatically: 'ON_LOAD', fallbackToCacheTimeout: 0 }
    : undefined,
  ios: { bundleIdentifier: APP_ID, supportsTablet: false, usesAppleSignIn: true },
  android: { package: APP_ID }, // edgeToEdgeEnabled removed from @expo/config-types in SDK 57: edge-to-edge is mandatory/always-on, no opt-in flag remains
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-font',
    'expo-apple-authentication',
    'expo-web-browser',
    'expo-localization',
    ['expo-splash-screen', { backgroundColor: '#FBFAF7', image: './assets/splash-icon.png', imageWidth: 160 }],
    ...(googleIosUrlScheme
      ? ([['@react-native-google-signin/google-signin', { iosUrlScheme: googleIosUrlScheme }]] as [string, unknown][])
      : []),
  ],
  experiments: { typedRoutes: true },
  extra: { eas: { projectId: process.env.EAS_PROJECT_ID } },
});
