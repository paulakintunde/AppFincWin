// FND-09 / D-25: the blocking screen shown when the installed build is below
// app_config.min_supported_version. No dismiss, no back gesture on Android -- this is the
// only route the router allows once the gate reports 'blocked' (routeDecision.ts).
import { useEffect } from 'react';
import { BackHandler, Linking, Platform, Pressable, StyleSheet, Text } from 'react-native';
import * as Application from 'expo-application';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { space, radii } from '@/theme/layout';
import { fontSize, textRole } from '@/theme/typography';
import { getEnv } from '@/config/env';
import { Screen } from '@/ui/Screen';

async function openStoreListing(): Promise<void> {
  if (Platform.OS === 'android') {
    const packageName = Application.applicationId ?? '';
    try {
      await Linking.openURL(`market://details?id=${packageName}`);
    } catch {
      await Linking.openURL(`https://play.google.com/store/apps/details?id=${packageName}`);
    }
    return;
  }

  const { iosAppStoreId } = getEnv();
  const url = iosAppStoreId ? `itms-apps://apps.apple.com/app/id${iosAppStoreId}` : 'https://apps.apple.com/';
  await Linking.openURL(url);
}

export function UpdateRequiredScreen() {
  const t = useT();
  const { colors, pairing, fonts } = useTheme();
  const heading = textRole(pairing, 'heading');
  const body = textRole(pairing, 'body');

  // T-00-17-03 / D-25: this screen has no dismiss and no back gesture -- the hardware back
  // button on Android must not be able to escape it.
  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => subscription.remove();
  }, []);

  return (
    <Screen>
      <Text style={[styles.heading, heading, { color: colors.ink }]}>{t('update.heading')}</Text>
      <Text style={[styles.body, body, { color: colors.inkMuted }]}>{t('update.body')}</Text>
      <Pressable
        accessibilityRole="button"
        style={[styles.button, { backgroundColor: colors.accent }]}
        onPress={() => {
          void openStoreListing();
        }}
      >
        <Text
          style={[
            styles.buttonLabel,
            { fontFamily: fonts.body[600], fontSize: fontSize.body, color: colors.surface },
          ]}
        >
          {t('update.cta')}
        </Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: {
    marginTop: 40,
  },
  body: {
    marginTop: 12,
  },
  button: {
    marginTop: 26,
    minHeight: space.touchMin,
    borderRadius: radii.pill,
    paddingVertical: space.pillPadV,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonLabel: {
    textAlign: 'center',
  },
});
