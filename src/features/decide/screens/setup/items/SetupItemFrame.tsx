// 06.1-24 (D32 to D37 frame): the one frame every setup item screen sits in. Plan 24 builds items 1 and 2 on it; plan 25 builds items
// 3 to 6 on the same props, so keep it generic.
//
//   top row    Back (left), "Save and close" (right: goes back to the checklist and keeps whatever was already saved)
//   title      the item name, in place of "Step x of y" (items are not in order); screen-reader focus lands here
//   why        "Why we ask:" + the reason
//   children   the item's own content
//   primary    named for what it saves ("Save pay details"); a light haptic plays on press
//   footer     optional, under the primary (a note, a link)
//
// The frame writes nothing. Each item decides what the primary does and what "Save and close" leaves behind: nothing is held in
// a draft, so a figure only stays once it was saved by a sheet or by the primary.
import React, { useEffect, useRef } from 'react';
import { AccessibilityInfo, findNodeHandle, Pressable, StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { usePerfMount } from '@/features/decide/perf/perfMarks';
import { useT } from '@/i18n';
import { space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { fontSize, textRole } from '@/theme/typography';
import { hapticLight } from '@/ui/haptics';
import { Pill } from '@/ui/Pill';
import { Screen } from '@/ui/Screen';
import { Text } from '@/ui/Text';

/** The checklist every item returns to. */
export const SETUP_HOME = '/decide/setup' as Href;

/**
 * 06.1-50 (C-6): how every item leaves, on save, "Save and close" and Back. It pops back to the one checklist already in the stack
 * instead of stacking another copy (which made Back look dead). When the checklist is not in the stack (a deep link straight to an
 * item), expo-router's dismissTo replaces the current screen with it, so the user still lands on one checklist.
 */
export function useLeaveToChecklist(): () => void {
  const router = useRouter();
  return () => router.dismissTo(SETUP_HOME);
}

export interface SetupItemFrameProps {
  /** The item name, e.g. "Pay and payday". */
  title: string;
  /** The reason after "Why we ask:". */
  why: string;
  primaryLabel: string;
  primaryDisabled?: boolean;
  onPrimary: () => void;
  onBack: () => void;
  onSaveAndClose: () => void;
  /** Drawn under the primary button. */
  footer?: React.ReactNode;
  children: React.ReactNode;
}

export function SetupItemFrame({ title, why, primaryLabel, primaryDisabled = false, onPrimary, onBack, onSaveAndClose, footer, children }: SetupItemFrameProps) {
  usePerfMount('setupItem.mount'); // 06.1-72: perf builds only
  const t = useT();
  const { colors, pairing } = useTheme();
  const titleRef = useRef<React.ComponentRef<typeof Text>>(null);

  useEffect(() => {
    const handle = titleRef.current === null ? null : findNodeHandle(titleRef.current);
    if (handle !== null) AccessibilityInfo.setAccessibilityFocus(handle);
  }, []);

  const label = { ...textRole(pairing, 'label'), fontSize: fontSize.meta };
  return (
    <Screen scroll form>
      <View testID="setup-item-frame" style={styles.body}>
        <View style={styles.top}>
          <Pressable testID="item-back" accessibilityRole="button" accessibilityLabel={t('decide.screens.common.a11y.back')} onPress={onBack} style={styles.target}>
            <Text style={{ ...textRole(pairing, 'label'), color: colors.accent }}>{t('decide.screens.common.back')}</Text>
          </Pressable>
          <Pressable testID="item-save-close" accessibilityRole="button" onPress={onSaveAndClose} style={styles.target}>
            <Text style={{ ...textRole(pairing, 'label'), color: colors.accent, textAlign: 'right' }}>{t('decide.screens.common.saveAndClose')}</Text>
          </Pressable>
        </View>
        <Text ref={titleRef} accessibilityRole="header" style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink }}>
          {title}
        </Text>
        <Text style={{ ...label, color: colors.inkMuted }}>
          <Text style={{ ...label, color: colors.inkDim }}>{t('decide.screens.common.whyWeAsk')} </Text>
          {why}
        </Text>
        {children}
        <View style={styles.actions}>
          <Pill
            variant="primary"
            label={primaryLabel}
            disabled={primaryDisabled}
            onPress={() => {
              hapticLight();
              onPrimary();
            }}
          />
          {footer}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { gap: space.gapMd, paddingBottom: space.sheetPadBottom },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.gapMd },
  target: { minHeight: space.touchMin, justifyContent: 'center' },
  actions: { gap: space.gapSm },
});
