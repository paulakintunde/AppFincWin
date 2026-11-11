import { router, type Href } from 'expo-router';
import { SetupDone } from '@/features/decide/screens/setup/SetupDone';

const DECIDE_HOME = '/decide' as Href;

export default function SetupDoneRoute() {
  return <SetupDone onBack={() => router.replace(DECIDE_HOME)} />;
}
