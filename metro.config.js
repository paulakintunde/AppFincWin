// D-19: wraps Expo's default Metro config with Sentry's plugin, which injects a debug ID into
// the bundle and source maps so an uploaded Hermes source map can be matched back to a stack
// frame at symbolication time, and collapses Sentry's own internal frames from LogBox. See
// docs/decisions/error-tracking.md for the spike this exists to run, and
// https://docs.sentry.io/platforms/react-native/manual-setup/metro/.
const { getSentryExpoConfig } = require('@sentry/react-native/metro');

module.exports = getSentryExpoConfig(__dirname);
