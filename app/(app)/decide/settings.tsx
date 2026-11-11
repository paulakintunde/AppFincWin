import { Redirect, type Href } from 'expo-router';

// 06.1-28 D-05: old path. Decide settings are now the setup checklist.
export default function SettingsRouteScreen() {
  return <Redirect href={'/decide/setup' as Href} />;
}
