/**
 * Plan 05.2-32 (DSU-04): the setup screen. It wires the stepper shell to the step registry and decides what each way
 * of closing does. Full mode ends on the Summary; standalone (Activity "Set it up") runs only the income steps and ends
 * with "Done" and the "Income setup saved" toast; `only` is edit-one-step (a single step, then back).
 *
 * Standalone undo: every step that changed already showed its own "{Step title} saved" toast with Undo during the flow.
 * The closing toast carries the step id of the most recent one, so its Undo reverses the last step that changed.
 * (Documented choice: earlier steps keep the Undo they were given when they saved.)
 */
import React, { useCallback } from 'react';
import { router, type Href } from 'expo-router';
import { useT } from '@/i18n';
import { getToast, showToast } from '@/state/undoToast';
import { SetupStepper, type SetupCloseReason } from '@/features/decide/setup/SetupStepper';
import type { SetupStepKey } from '@/features/decide/setup/setupFlow';
import { renderSetupStep, stepTitleKey } from './setupRegistry';

export const SETTINGS_HREF = '/decide/settings' as Href;

export interface SetupScreenProps {
  mode: 'full' | 'standalone';
  startAt?: SetupStepKey;
  only?: SetupStepKey;
  /** Where to land when there is nothing to go back to (a deep link). */
  fallbackHref?: Href;
}

export function SetupScreen({ mode, startAt, only, fallbackHref }: SetupScreenProps): React.JSX.Element {
  const t = useT();

  const leave = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace(fallbackHref ?? ('/' as Href));
  }, [fallbackHref]);

  const onClose = useCallback(
    (reason: SetupCloseReason) => {
      if (reason === 'done' && mode === 'standalone') {
        const last = getToast()?.stepId ?? null;
        showToast({
          kind: 'ordinary',
          text: { key: 'decide.setup.shell.toastIncome', params: { undoLabel: 'setupStepSaved', name: t('decide.setup.shell.standaloneSection') } },
          stepId: last,
        });
      }
      leave();
    },
    [mode, leave, t]
  );

  const onChangeAnswer = useCallback(() => {
    router.replace(SETTINGS_HREF);
  }, []);

  return (
    <SetupStepper
      mode={mode}
      {...(startAt !== undefined ? { startAt } : {})}
      {...(only !== undefined ? { only } : {})}
      renderStep={renderSetupStep}
      stepTitleKey={stepTitleKey}
      onClose={onClose}
      onChangeAnswer={onChangeAnswer}
    />
  );
}
