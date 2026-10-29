// 05.2-30 (DSU-15, D-01): the "How are you paid?" card at the top of Activity. It shows only for an account with the
// Decide switch on, no income profile yet, and no "Not now" in the last 14 days. "Set it up" opens the setup stepper in
// standalone mode (the income steps only); "Not now" is a device-local preference, not a data write, so it has no Undo.
import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { useDecideSettings } from '@/data/queries/decide';
import { useDecideAccess } from '@/features/decide/useDecideAccess';
import { useShouldStack } from '@/features/decide/ui/textFit';
import { useRecordContext } from '@/features/record/useRecordContext';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, space } from '@/theme/layout';
import { fontSize, textRole } from '@/theme/typography';
import { Pill } from '@/ui/Pill';
import { Text } from '@/ui/Text';
import { getIncomeCardDismissedAt, incomeCardIsDismissed, setIncomeCardDismissedAt } from './activityViewPrefs';

export const SETUP_STANDALONE_HREF = '/decide/setup?mode=standalone' as Href;

function IncomeCard({ userId }: { userId: string }) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const settings = useDecideSettings(userId);
  const stacked = useShouldStack();
  // undefined: not read yet (the card stays hidden rather than flashing in).
  const [dismissedAt, setDismissedAt] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let live = true;
    void getIncomeCardDismissedAt(userId).then((at) => {
      if (live) setDismissedAt(at);
    });
    return () => {
      live = false;
    };
  }, [userId]);

  const onNotNow = useCallback(() => {
    const now = new Date().toISOString();
    setDismissedAt(now);
    void setIncomeCardDismissedAt(userId, now);
  }, [userId]);

  // Missing = the settings row loaded and holds no income answer (no row at all counts as missing).
  const loaded = settings.isSuccess;
  const profileMissing = loaded && (settings.data === null || settings.data === undefined || settings.data.income_types === null);
  if (!profileMissing || dismissedAt === undefined || incomeCardIsDismissed(dismissedAt, new Date())) return null;

  return (
    <View accessibilityRole="none" style={[styles.card, { backgroundColor: colors.accentTint1 }]}>
      <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.eyebrow, color: colors.inkMuted }}>
        {t('activity.incomeCard.eyebrow')}
      </Text>
      <Text accessibilityRole="header" style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink }}>
        {t('activity.incomeCard.heading')}
      </Text>
      <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.s13_5, color: colors.inkDim }}>
        {t('activity.incomeCard.body')}
      </Text>
      <View style={[styles.actions, stacked ? styles.stacked : null]}>
        <View style={stacked ? null : styles.primary}>
          <Pill
            label={t('activity.incomeCard.cta')}
            variant="primary"
            onPress={() => router.push(SETUP_STANDALONE_HREF)}
          />
        </View>
        <View style={stacked ? null : styles.secondary}>
          <Pill label={t('activity.incomeCard.dismiss')} variant="secondary" onPress={onNotNow} />
        </View>
      </View>
    </View>
  );
}

/** Hidden unless the account has the Decide switch on (D-01); the settings read starts only then. */
export function HowArePaidCard() {
  const { v3 } = useDecideAccess();
  const rc = useRecordContext();
  if (!v3 || rc.userId === null) return null;
  return <IncomeCard userId={rc.userId} />;
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.card,
    paddingVertical: 18,
    paddingHorizontal: space.cardPadLg,
    gap: space.gapMd,
  },
  actions: { flexDirection: 'row', gap: space.gapSm },
  stacked: { flexDirection: 'column' },
  primary: { flex: 2 },
  secondary: { flex: 1 },
});
