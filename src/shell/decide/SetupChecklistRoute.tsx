// 06.1-28 (ARC-11): the body of /decide/setup, the new checklist. Binds progress and navigation for the presentational SetupChecklist.
import React from 'react';
import { router, type Href } from 'expo-router';
import { SetupChecklist } from '@/features/decide/screens/setup/SetupChecklist';
import { useSetupProgress } from '@/features/decide/screens/setup/useSetupProgress';
import { Screen } from '@/ui/Screen';

export function SetupChecklistRoute(): React.JSX.Element {
  const progress = useSetupProgress();
  return (
    <Screen scroll>
      <SetupChecklist
        progress={progress}
        currency={progress.currency}
        onOpen={(route: Href) => router.push(route)}
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/decide' as Href))}
      />
    </Screen>
  );
}
