// D-22: first step of Record onboarding. The account sheet opens in onboarding context over a
// plain heading and body; saving moves on to the history choice with the new account id.
// S-WR-11: Cancel closes the sheet rather than doing nothing. The screen then offers the sheet
// again and a way to You, so a new user can sign out or delete their account (mandatory in-app
// deletion) without first creating a money account. The first-account gate (on Activity) is
// unchanged: Activity still sends an account-less user back here.
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { AccountSheet } from '@/features/record/accounts/AccountSheet';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { Pill } from '@/ui/Pill';
import { Screen } from '@/ui/Screen';

export function SetupAccountScreen() {
  const t = useT();
  const { colors, pairing } = useTheme();
  const [sheetOpen, setSheetOpen] = useState(true);
  return (
    <Screen>
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
        onSaved={(id) => router.replace({ pathname: '/setup/history', params: { accountId: id } })}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  block: { gap: space.gapSm },
});
