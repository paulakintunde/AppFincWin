// 05.2-32: the body of the /decide/setup route. Kept in src/ so it is testable; app/(app)/decide/setup.tsx re-exports it.
//
// D-01: an account without the Decide v3 switch gets a redirect to the Decide tab and nothing else (T-05.2-32-01).
// Route params come from a URL, so each is checked against the known values before it reaches the screen.
// The series-edit write is provided here, from outside features/decide, for every host that mounts SavingStep (the full
// stepper, edit-one-step and standalone): depcruise fx-fetch-never-from-reads forbids features/decide from reaching it.
import React from 'react';
import { Redirect, useLocalSearchParams, type Href } from 'expo-router';
import { SetupScreen } from './SetupScreen';
import { SETUP_STEP_KEYS, type SetupStepKey } from '@/features/decide/setup/setupFlow';
import { useDecideAccess } from '@/features/decide/useDecideAccess';
import { EditSeriesFromProvider } from '@/features/income/steps/EditSeriesFromProvider';
import { oneParam } from '@/features/navigation/routeParams';
import { useSetupSheetHost } from './SetupSheetHost';

const DECIDE_TAB = '/decide' as Href;

const stepParam = (value: string | string[] | undefined, allowed: (k: SetupStepKey) => boolean): SetupStepKey | undefined => {
  const v = oneParam(value);
  return (SETUP_STEP_KEYS as readonly string[]).includes(v ?? '') && allowed(v as SetupStepKey) ? (v as SetupStepKey) : undefined;
};

export function SetupRoute(): React.JSX.Element {
  const { v3 } = useDecideAccess();
  if (!v3) return <Redirect href={DECIDE_TAB} />;
  return <SetupRouteBody />;
}

function SetupRouteBody(): React.JSX.Element {
  const p = useLocalSearchParams<{ mode?: string; startAt?: string; only?: string }>();
  useSetupSheetHost();
  const mode = oneParam(p.mode) === 'standalone' ? 'standalone' : 'full';
  const notWelcome = (k: SetupStepKey) => k !== 'welcome';
  const only = mode === 'full' ? stepParam(p.only, notWelcome) : undefined;
  const startAt = stepParam(p.startAt, notWelcome);
  return (
    <EditSeriesFromProvider>
      <SetupScreen mode={mode} {...(startAt !== undefined ? { startAt } : {})} {...(only !== undefined ? { only } : {})} />
    </EditSeriesFromProvider>
  );
}
