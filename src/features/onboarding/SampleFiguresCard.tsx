// 09-24 (UI-SPEC 4, D-17b): the one-time `fill1` card above the sample Decide answer. `view` glyph, one sentence saying the
// figures are sample figures, and the link "Explore the app", which hides the card for good on this phone and goes Home.
// Renders only in sample mode (plan status 'sample', plan loaded). Copy: onboarding.sample.card / onboarding.sample.explore.
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/features/auth/AuthProvider';
import { usePlanState } from '@/features/plans/usePlanState';
import { PlanLink } from '@/features/plans/components/NoticeCard';
import { APP_HOME_HREF } from '@/features/auth/appHome';
import { useT } from '@/i18n';
import { Text } from '@/ui/Text';
import { Glyph } from '@/ui/icons/Glyph';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, space } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { loadSampleCardDone, markSampleCardDone } from './sampleFlags';

export function SampleFiguresCard(): React.JSX.Element | null {
  const t = useT();
  const { colors, pairing } = useTheme();
  const plan = usePlanState();
  const { user } = useAuth();
  const userId = user?.id ?? null;
  // null: not read yet (draw nothing, so the card never flashes for someone who already put it away).
  const [done, setDone] = useState<boolean | null>(null);

  useEffect(() => {
    if (userId === null) return;
    let live = true;
    void loadSampleCardDone(userId).then((v) => {
      if (live) setDone(v);
    });
    return () => {
      live = false;
    };
  }, [userId]);

  if (plan.loading || plan.status !== 'sample' || userId === null || done !== false) return null;

  const explore = (): void => {
    setDone(true);
    void markSampleCardDone(userId);
    router.navigate(APP_HOME_HREF);
  };

  return (
    <View testID="sample-figures-card" style={[styles.card, { backgroundColor: colors.fill1 }]}>
      <View style={styles.row}>
        <Glyph name="view" size={20} color={colors.inkDim} />
        <Text style={{ ...textRole(pairing, 'body'), color: colors.ink, flexShrink: 1 }}>{t('onboarding.sample.card')}</Text>
      </View>
      <PlanLink label={t('onboarding.sample.explore')} onPress={explore} testID="sample-figures-explore" />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, padding: space.cardPad, gap: space.gapSm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.gapSm },
});
