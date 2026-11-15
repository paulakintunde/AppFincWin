import { Redirect, type Href } from 'expo-router';

// 06.1-28 D-05/D-23: old onboarding step. The first check is the new Decide home with the "What is it?" field focused.
export default function SetupFirstCheckRoute() {
  return <Redirect href={'/decide?focus=check' as Href} />;
}
