import { Redirect, type Href } from 'expo-router';

// 06.1-28 D-05/D-23: old rough-figures step. The quick estimates (D39) replace it; they return to Decide home.
export default function SetupRoughRoute() {
  return <Redirect href={'/decide/setup/quick-estimates?returnTo=/decide' as Href} />;
}
