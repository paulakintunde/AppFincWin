// 09-21 UI-SPEC 2: the chrome around every question. Back chevron (hidden on question 1), "n of total", "Skip the rest",
// a thin progress bar, heading, sub, content, a "Why this matters" link, and a pinned footer with Continue and
// "Skip this question" (both always present, D-27). Partner mode adds the privacy line under the title.
import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, findNodeHandle, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Text } from '@/ui/Text';
import { Pill } from '@/ui/Pill';
import { ProgressBar } from '@/ui/ProgressBar';
import { Screen } from '@/ui/Screen';
import { Glyph } from '@/ui/icons/Glyph';
import { LINK_HIT_SLOP } from '@/ui/pressFeedback';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';
import { useReduceMotion } from '@/theme/motion';
import { textRole } from '@/theme/typography';
import { useCopy } from './useCopy';

/** How long after a new question appears its heading takes screen-reader focus (after the 150 ms fade, once TalkBack settles). */
export const HEADING_FOCUS_DELAY_MS = 500;

export interface QuestionScreenProps {
  /** Question number and how many there are (11, or 9 for the partner version). */
  progress: { n: number; total: number };
  title: string;
  sub?: string;
  /** The one `meta` sentence the "Why this matters" link reveals. Omitted when the body draws its own (shared income steps). */
  why?: string;
  partner?: boolean;
  /** Who pays for the household, for the privacy line. Supplied by the caller (09-23). */
  payerName?: string;
  canGoBack: boolean;
  canContinue: boolean;
  onBack: () => void;
  onContinue: () => void;
  onSkip: () => void;
  onSkipRest: () => void;
  /** Re-run only (UI-SPEC 2d): "Keep what I have" at the top right changes nothing. */
  onKeep?: () => void;
  /** Keys the cross-fade so each question fades in. */
  stepKey: string;
  children: React.ReactNode;
}

function TextLink({ label, onPress, testID, align }: { label: string; onPress: () => void; testID?: string; align?: 'center' }) {
  const { colors, pairing } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="link"
      accessibilityLabel={label}
      hitSlop={LINK_HIT_SLOP}
      onPress={onPress}
      style={[styles.link, align === 'center' ? styles.linkCenter : null]}
    >
      <Text style={{ ...textRole(pairing, 'label'), color: colors.accent }}>{label}</Text>
    </Pressable>
  );
}

export function QuestionScreen({
  progress,
  title,
  sub,
  why,
  partner = false,
  payerName,
  canGoBack,
  canContinue,
  onBack,
  onContinue,
  onSkip,
  onSkipRest,
  onKeep,
  stepKey,
  children,
}: QuestionScreenProps) {
  const t = useCopy();
  const { colors, pairing } = useTheme();
  const reduced = useReduceMotion();
  const [whyOpen, setWhyOpen] = useState<string | null>(null);
  const showWhy = whyOpen === stepKey;
  const label = t('onboarding.chrome.progress', { n: progress.n, total: progress.total });

  // 09-25 A7 (TalkBack device check): focus started on "1 of 11" and stayed put after Continue or Skip, so a screen-reader
  // user heard nothing until they tapped. Each new question moves focus to its heading. Device check on the Pixel 9: a call in
  // the same frame as the new question loses to TalkBack's own placement (focus stayed on "1 of 11" / "Skip this question"),
  // so the move waits until the question has faded in and TalkBack has settled.
  const titleRef = useRef<React.ElementRef<typeof Text>>(null);
  useEffect(() => {
    const timer = setTimeout(() => {
      const handle = titleRef.current === null ? null : findNodeHandle(titleRef.current);
      if (handle !== null) AccessibilityInfo.setAccessibilityFocus(handle);
    }, HEADING_FOCUS_DELAY_MS);
    return () => clearTimeout(timer);
  }, [stepKey]);

  return (
    <Screen>
      <View style={styles.top}>
        <View style={styles.backSlot}>
          {canGoBack ? (
            <Pressable
              testID="onb-back"
              accessibilityRole="button"
              accessibilityLabel={t('onboarding.chrome.back')}
              hitSlop={LINK_HIT_SLOP}
              onPress={onBack}
              style={styles.back}
            >
              <View style={styles.flip}>
                <Glyph name="arrowRight" size={20} color={colors.ink} />
              </View>
            </Pressable>
          ) : null}
        </View>
        <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{label}</Text>
        <View style={styles.skipRest}>
          <TextLink testID="onb-skip-rest" label={t('onboarding.chrome.skipRest')} onPress={onSkipRest} />
        </View>
      </View>
      {onKeep ? (
        <View style={styles.keepRow}>
          <TextLink testID="onb-keep" label={t('onboarding.summary.keep')} onPress={onKeep} />
        </View>
      ) : null}
      <ProgressBar
        percent={(progress.n / progress.total) * 100}
        accessibilityLabel={`Question ${progress.n} of ${progress.total}`}
      />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        <Animated.View key={stepKey} {...(reduced ? {} : { entering: FadeIn.duration(150) })} style={styles.body}>
          <Text
            ref={titleRef}
            accessibilityRole="header"
            accessibilityLabel={`${/[?!.]$/.test(title) ? title : `${title}.`} ${label}`}
            style={{ ...textRole(pairing, 'heading'), color: colors.ink }}
          >
            {title}
          </Text>
          {partner ? (
            <Text testID="onb-private" style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>
              {t('onboarding.partner.private', { payer: payerName ?? 'the account owner' })}
            </Text>
          ) : null}
          {sub ? <Text style={{ ...textRole(pairing, 'body'), color: colors.inkMuted }}>{sub}</Text> : null}
          <View style={styles.content}>{children}</View>
          {why ? (
            <View>
              <TextLink
                testID="onb-why"
                label={t('onboarding.chrome.why')}
                onPress={() => setWhyOpen(showWhy ? null : stepKey)}
              />
              {showWhy ? (
                <Text testID="onb-why-text" style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>
                  {why}
                </Text>
              ) : null}
            </View>
          ) : null}
        </Animated.View>
      </ScrollView>
      <View style={styles.footer}>
        <Pill label={t('onboarding.chrome.continue')} variant="primary" disabled={!canContinue} onPress={onContinue} />
        <TextLink testID="onb-skip" label={t('onboarding.chrome.skipQuestion')} onPress={onSkip} align="center" />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44, gap: space.gapSm },
  backSlot: { width: 44, alignItems: 'flex-start' },
  back: { minWidth: 44, minHeight: 44, justifyContent: 'center' },
  keepRow: { alignItems: 'flex-end' },
  flip: { transform: [{ rotate: '180deg' }] },
  skipRest: { minWidth: 44, alignItems: 'flex-end' },
  link: { minHeight: 44, justifyContent: 'center' },
  linkCenter: { alignItems: 'center' },
  scroll: { flex: 1 },
  scrollContent: { paddingVertical: space.groupGap },
  body: { gap: space.gapMd },
  content: { marginTop: space.gapSm },
  footer: { gap: space.gapSm, paddingTop: space.gapMd },
});
