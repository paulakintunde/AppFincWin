// 09-23 (D-28, D-30, D-31, UI-SPEC 2 and 3): the onboarding route in three modes. First run and partner end on Home
// (09-24 shows the look-around and paywall there while the status is 'sample'; prelaunch goes straight on). Re-run goes
// back to Features; "Keep what I have" already showed "Nothing changed" inside the flow.
// The flow itself tracks onboarding_started and, for the partner version, saves Everyday when left unfinished (D-30).
import { useCallback } from 'react';
import { Alert } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { APP_HOME_HREF } from '@/features/auth/appHome';
import { performSignOut, requestSignOut } from '@/features/auth/signOut';
import { useUserSetup } from '@/features/levels/useUserSetup';
import { modeFromParam } from '@/features/onboarding/firstRun';
import { OnboardingFlow } from '@/features/onboarding/OnboardingFlow';
import { FEATURES_HREF } from '@/features/plans/routes';
import { usePlanState } from '@/features/plans/usePlanState';

export default function OnboardingRoute() {
  const t = useT() as unknown as (key: string, params?: Record<string, string | number>) => string;
  const theme = useTheme();
  const params = useLocalSearchParams<{ mode?: string }>();
  const setup = useUserSetup();
  const plan = usePlanState();
  const mode = modeFromParam(params.mode, setup.data?.partnerVersion === true);

  const leaveRerun = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace(FEATURES_HREF);
  }, []);

  const onFinished = useCallback(() => {
    if (mode === 'rerun') leaveRerun();
    else router.replace(APP_HOME_HREF);
  }, [mode, leaveRerun]);

  // Android back on question 1 (UI-SPEC 3): Welcome on first run (that is, signed out; answers already saved on the
  // server resume after the next sign-in), otherwise the previous screen. A partner leaving lands on Home on Everyday.
  const onExitFirst = useCallback((): boolean => {
    if (mode === 'rerun') {
      leaveRerun();
      return true;
    }
    if (mode === 'partner') {
      router.replace(APP_HOME_HREF);
      return true;
    }
    void requestSignOut({ resetTheme: theme.reset }).then((result) => {
      if (!result.needsConfirm) return;
      Alert.alert('', t('signOut.confirm.body', { count: result.count ?? 0 }), [
        { text: t('signOut.confirm.cancel'), style: 'cancel' },
        {
          text: t('signOut.confirm.proceed'),
          style: 'destructive',
          onPress: () => {
            void performSignOut({ resetTheme: theme.reset });
          },
        },
      ]);
    });
    return true;
  }, [mode, leaveRerun, theme.reset, t]);

  return (
    <OnboardingFlow
      mode={mode}
      onFinished={onFinished}
      onExitFirst={onExitFirst}
      {...(plan.payerName !== null && !plan.payerIsMe ? { payerName: plan.payerName } : {})}
    />
  );
}
