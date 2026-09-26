// D-13: the You/settings screen — identity, the D-14 accent/font-pairing switchers (wired to
// the live theme, not the persisted profile, so a change is visible before the write
// resolves), the ANL-02 analytics toggle, the D-13/ENV-03 connection indicator, and the D-15
// sign-out row. The destructive colour stays reserved for the confirm-dialog copy only — the
// row label itself is plain ink (00-UI-SPEC.md Color).
import { useCallback } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { Screen } from '@/ui/Screen';
import { space } from '@/theme/layout';
import { fontSize } from '@/theme/typography';
import { useConsent } from '@/features/consent/useConsent';
import { requestSignOut, performSignOut } from '@/features/auth/signOut';
import { useProfile } from './useProfile';
import { SettingsGroup } from './components/SettingsGroup';
import { AccentSwitcher } from './components/AccentSwitcher';
import { FontPairingSwitcher } from './components/FontPairingSwitcher';
import { AnalyticsToggle } from './components/AnalyticsToggle';
import { ConnectionStatus } from './components/ConnectionStatus';

export function YouScreen() {
  const t = useT();
  const theme = useTheme();
  const { colors, fonts } = theme;
  const { profile, setAccent, setPairing } = useProfile();
  const { consent, setEnabled } = useConsent();

  // D-13: full_name, falling back to email when the name hasn't been captured; the email
  // itself is always also shown as the sub-label.
  const displayName = profile?.full_name ?? profile?.email ?? '';
  const initial = displayName.charAt(0).toUpperCase();

  const handleSignOut = useCallback(async () => {
    const result = await requestSignOut({ resetTheme: theme.reset });
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
  }, [t, theme]);

  return (
    <Screen scroll>
      <Text style={[styles.title, { fontFamily: fonts.body[700], color: colors.ink }]}>{t('you.title')}</Text>

      <View style={styles.identity}>
        <View style={[styles.avatar, { backgroundColor: colors.fill1 }]}>
          <Text style={[styles.avatarLabel, { fontFamily: fonts.body[500], color: colors.ink }]}>{initial}</Text>
        </View>
        <View style={styles.identityText}>
          <Text style={[styles.name, { fontFamily: fonts.body[500], color: colors.ink }]}>{displayName}</Text>
          {profile?.email ? (
            <Text style={[styles.email, { fontFamily: fonts.body[500], color: colors.inkMuted }]}>
              {profile.email}
            </Text>
          ) : null}
        </View>
      </View>

      <SettingsGroup title={t('you.section.appearance')}>
        <View>
          <Text style={[styles.rowLabel, { fontFamily: fonts.body[500], color: colors.ink }]}>
            {t('you.accent.label')}
          </Text>
          <View style={styles.rowContent}>
            <AccentSwitcher value={theme.accent} onChange={setAccent} />
          </View>
        </View>
        <View>
          <Text style={[styles.rowLabel, { fontFamily: fonts.body[500], color: colors.ink }]}>
            {t('you.font.label')}
          </Text>
          <View style={styles.rowContent}>
            <FontPairingSwitcher value={theme.pairing} onChange={setPairing} />
          </View>
        </View>
      </SettingsGroup>

      <SettingsGroup title={t('you.section.privacy')}>
        <View style={styles.privacyRow}>
          <View style={styles.privacyText}>
            <Text style={[styles.rowLabel, { fontFamily: fonts.body[500], color: colors.ink }]}>
              {t('you.analytics.label')}
            </Text>
            <Text style={[styles.hint, { fontFamily: fonts.body[500], color: colors.inkMuted }]}>
              {t('you.analytics.hint')}
            </Text>
          </View>
          <AnalyticsToggle
            value={consent === 'granted'}
            onChange={(next) => {
              void setEnabled(next);
            }}
            accessibilityLabel={t('you.analytics.label')}
          />
        </View>
      </SettingsGroup>

      <SettingsGroup title={t('you.section.connection')}>
        <ConnectionStatus />
      </SettingsGroup>

      <SettingsGroup title={t('you.section.account')}>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            void handleSignOut();
          }}
        >
          <Text style={[styles.rowLabel, { fontFamily: fonts.body[500], color: colors.ink }]}>
            {t('you.signOut')}
          </Text>
        </Pressable>
      </SettingsGroup>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: fontSize.heading,
    lineHeight: fontSize.heading * 1.16,
    letterSpacing: fontSize.heading * -0.01,
  },
  identity: {
    marginTop: space.groupGap,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.gapMd,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLabel: {
    fontSize: fontSize.body,
  },
  identityText: {
    flexShrink: 1,
  },
  name: {
    fontSize: fontSize.body,
  },
  email: {
    marginTop: 2,
    fontSize: fontSize.label,
  },
  rowLabel: {
    fontSize: fontSize.body,
  },
  rowContent: {
    marginTop: space.gapSm,
  },
  privacyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.gapMd,
  },
  privacyText: {
    flexShrink: 1,
  },
  hint: {
    marginTop: 2,
    fontSize: fontSize.label,
  },
});
