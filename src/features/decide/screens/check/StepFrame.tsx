// 06.1-19 (D10, D-18, UX-41): the frame every stepper step sits in. Top bar (back, then the item and price), "Step n of 3", the
// three-segment progress bar, the title (screen-reader focus lands here on each step), "Why we ask:", the content, the primary
// button, "See the answer now" (not on the last step) and the legal footer. A step change slides 220 ms in the direction of
// travel; Reduce Motion cross-fades 150 ms. Nothing is written here.
// 06.1-57 (A-ST-2, X-3, DB-9): the segments carry visible names and done crumbs ("✓ Kind: Car", "✓ Price: $10,020"); the title uses
// the display face (the prototype's H1: 26, line height 1.12). The Android in-app edge swipe (SwipeBack) follows the same Back rule
// as the chevron and the system Back, through setSwipeBackInterceptor, so it never skips past a step to Decide home.
import React, { useCallback, useEffect, useRef } from 'react';
import { AccessibilityInfo, BackHandler, findNodeHandle, Pressable, StyleSheet, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import Animated, { FadeIn, SlideInLeft, SlideInRight } from 'react-native-reanimated';
import { setSwipeBackInterceptor } from '@/features/navigation/swipeBackGesture';
import { useT } from '@/i18n';
import { DURATION, useMotion } from '@/theme/motion';
import { space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { fontSize, textRole } from '@/theme/typography';
import { Pill } from '@/ui/Pill';
import { LINK_HIT_SLOP, usePressFeedback } from '@/ui/pressFeedback';
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
  /** 06.1-57: what step 2 settled, for its done segment on step 3 ("Price: $10,020"). */
  priceLabel?: string | null;
  onBack: () => void;
  /** Opens a done step from its crumb. Absent: crumbs are not buttons. */
  onJump?: (step: StepNumber) => void;
  onNext: () => void;
  nextDisabled?: boolean;
  onSeeNow?: () => void;
  children: React.ReactNode;
}

export function StepFrame({ step, title, why, meta, direction = 'fwd', kindLabel = null, priceLabel = null, onBack, onJump, onNext, nextDisabled = false, onSeeNow, children }: StepFrameProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const { reduced } = useMotion();
  const titleRef = useRef<React.ComponentRef<typeof Text>>(null);

  // 06.1-49 (A-ST-3): the Android system Back goes one step back too, not to Decide home. The steps replace each other, so the stack
  // below a step is Decide home and the app-wide handler would pop straight there. Registered only while the step is focused, so a
  // step left mounted under the answer (pushed) never answers a Back meant for the answer.
  const backRef = useRef(onBack);
  useEffect(() => {
    backRef.current = onBack;
  });
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        backRef.current();
        return true;
      });
      // 06.1-57 (from 06.1-64): the Android in-app edge swipe takes the same Back; the claim is released when the step loses focus.
      const release = setSwipeBackInterceptor(() => {
        backRef.current();
        return true;
      });
      return () => {
        sub.remove();
        release();
      };
    }, [])
  );

  useEffect(() => {
    const handle = titleRef.current === null ? null : findNodeHandle(titleRef.current);
    if (handle !== null) AccessibilityInfo.setAccessibilityFocus(handle);
  }, [step]);

  const entering = reduced
    ? FadeIn.duration(DURATION.searchFade)
    : (direction === 'back' ? SlideInLeft : SlideInRight).duration(DURATION.entrance);
  const kindDone = step > 1 && kindLabel !== null;
  const priceDone = step > 2 && priceLabel !== null;
  const names: [string, string, string] = [
    kindDone ? t('decide.screens.stepper.segKindDone', { kind: kindLabel }) : t('decide.screens.stepper.segKind'),
    priceDone ? t('decide.screens.stepper.segPriceDone', { price: priceLabel }) : t('decide.screens.stepper.segPrice'),
    t('decide.screens.stepper.segRunning'),
  ];
  const labels: [string, string, string] = [
    kindDone ? t('decide.screens.stepper.crumb.kind', { kind: kindLabel }) : names[0],
    priceDone ? t('decide.screens.stepper.crumb.price', { price: priceLabel }) : names[1],
    names[2],
  ];
  const label = { ...textRole(pairing, 'label'), fontSize: fontSize.meta };
  // 06.1-62 (CB-5 / CB-6): the Back chevron and "See the answer now" show a press at once. The chevron keeps its larger 8 dp slop.
  const press = usePressFeedback('row');

  return (
    <Screen scroll form>
      <Animated.View testID="step-frame" entering={entering} style={styles.body}>
        <View style={styles.top}>
          {/* 06.1-49 (A-ST-3, D20): a back chevron (the Row.tsx rotated-border convention, no icon library); "Back" for screen readers. */}
          <Pressable testID="step-back" accessibilityRole="button" accessibilityLabel={t('decide.screens.common.a11y.back')} onPress={onBack} hitSlop={space.gapSm} android_ripple={press.android_ripple} style={({ pressed }) => [styles.target, styles.backTarget, press.pressedStyle(pressed)]}>
            <View testID="step-back-chevron" style={[styles.chevron, { borderColor: colors.accent }]} />
          </Pressable>
          <Text style={{ ...label, color: colors.inkMuted, flexShrink: 1, textAlign: 'right' }}>{meta}</Text>
        </View>
        <Text style={{ ...label, color: colors.inkMuted }}>{t('decide.screens.stepper.stepOf', { step })}</Text>
        <SegmentBar step={step} names={names} labels={labels} onJump={onJump} />
        <Text ref={titleRef} accessibilityRole="header" style={{ ...textRole(pairing, 'display'), fontSize: fontSize.heading, lineHeight: Math.round(fontSize.heading * TITLE_LINE), color: colors.ink }}>
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
            <Pressable
              testID="see-now"
              accessibilityRole="link"
              onPress={onSeeNow}
              hitSlop={LINK_HIT_SLOP}
              android_ripple={press.android_ripple}
              style={({ pressed }) => [styles.target, press.pressedStyle(pressed)]}
            >
              <Text style={{ ...textRole(pairing, 'label'), color: colors.accent }}>{t('decide.screens.stepper.seeAnswerNow')}</Text>
            </Pressable>
          )}
        </View>
        <Text style={{ ...label, color: colors.inkMuted }}>{t('legal.decideAnswer.footer')}</Text>
      </Animated.View>
    </Screen>
  );
}

/** The prototype's H1 line height (D10..D13). */
const TITLE_LINE = 1.12;

const styles = StyleSheet.create({
  body: { gap: space.gapMd, paddingBottom: space.sheetPadBottom },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.gapMd },
  target: { minHeight: space.touchMin, justifyContent: 'center' },
  backTarget: { minWidth: space.touchMin, alignItems: 'flex-start' },
  // Row.tsx's chevron turned to point left.
  chevron: { width: 10, height: 10, borderTopWidth: 2, borderRightWidth: 2, marginLeft: 4, transform: [{ rotate: '-135deg' }] },
  actions: { gap: space.gapSm },
});
