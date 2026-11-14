// 06.1-24 (D32 to D37 frame): the one frame every setup item screen sits in. Plan 24 builds items 1 and 2 on it; plan 25 builds items
// 3 to 6 on the same props, so keep it generic.
//
//   top row    Back chevron (left), "Save and close" (right)
//   title      the item name, in place of "Step x of y" (items are not in order); screen-reader focus lands here
//   why        "Why we ask:" + the reason
//   children   the item's own content
//   primary    named for what it saves ("Save pay details"); a light haptic plays on press
//   footer     optional, under the primary (a note, a link)
//
// The frame writes nothing itself. Each item passes `onSave` (its save, without leaving) and `onLeave` (useLeaveItem).
// 06.1-65 (FQ4, CC-6): the primary and "Save and close" run the same `onSave`. "Save and close" saves only when the item says it
// has unsaved input (`dirty`); with nothing typed it just closes. Dirty input the item cannot save yet (primary disabled) keeps
// the item open, where its NeedLine says what is missing. `onSave` returning false (or resolving false) keeps the item open too.
// 06.1-65 (DN-12, DB-12): Back is the checklist's chevron with a 48 dp target, not the word Back at 32 x 44.
// 06.1-81 (review item 5): a "Save and close" that cannot save yet is never silent: a warning haptic plays, and the item's NeedLine
// (`need`, drawn under the primary) is read out and takes screen-reader focus. No new words: the line's own text is used.
import React, { useCallback, useEffect, useRef } from 'react';
import { AccessibilityInfo, findNodeHandle, Pressable, StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { usePerfMount } from '@/features/decide/perf/perfMarks';
import { useT } from '@/i18n';
import { space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { fontSize, textRole } from '@/theme/typography';
import { hapticLight, hapticWarning } from '@/ui/haptics';
import { Pill } from '@/ui/Pill';
import { Screen } from '@/ui/Screen';
import { Text } from '@/ui/Text';
import { NeedLine } from '@/features/decide/screens/ui/NeedLine';

/** The checklist a deep-linked item lands on when there is nothing to go back to. */
export const SETUP_HOME = '/decide/setup' as Href;

/** 06.1-65 (DN-12 / DB-12): the Back target, larger than the 44 dp minimum, as the device walk asked. */
export const ITEM_BACK_TARGET = 48;

/**
 * 06.1-65 (FQ1, CN-2): how every item leaves, on Back, on save and on "Save and close". It goes back to the screen it was opened
 * from (the checklist, the answer or Decide home). Only with no history (a deep link straight to an item) does it land on the
 * checklist, through dismissTo, so there is still exactly one checklist (06.1-50 C-6). It never pushes another item or checklist.
 */
export function useLeaveItem(): () => void {
  const router = useRouter();
  return useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.dismissTo(SETUP_HOME);
  }, [router]);
}

/** What an item's save returns: false keeps the item open (nothing saved, or a message to read first). */
export type ItemSaveResult = boolean | void;

export interface SetupItemFrameProps {
  /** The item name, e.g. "Pay and payday". */
  title: string;
  /** The reason after "Why we ask:". */
  why: string;
  primaryLabel: string;
  primaryDisabled?: boolean;
  /** The item's save, without leaving. Run by the primary and, when `dirty`, by "Save and close". */
  onSave: () => ItemSaveResult | Promise<ItemSaveResult>;
  /** Leaves the item (useLeaveItem): Back, and after a save that did not return false. */
  onLeave: () => void;
  /** True when something typed on this page is not saved yet. Every write made in a sheet is already saved. */
  dirty?: boolean;
  /** "Save and close" with nothing unsaved; defaults to `onLeave`. */
  onSaveAndClose?: () => void;
  /** 06.1-81: the NeedLine text (what the disabled primary still waits for), drawn under the primary; null draws nothing. */
  need?: string | null;
  /** Drawn under the primary button (and its NeedLine). */
  footer?: React.ReactNode;
  children: React.ReactNode;
}

export function SetupItemFrame({ title, why, primaryLabel, primaryDisabled = false, onSave, onLeave, dirty = false, onSaveAndClose, need = null, footer, children }: SetupItemFrameProps) {
  usePerfMount('setupItem.mount'); // 06.1-72: perf builds only
  const t = useT();
  const { colors, pairing } = useTheme();
  const titleRef = useRef<React.ComponentRef<typeof Text>>(null);
  const needRef = useRef<React.ComponentRef<typeof Text>>(null);

  useEffect(() => {
    const handle = titleRef.current === null ? null : findNodeHandle(titleRef.current);
    if (handle !== null) AccessibilityInfo.setAccessibilityFocus(handle);
  }, []);

  const saveThenLeave = (): void => {
    const result = onSave();
    if (result instanceof Promise) {
      void result.then((r) => {
        if (r !== false) onLeave();
      });
    } else if (result !== false) {
      onLeave();
    }
  };
  const saveAndClose = (): void => {
    if (!dirty) {
      (onSaveAndClose ?? onLeave)();
      return;
    }
    // Typed input that cannot be saved yet: stay, and say so (warning haptic; the NeedLine is read out and focused).
    if (primaryDisabled) {
      hapticWarning();
      if (need !== null && need !== '') {
        AccessibilityInfo.announceForAccessibility(need);
        const handle = needRef.current === null ? null : findNodeHandle(needRef.current);
        if (handle !== null) AccessibilityInfo.setAccessibilityFocus(handle);
      }
      return;
    }
    saveThenLeave();
  };

  const label = { ...textRole(pairing, 'label'), fontSize: fontSize.meta };
  return (
    <Screen scroll form>
      <View testID="setup-item-frame" style={styles.body}>
        <View style={styles.top}>
          <Pressable testID="item-back" accessibilityRole="button" accessibilityLabel={t('decide.screens.common.a11y.back')} onPress={onLeave} hitSlop={space.gapSm} style={styles.backTarget}>
            <View testID="item-back-chevron" style={[styles.chevron, { borderColor: colors.accent }]} />
          </Pressable>
          <Pressable testID="item-save-close" accessibilityRole="button" onPress={saveAndClose} style={styles.target}>
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
              saveThenLeave();
            }}
          />
          <NeedLine ref={needRef} text={need} />
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
  backTarget: { minHeight: ITEM_BACK_TARGET, minWidth: ITEM_BACK_TARGET, justifyContent: 'center', alignItems: 'flex-start' },
  // The checklist's chevron (Row.tsx's, turned to point left).
  chevron: { width: 10, height: 10, borderTopWidth: 2, borderRightWidth: 2, marginLeft: 4, transform: [{ rotate: '-135deg' }] },
  actions: { gap: space.gapSm },
});
