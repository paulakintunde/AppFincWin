// D-22 / D-39: second step of Record onboarding. Offers a statement import or an empty start.
// The event carries one literal property only (T-02-30-01); no amounts, names or ids.
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/ui/Text';
import { router } from 'expo-router';
import { APP_HOME_HREF } from '@/features/auth/appHome';
import { useT } from '@/i18n';
import { useSampleData } from '@/data/mutations/sampleData';
import { useRecordContext } from '@/features/record/useRecordContext';
import { showToast } from '@/state/undoToast';
import { getAnalytics } from '@/services/analytics';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { Pill } from '@/ui/Pill';
import { Screen } from '@/ui/Screen';

export interface SetupHistoryScreenProps {
  accountId: string | null;
}

export function SetupHistoryScreen({ accountId }: SetupHistoryScreenProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const ctx = useRecordContext();
  const { seed, pending } = useSampleData({
    userId: ctx.userId ?? '',
    householdId: ctx.householdId ?? '',
    today: ctx.today,
  });

  const bringHistory = () => {
    getAnalytics().track('onboarding_history_choice', { choice: 'import' });
    router.replace({ pathname: '/import', params: { entry: 'onboarding', ...(accountId ? { accountId } : {}) } });
  };
  const startFresh = () => {
    getAnalytics().track('onboarding_history_choice', { choice: 'fresh' });
    router.replace(APP_HOME_HREF);
  };
  // D-12: explore on sample figures. Seeding is online and reports its outcome at once.
  const explore = (): void => {
    getAnalytics().track('onboarding_history_choice', { choice: 'sample' });
    void seed().then((ok) => {
      if (ok) router.replace(APP_HOME_HREF);
      else showToast({ kind: 'info', text: { key: 'samples.seedFailed' } });
    });
  };

  return (
    <Screen>
      <View style={styles.block}>
        <Text accessibilityRole="header" style={{ ...textRole(pairing, 'heading'), color: colors.ink }}>
          {t('importCsv.onboardingHeading')}
        </Text>
        <Text style={{ ...textRole(pairing, 'body'), color: colors.inkMuted }}>{t('importCsv.onboardingBody')}</Text>
        <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{t('importCsv.privacy')}</Text>
      </View>
      <View style={styles.actions}>
        <Pill label={t('importCsv.onboardingImport')} variant="primary" onPress={bringHistory} />
        <Pill label={t('importCsv.onboardingFresh')} variant="secondary" onPress={startFresh} />
        <Pill
          label={t('samples.onboardingOption')}
          variant="secondary"
          disabled={pending || ctx.userId === null || ctx.householdId === null}
          onPress={explore}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  block: { gap: space.gapSm },
  actions: { marginTop: space.groupGap, gap: space.gapSm },
});
