// D-22: first step of Record onboarding. The account sheet opens in onboarding context over a
// plain heading and body; saving moves on to the history choice with the new account id.
// S-WR-11: Cancel closes the sheet rather than doing nothing. The screen then offers the sheet
// again and a way to You, so a new user can sign out or delete their account (mandatory in-app
// deletion) without first creating a money account. The first-account gate lives in the tabs layout
// (app/(app)/(tabs)/_layout.tsx, D-38): Home and Activity send an account-less user back here.
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/ui/Text';
import { router } from 'expo-router';
import { AccountSheet } from '@/features/record/accounts/AccountSheet';
import { DECIDE_OPEN } from '@/features/decide/availability';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { Pill } from '@/ui/Pill';
import { SyncProblemLine } from '@/shell/header/SyncProblemLine';
import { Screen } from '@/ui/Screen';

export function SetupAccountScreen() {
  const t = useT();
  const { colors, pairing } = useTheme();
  const [sheetOpen, setSheetOpen] = useState(true);
  return (
    <Screen>
      <SyncProblemLine inset={false} />
      <View style={styles.block}>
        <Text accessibilityRole="header" style={{ ...textRole(pairing, 'heading'), color: colors.ink }}>
          {t('setup.accountHeading')}
        </Text>
        <Text style={{ ...textRole(pairing, 'body'), color: colors.inkMuted }}>{t('setup.accountBody')}</Text>
      </View>
      {sheetOpen ? null : (
        <View style={styles.block}>
          <Pill label={t('setup.addAccount')} variant="primary" onPress={() => setSheetOpen(true)} />
          <Pill label={t('setup.toYou')} variant="secondary" onPress={() => router.push('/you')} />
        </View>
      )}
      <AccountSheet
        visible={sheetOpen}
        mode={{ kind: 'new', context: 'onboarding' }}
        onClose={() => setSheetOpen(false)}
        // 05-23 (D-03): rough figures and the first check come before "Bring your history".
        // quick-261025-f46: while DECIDE_OPEN is false the coming-soon switch skips rough figures and the first check.
        onSaved={(id) =>
          router.replace(
            DECIDE_OPEN ? { pathname: '/setup/rough', params: { accountId: id } } : { pathname: '/setup/history', params: { accountId: id } },
          )
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  block: { gap: space.gapSm },
});
