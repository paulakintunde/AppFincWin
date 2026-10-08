// D-22: first step of Record onboarding. The account sheet opens in onboarding context over a
// plain heading and body; saving moves on to the history choice with the new account id.
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { AccountSheet } from '@/features/record/accounts/AccountSheet';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { Screen } from '@/ui/Screen';

export function SetupAccountScreen() {
  const t = useT();
  const { colors, pairing } = useTheme();
  return (
    <Screen>
      <View style={styles.block}>
        <Text accessibilityRole="header" style={{ ...textRole(pairing, 'heading'), color: colors.ink }}>
          {t('setup.accountHeading')}
        </Text>
        <Text style={{ ...textRole(pairing, 'body'), color: colors.inkMuted }}>{t('setup.accountBody')}</Text>
      </View>
      <AccountSheet
        visible
        mode={{ kind: 'new', context: 'onboarding' }}
        onClose={() => undefined}
        onSaved={(id) => router.replace({ pathname: '/setup/history', params: { accountId: id } })}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  block: { gap: space.gapSm },
});
