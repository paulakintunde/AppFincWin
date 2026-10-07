// D-22 / D-39: second step of Record onboarding. Offers a statement import or an empty start.
// The event carries one literal property only (T-02-30-01); no amounts, names or ids.
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useT } from '@/i18n';
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

  const bringHistory = () => {
    getAnalytics().track('onboarding_history_choice', { choice: 'import' });
    router.replace({ pathname: '/import', params: { entry: 'onboarding', ...(accountId ? { accountId } : {}) } });
  };
  const startFresh = () => {
    getAnalytics().track('onboarding_history_choice', { choice: 'fresh' });
    router.replace('/activity');
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
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  block: { gap: space.gapSm },
  actions: { marginTop: space.groupGap, gap: space.gapSm },
});
