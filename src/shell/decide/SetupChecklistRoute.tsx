// 06.1-28 (ARC-11): the body of /decide/setup, the new checklist. Binds progress and navigation for the presentational SetupChecklist.
// 06.1-75 (G-72-3): the checklist stays mounted under an open setup item. useSetupProgress holds the same progress while the facts are
// equal, and the handlers here are stable, so the memoised checklist skips the renders a refetch behind the item would cause.
import React, { useCallback } from 'react';
import { router, type Href } from 'expo-router';
import { SetupChecklist } from '@/features/decide/screens/setup/SetupChecklist';
import { useSetupProgress } from '@/features/decide/screens/setup/useSetupProgress';
import { Screen } from '@/ui/Screen';

const Checklist = React.memo(SetupChecklist);

export function SetupChecklistRoute(): React.JSX.Element {
  const progress = useSetupProgress();
  const onOpen = useCallback((route: Href) => router.push(route), []);
  const onBack = useCallback(() => (router.canGoBack() ? router.back() : router.replace('/decide' as Href)), []);
  return (
    <Screen scroll>
      <Checklist progress={progress} currency={progress.currency} onOpen={onOpen} onBack={onBack} />
    </Screen>
  );
}
