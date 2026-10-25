// 05-23 (DCU-10, D-03, D-04, ANL-06): onboarding step 4, the first check. Judged by firstRead() from the account balance and
// the rough figures, or cash-only when those were skipped. No "Run the full check" (D-04) and no review prompt (LAUNCH §4).
// The analytics event carries the state word only.
import React, { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useDecideSnapshot } from '@/data/queries/decide';
import { useRecordContext } from '@/features/record/useRecordContext';
import { useT } from '@/i18n';
import { getAnalytics } from '@/services/analytics';
import { SyncProblemLine } from '@/shell/header/SyncProblemLine';
import { space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { textRole } from '@/theme/typography';
import { hapticSuccess, hapticWarning } from '@/ui/haptics';
import { Pill } from '@/ui/Pill';
import { Screen } from '@/ui/Screen';
import { Text } from '@/ui/Text';
import { QuickCheckForm } from '../quick/QuickCheckForm';
import type { QuickState } from '../quick/useQuickCheck';
import type { QuickComputation } from '../snapshot/types';

export interface FirstCheckScreenProps {
  accountId: string | null;
}

export function FirstCheckScreen({ accountId }: FirstCheckScreenProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const rc = useRecordContext();
  const snapshot = useDecideSnapshot();
  const [round, setRound] = useState(0); // a new key clears the form for "Check something else"
  const [answered, setAnswered] = useState(false);

  const onResult = useCallback((state: QuickState, computation: QuickComputation) => {
    setAnswered(true);
    getAnalytics().track('first_read_shown', { state });
    if (computation.kind === 'cash_only') {
      if (computation.cashAfter < 0) hapticWarning();
    } else if (state === 'fits') hapticSuccess();
    else hapticWarning();
  }, []);

  return (
    <Screen>
      <SyncProblemLine inset={false} />
      <View style={styles.block}>
        <Text accessibilityRole="header" style={{ ...textRole(pairing, 'heading'), color: colors.ink }}>
          {t('decide.onboarding.checkTitle')}
        </Text>
        <Text style={{ ...textRole(pairing, 'body'), color: colors.inkMuted }}>{t('decide.onboarding.checkBody')}</Text>
        <QuickCheckForm
          key={round}
          surface="firstRead"
          source={snapshot.result}
          sourceStatus={snapshot.status}
          today={rc.today}
          currency={snapshot.result?.currency ?? rc.homeCurrency}
          onRetry={snapshot.retry}
          onResult={onResult}
        />
      </View>
      <View style={styles.actions}>
        <Pill
          label={t('decide.onboarding.history')}
          variant="primary"
          onPress={() => router.replace({ pathname: '/setup/history', params: accountId ? { accountId } : {} })}
        />
        {answered ? (
          <Pill
            label={t('decide.onboarding.again')}
            variant="secondary"
            onPress={() => {
              setAnswered(false);
              setRound((n) => n + 1);
            }}
          />
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  block: { gap: space.gapSm },
  actions: { marginTop: space.groupGap, gap: space.gapSm },
});
