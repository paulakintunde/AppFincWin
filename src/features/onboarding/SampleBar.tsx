// 09-24 (UI-SPEC 4, D-01, D-17b, D-28): the pinned Sample bar of the pre-trial look-around. Sits in the tab bar's slot, directly
// above the tab bar, on every tab. `fill1`, `view` glyph and the word "Sample", sub-line "Free for 14 days", primary Pill
// "Start 14-day free trial" (hapticTap, the only haptic in the look-around) and under it the link "Choose a different plan";
// both open the Plans screen in first-run mode (trigger 'sample_bar'). There is no other way into the app on one's own data.
// The row is 64 high at font scale 1.0 and grows to two lines at large scales. It is laid out in flow above the tab bar, so screen
// content ends above it; its height is reported to the shell (sampleBarHeight) so the FAB and toasts sit above it too.
// Renders only when the plan is loaded and its status is 'sample'.
import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { usePlanState } from '@/features/plans/usePlanState';
import { PlanLink } from '@/features/plans/components/NoticeCard';
import { plansHref } from '@/features/plans/routes';
import { useT } from '@/i18n';
import { useShellLayout } from '@/shell/layout/ShellLayoutProvider';
import { Pill } from '@/ui/Pill';
import { Text } from '@/ui/Text';
import { Glyph } from '@/ui/icons/Glyph';
import { hapticTap } from '@/ui/haptics';
import { useTheme } from '@/theme/ThemeProvider';
import { rowHeight, space } from '@/theme/layout';
import { textRole } from '@/theme/typography';

export const SAMPLE_BAR_HREF = plansHref({ mode: 'first_run', trigger: 'sample_bar' });

export function SampleBar(): React.JSX.Element | null {
  const t = useT();
  const { colors, pairing } = useTheme();
  const plan = usePlanState();
  const { setSampleBarHeight } = useShellLayout();
  const shown = !plan.loading && plan.status === 'sample';

  // Gone means no space: the FAB and toasts drop back onto the tab bar.
  useEffect(() => {
    if (!shown) setSampleBarHeight(0);
  }, [shown, setSampleBarHeight]);
  useEffect(() => () => setSampleBarHeight(0), [setSampleBarHeight]);

  if (!shown) return null;

  const start = (): void => {
    hapticTap();
    router.push(SAMPLE_BAR_HREF);
  };

  return (
    <View
      testID="sample-bar"
      onLayout={(e) => setSampleBarHeight(e.nativeEvent.layout.height)}
      style={[styles.bar, { backgroundColor: colors.fill1, borderTopColor: colors.line2 }]}
    >
      <View style={styles.row}>
        <View style={styles.words}>
          <View style={styles.wordRow}>
            <Glyph name="view" size={16} color={colors.inkDim} />
            <Text style={{ ...textRole(pairing, 'bodyStrong'), color: colors.ink }}>{t('onboarding.sample.bar.word')}</Text>
          </View>
          <Text style={{ ...textRole(pairing, 'label'), color: colors.inkDim }}>{t('onboarding.sample.bar.sub')}</Text>
        </View>
        <View style={styles.actions}>
          <Pill
            label={t('onboarding.sample.bar.start')}
            variant="primary"
            accessibilityLabel={t('onboarding.sample.bar.readerLabel')}
            onPress={start}
          />
          <PlanLink label={t('onboarding.sample.differentPlan')} onPress={() => router.push(SAMPLE_BAR_HREF)} testID="sample-bar-plans" />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    paddingHorizontal: space.screenH,
    paddingVertical: space.gapSm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  row: { minHeight: rowHeight.two - 2 * space.gapSm, flexDirection: 'row', alignItems: 'center', gap: space.gapMd },
  words: { flex: 1, gap: 2 },
  wordRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actions: { alignItems: 'flex-end', flexShrink: 1 },
});
