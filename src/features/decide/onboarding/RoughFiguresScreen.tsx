// 05-23 (DCU-10, D-03): onboarding step 3, rough monthly in and out. Next saves the figures through the 05-19 settings
// mutation (never `seeded`, which is server-managed); Skip goes on without saving and the first check answers cash-only.
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useUpdateDecideSettings } from '@/data/mutations/decideSettings';
import { useRecordContext } from '@/features/record/useRecordContext';
import { useT } from '@/i18n';
import { SyncProblemLine } from '@/shell/header/SyncProblemLine';
import { space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { textRole } from '@/theme/typography';
import { Pill } from '@/ui/Pill';
import { Screen } from '@/ui/Screen';
import { Text } from '@/ui/Text';
import { MoneyInput } from '../ui/MoneyInput';
import { MAX_INPUT_MINOR } from '../snapshot/checkInputs';

export interface RoughFiguresScreenProps {
  accountId: string | null;
}

export function RoughFiguresScreen({ accountId }: RoughFiguresScreenProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const rc = useRecordContext();
  const settings = useUpdateDecideSettings(rc.userId ?? '');
  const [income, setIncome] = useState<number | null>(null);
  const [spending, setSpending] = useState<number | null>(null);
  const valid = (n: number | null): n is number => n !== null && Number.isSafeInteger(n) && n > 0 && n <= MAX_INPUT_MINOR;
  // IN-B08: no current income is a real answer; spending stays above zero.
  const validIncome = (n: number | null): n is number => n !== null && Number.isSafeInteger(n) && n >= 0 && n <= MAX_INPUT_MINOR;
  const canNext = validIncome(income) && valid(spending) && rc.userId !== null;

  const go = () => router.replace({ pathname: '/setup/first-check', params: accountId ? { accountId } : {} });
  const next = () => {
    if (!validIncome(income) || !valid(spending) || rc.userId === null) return;
    settings.update({ rough_income: income, rough_spending: spending, currency: rc.homeCurrency });
    go();
  };

  return (
    <Screen>
      <SyncProblemLine inset={false} />
      <View style={styles.block}>
        <Text accessibilityRole="header" style={{ ...textRole(pairing, 'heading'), color: colors.ink }}>
          {t('decide.onboarding.roughTitle')}
        </Text>
        <Text style={{ ...textRole(pairing, 'body'), color: colors.inkMuted }}>{t('decide.onboarding.roughBody')}</Text>
        <MoneyInput
          value={income}
          currency={rc.homeCurrency}
          onChange={setIncome}
          label={t('decide.onboarding.roughIn')}
          accessibilityLabel={t('decide.onboarding.roughIn')}
        />
        <MoneyInput
          value={spending}
          currency={rc.homeCurrency}
          onChange={setSpending}
          label={t('decide.onboarding.roughOut')}
          accessibilityLabel={t('decide.onboarding.roughOut')}
        />
      </View>
      <View style={styles.actions}>
        <Pill label={t('decide.onboarding.next')} variant="primary" disabled={!canNext} onPress={next} />
        <Pill label={t('decide.onboarding.skip')} variant="secondary" onPress={go} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  block: { gap: space.gapSm },
  actions: { marginTop: space.groupGap, gap: space.gapSm },
});
