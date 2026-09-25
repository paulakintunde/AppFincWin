// D-19: wraps Expo's default Metro config with PostHog's plugin, which injects a chunk/debug
// ID into the bundle so an uploaded Hermes source map can be matched back to a stack frame at
// symbolication time. See docs/decisions/error-tracking.md for the spike this exists to run,
// and https://posthog.com/docs/error-tracking/upload-source-maps/react-native.
const { getPostHogExpoConfig } = require('posthog-react-native/metro');

module.exports = getPostHogExpoConfig(__dirname);
