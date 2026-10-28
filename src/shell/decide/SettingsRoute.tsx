// 05.2-34: the body of the /decide/settings route (Decide settings). Same gate as /decide/setup (D-01): an account
// without the Decide v3 switch is redirected to the Decide tab and sees nothing else (T-05.2-34-02). The app/ file is a
// thin re-export so the body is testable from src/.
import React from 'react';
import { Redirect, type Href } from 'expo-router';
import { DecideSettingsScreen } from '@/features/decide/settings/DecideSettingsScreen';
import { useDecideAccess } from '@/features/decide/useDecideAccess';

const DECIDE_TAB = '/decide' as Href;

export function SettingsRoute(): React.JSX.Element {
  const { v3 } = useDecideAccess();
  if (!v3) return <Redirect href={DECIDE_TAB} />;
  return <DecideSettingsScreen />;
}
