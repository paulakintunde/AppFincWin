import type { Href } from 'expo-router';

// D-30/D-38: the signed-in landing and the post-setup landing are Home; Activity has its own
// constant so You's Activity row and import's return do not follow the landing. One constant is
// shared by app/index.tsx and the consent screen so they cannot drift apart (02-31 finding 1).
// Cast because Expo Router's generated route types may not know the route yet.
export const APP_HOME_HREF = '/home' as Href;
export const ACTIVITY_HREF = '/activity' as Href;
