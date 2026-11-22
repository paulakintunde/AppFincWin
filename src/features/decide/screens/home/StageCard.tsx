// 08.1-21 (DCU-10, UI-SPEC section 1 "StageCard"): "What answers rest on", directly under Your month. At the first read and full
// stages it shows a stage chip (fill1 + ink, never a state colour), one sentence, progress to 1 and 3 months, the months-complete
// line and the import prompt. At 3 or more months it shows only the title and the every-part-on sentence (owner answer, planning
// 2026-11-18): no chip, no bar, no prompt. When the months rise: one polite announcement, the chip cross-fades (at once under
// Reduce Motion), no haptic.
import React, { useEffect, useRef } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import Animated, { ReduceMotion, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { STAGE_DEEPER_MIN_MONTHS, type StageReading } from '@/engine/decide/v3';
import { useT } from '@/i18n';
import { radii, space } from '@/theme/layout';
import { DURATION, EASING, useMotion } from '@/theme/motion';
import { useTheme } from '@/theme/ThemeProvider';
import { shadows } from '@/theme/tokens';
import { textRole } from '@/theme/typography';
import { ProgressBar } from '@/ui/ProgressBar';
import { Text } from '@/ui/Text';
import { ImportPromptRow } from '../ui/ImportPromptRow';

export interface StageCardProps {
  reading: StageReading;
  monthsTotal: number;
  onImport: () => void;
}

/** The stage chip: the word cross-fades over DURATION.searchFade when it changes; with Reduce Motion it swaps at once. */
function StageChip({ word }: { word: string }): React.JSX.Element {
  const { colors, pairing } = useTheme();
  const motion = useMotion();
  const opacity = useSharedValue(1);
  const last = useRef(word);
  const duration = motion.duration(DURATION.searchFade);
  useEffect(() => {
    if (last.current === word) return;
    last.current = word;
    if (duration === 0) {
      opacity.value = 1;
      return;
    }
    opacity.value = 0;
    opacity.value = withTiming(1, { duration, easing: EASING, reduceMotion: ReduceMotion.Never });
  }, [word, duration, opacity]);
  const animated = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View testID="stage-chip" style={[styles.chip, { backgroundColor: colors.fill1 }, animated]}>
      <Text style={{ ...textRole(pairing, 'label'), color: colors.ink }}>{word}</Text>
    </Animated.View>
  );
}

export function StageCard({ reading, monthsTotal, onImport }: StageCardProps): React.JSX.Element {
  const t = useT();
  const { colors, pairing } = useTheme();
  const { stage, monthsUsed } = reading;
  const deeper = stage === 'deeper';
  const word = deeper ? '' : t(`decide.screens.stage.word.${stage}`);

  // One polite announcement when the months rise; none on first mount, no haptic.
  const lastMonths = useRef(monthsUsed);
  useEffect(() => {
    const before = lastMonths.current;
    lastMonths.current = monthsUsed;
    if (monthsUsed <= before) return;
    if (monthsUsed >= STAGE_DEEPER_MIN_MONTHS) {
      AccessibilityInfo.announceForAccessibility(t('decide.screens.stage.card.announceDeeper', { monthsUsed }));
      return;
    }
    const stageWord = t(`decide.screens.stage.word.full`);
    AccessibilityInfo.announceForAccessibility(t('decide.screens.stage.card.announce', { count: monthsUsed, stage: stageWord }));
  }, [monthsUsed, t]);

  const label = deeper
    ? t('decide.screens.stage.card.a11yDeeper', { monthsUsed })
    : t('decide.screens.stage.card.a11y', { stage: word, monthsUsed });

  return (
    <View testID="stage-card" style={[styles.card, shadows.card, { backgroundColor: colors.surface }]}>
      <View accessible accessibilityLabel={label} style={styles.head}>
        <View style={styles.titleRow}>
          <Text accessibilityRole="header" style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink, flexShrink: 1 }}>
            {t('decide.screens.stage.card.title')}
          </Text>
          {deeper ? null : <StageChip word={word} />}
        </View>
        <Text style={{ ...textRole(pairing, 'body'), color: colors.inkDim }}>
          {t(`decide.screens.stage.card.${stage}`, { months: monthsUsed })}
        </Text>
      </View>
      {deeper ? null : (
        <>
          <View
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel={t('decide.screens.stage.card.barA11y', { monthsUsed, stage: word })}
            accessibilityValue={{ min: 0, max: STAGE_DEEPER_MIN_MONTHS, now: monthsUsed }}
            style={styles.bar}
          >
            <ProgressBar percent={(Math.min(monthsUsed, STAGE_DEEPER_MIN_MONTHS) / STAGE_DEEPER_MIN_MONTHS) * 100} variant="thin" tickPercent={100 / STAGE_DEEPER_MIN_MONTHS} />
            <View style={styles.ends}>
              <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted, flexShrink: 1 }}>{t('decide.screens.stage.card.tickLabel')}</Text>
              <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted, flexShrink: 1, textAlign: 'right' }}>
                {t('decide.screens.stage.card.endLabel')}
              </Text>
            </View>
          </View>
          <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>
            {t('decide.screens.home.records.complete', { monthsUsed, monthsTotal })}
          </Text>
          <ImportPromptRow monthsUsed={monthsUsed} onPress={onImport} />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, padding: space.cardPad, gap: space.gapMd },
  head: { gap: space.gapSm },
  titleRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: space.gapSm },
  chip: { borderRadius: radii.pill, paddingHorizontal: space.gapMd, paddingVertical: space.gapSm / 2 },
  bar: { gap: space.gapSm },
  ends: { flexDirection: 'row', justifyContent: 'space-between', gap: space.gapSm },
});
