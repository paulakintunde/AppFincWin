// 06.1-19 (D10, D-18, UX-41): the frame every stepper step sits in. Top bar (back, then the item and price), "Step n of 3", the
// three-segment progress bar, the title (screen-reader focus lands here on each step), "Why we ask:", the content, the primary
// button, "See the answer now" (not on the last step) and the legal footer. A step change slides 220 ms in the direction of
// travel; Reduce Motion cross-fades 150 ms. Nothing is written here.
import React, { useEffect, useRef } from 'react';
import { AccessibilityInfo, findNodeHandle, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, SlideInLeft, SlideInRight } from 'react-native-reanimated';
import { useT } from '@/i18n';
import { DURATION, useMotion } from '@/theme/motion';
import { space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { fontSize, textRole } from '@/theme/typography';
import { Pill } from '@/ui/Pill';
import { Screen } from '@/ui/Screen';
import { Text } from '@/ui/Text';
import { SegmentBar } from './SegmentBar';
import type { StepNumber } from './useStepCheck';

export interface StepFrameProps {
  step: StepNumber;
  title: string;
  why: string;
  /** The item and price as written, "Laptop · $1,200". */
  meta: string;
  /** 'back' when the user arrived by going back. */
  direction?: 'fwd' | 'back';
  /** The kind picked on step 1, for the done segment ("Kind: Car"). */
  kindLabel?: string | null;
  onBack: () => void;
  onJump: (step: StepNumber) => void;
  onNext: () => void;
  nextDisabled?: boolean;
  onSeeNow?: () => void;
  children: React.ReactNode;
}

export function StepFrame({ step, title, why, meta, direction = 'fwd', kindLabel = null, onBack, onJump, onNext, nextDisabled = false, onSeeNow, children }: StepFrameProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const { reduced } = useMotion();
  const titleRef = useRef<React.ComponentRef<typeof Text>>(null);

  useEffect(() => {
    const handle = titleRef.current === null ? null : findNodeHandle(titleRef.current);
    if (handle !== null) AccessibilityInfo.setAccessibilityFocus(handle);
  }, [step]);

  const entering = reduced
    ? FadeIn.duration(DURATION.searchFade)
    : (direction === 'back' ? SlideInLeft : SlideInRight).duration(DURATION.entrance);
  const names: [string, string, string] = [
    kindLabel === null ? t('decide.screens.stepper.segKind') : t('decide.screens.stepper.segKindDone', { kind: kindLabel }),
    t('decide.screens.stepper.segPrice'),
    t('decide.screens.stepper.segRunning'),
  ];
  const label = { ...textRole(pairing, 'label'), fontSize: fontSize.meta };

  return (
    <Screen scroll form>
      <Animated.View testID="step-frame" entering={entering} style={styles.body}>
        <View style={styles.top}>
          <Pressable testID="step-back" accessibilityRole="button" accessibilityLabel={t('decide.screens.common.a11y.back')} onPress={onBack} style={styles.target}>
            <Text style={{ ...textRole(pairing, 'label'), color: colors.accent }}>{t('decide.screens.common.back')}</Text>
          </Pressable>
          <Text style={{ ...label, color: colors.inkMuted, flexShrink: 1, textAlign: 'right' }}>{meta}</Text>
        </View>
        <Text style={{ ...label, color: colors.inkMuted }}>{t('decide.screens.stepper.stepOf', { step })}</Text>
        <SegmentBar step={step} names={names} onJump={onJump} />
        <Text ref={titleRef} accessibilityRole="header" style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink }}>
          {title}
        </Text>
        <Text style={{ ...label, color: colors.inkMuted }}>
          <Text style={{ ...label, color: colors.inkDim }}>{t('decide.screens.common.whyWeAsk')} </Text>
          {why}
        </Text>
        {children}
        <View style={styles.actions}>
          <Pill variant="primary" label={step === 3 ? t('decide.screens.stepper.seeAnswer') : t('decide.screens.common.next')} disabled={nextDisabled} onPress={onNext} />
          {onSeeNow === undefined ? null : (
            <Pressable testID="see-now" accessibilityRole="link" onPress={onSeeNow} style={styles.target}>
              <Text style={{ ...textRole(pairing, 'label'), color: colors.accent }}>{t('decide.screens.stepper.seeAnswerNow')}</Text>
            </Pressable>
          )}
        </View>
        <Text style={{ ...label, color: colors.inkMuted }}>{t('legal.decideAnswer.footer')}</Text>
      </Animated.View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { gap: space.gapMd, paddingBottom: space.sheetPadBottom },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.gapMd },
  target: { minHeight: space.touchMin, justifyContent: 'center' },
  actions: { gap: space.gapSm },
});
