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
    ? {
        url: `https://u.expo.dev/${process.env.EAS_PROJECT_ID}`,
        // dev/local: ON_ERROR_RECOVERY so an unpublished channel can't block Metro (quick 261009-uuw).
        // Set per build profile in eas.json `env` (quick 261013-l8i), not from EAS_BUILD_PROFILE:
        // eas build applies profile env both when it computes the runtime version locally and on
        // EAS, while EAS_BUILD_PROFILE exists only on EAS, so the two fingerprints never matched.
        checkAutomatically: process.env.APP_UPDATES_CHECK === 'ON_LOAD' ? 'ON_LOAD' : 'ON_ERROR_RECOVERY',
        fallbackToCacheTimeout: 0,
      }
    : undefined,
  ios: { bundleIdentifier: APP_ID, supportsTablet: false, usesAppleSignIn: true },
  android: {
    package: APP_ID,
    adaptiveIcon: {
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
  }, // edgeToEdgeEnabled removed from @expo/config-types in SDK 57: edge-to-edge is mandatory/always-on, no opt-in flag remains
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-font',
    'expo-apple-authentication',
    'expo-web-browser',
    'expo-localization',
    // D-19: wires the Hermes JS source-map upload into the native build (Gradle on Android) so
    // captureException()'s stack frames symbolicate back to real .ts/.tsx files and line
    // numbers. authToken is deliberately NOT passed here — the plugin falls back to reading
    // SENTRY_AUTH_TOKEN from the build environment itself (secret-visibility EAS env var),
    // which keeps it out of the generated sentry.properties file entirely. No `url` override:
    // the plugin's own default (https://sentry.io/) is the correct, region-agnostic API host —
    // the org this project actually lives under is US-region (verified live: de.sentry.io
    // rejects this org's token with "Invalid org token"; sentry.io/us.sentry.io both recognise
    // it), not EU as originally decided — see docs/decisions/error-tracking.md.
    ['@sentry/react-native/expo', { organization: process.env.SENTRY_ORG, project: process.env.SENTRY_PROJECT }],
    ['expo-splash-screen', { backgroundColor: '#FBFAF7', image: './assets/splash-icon.png', imageWidth: 160 }],
    ...(googleIosUrlScheme
      ? ([['@react-native-google-signin/google-signin', { iosUrlScheme: googleIosUrlScheme }]] as [string, unknown][])
      : []),
  ],
  experiments: { typedRoutes: true },
  extra: { eas: { projectId: process.env.EAS_PROJECT_ID } },
});
