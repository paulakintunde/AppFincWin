// 05.3-FIX-depcruise: the v3 Decide home as the tab composes it. The readiness provider supplies the readiness answers to
// NotReadyCard, which may not import the writes itself (depcruise fx-fetch-never-from-reads).
import React from 'react';
import { HomeScreen } from '@/features/decide/v3/home/HomeScreen';
import { ReadinessAnswerProvider } from '../ReadinessAnswerProvider';

export function HomeRoute(): React.JSX.Element {
  return (
    <ReadinessAnswerProvider>
      <HomeScreen />
    </ReadinessAnswerProvider>
  );
}
