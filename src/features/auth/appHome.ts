import type { Href } from 'expo-router';

// The signed-in landing is Activity (02-30). One constant shared by app/index.tsx and the
// consent screen so the two can never drift apart again (02-31 finding 1). Cast because Expo
// Router's generated route types may not know the route yet.
export const APP_HOME_HREF = '/activity' as Href;
