// D-17: the one-screen, equal-weight analytics consent prompt. No dark patterns: both
// choices are the same size and position, neither is pre-selected, and there is no
// close/skip control other than the two choices themselves.
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Redirect } from 'expo-router';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { space, radii } from '@/theme/layout';
import { fontSize } from '@/theme/typography';
import { Screen } from '@/ui/Screen';
import { useConsent } from './useConsent';

export function ConsentScreen() {
  const t = useT();
  const { colors, fonts } = useTheme();
  const { grant, decline } = useConsent();
  const [status, setStatus] = useState<'idle' | 'busy' | 'done'>('idle');

  const handleShare = useCallback(async () => {
    setStatus('busy');
    // Only leave the screen once the answer is saved (and so already visible to the (app)
    // layout's gate) -- redirecting on a failed write would bounce straight back here.
    setStatus((await grant()) ? 'done' : 'idle');
  }, [grant]);

  const handleDecline = useCallback(async () => {
    setStatus('busy');
    setStatus((await decline()) ? 'done' : 'idle');
  }, [decline]);

  if (status === 'done') {
    return <Redirect href="/you" />;
  }

  return (
    <Screen scroll>
      <Text style={[styles.heading, { fontFamily: fonts.body[700], color: colors.ink }]}>
        {t('consent.heading')}
      </Text>
      <Text style={[styles.body, { fontFamily: fonts.body[500], color: colors.inkMuted }]}>
        {t('consent.body')}
      </Text>

      <View style={[styles.card, { backgroundColor: colors.surface }]}>
        <Text style={[styles.cardTitle, { fontFamily: fonts.body[600], color: colors.inkDim }]}>
          {t('consent.neverSentHeading')}
        </Text>
        <Text style={[styles.row, styles.rowFirst, { fontFamily: fonts.body[500], color: colors.ink }]}>
          {t('consent.neverSent.amounts')}
        </Text>
        <Text style={[styles.row, { fontFamily: fonts.body[500], color: colors.ink }]}>
          {t('consent.neverSent.payees')}
        </Text>
        <Text style={[styles.row, { fontFamily: fonts.body[500], color: colors.ink }]}>
          {t('consent.neverSent.accounts')}
        </Text>
        <Text style={[styles.row, { fontFamily: fonts.body[500], color: colors.ink }]}>
          {t('consent.neverSent.notes')}
        </Text>
        <Text style={[styles.row, { fontFamily: fonts.body[500], color: colors.ink }]}>
          {t('consent.neverSent.identity')}
        </Text>
      </View>

      <View style={styles.buttons}>
        <Pressable
          testID="consent-share"
          accessibilityRole="button"
          disabled={status === 'busy'}
          onPress={() => {
            void handleShare();
          }}
          style={[styles.pill, { backgroundColor: colors.accent }]}
        >
          <Text style={[styles.pillLabel, { fontFamily: fonts.body[600], color: colors.surface }]}>
            {t('consent.share')}
          </Text>
        </Pressable>
        <Pressable
          testID="consent-decline"
          accessibilityRole="button"
          disabled={status === 'busy'}
          onPress={() => {
            void handleDecline();
          }}
          style={[styles.pill, styles.pillOutline, { borderColor: colors.line3 }]}
        >
          <Text style={[styles.pillLabel, { fontFamily: fonts.body[600], color: colors.ink }]}>
            {t('consent.decline')}
          </Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: {
    fontSize: fontSize.heading,
    lineHeight: fontSize.heading * 1.16,
    letterSpacing: fontSize.heading * -0.01,
  },
  body: {
    marginTop: space.gapMd,
    fontSize: fontSize.body,
    lineHeight: fontSize.body * 1.5,
  },
  card: {
    marginTop: space.groupGap,
    borderRadius: radii.card,
    padding: space.cardPad,
  },
  cardTitle: {
    fontSize: fontSize.label,
    lineHeight: fontSize.label * 1.4,
    letterSpacing: fontSize.label * 0.11,
    textTransform: 'uppercase',
  },
  row: {
    marginTop: space.gapSm,
    fontSize: fontSize.body,
    lineHeight: fontSize.body * 1.5,
  },
  rowFirst: {
    marginTop: space.gapMd,
  },
  buttons: {
    marginTop: space.groupGap,
    gap: space.gapMd,
  },
  pill: {
    width: '100%',
    minHeight: space.touchMin + 6,
    borderRadius: radii.pill,
    paddingVertical: space.pillPadV,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillOutline: {
    borderWidth: 1.5,
  },
  pillLabel: {
    fontSize: fontSize.body,
  },
});
