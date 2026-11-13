// 06.1-17 (D-10, D30): the Decide setup banner, three states. It has no control to remove it and never turns red: a person who has not
// finished setup keeps seeing how far along they are, as one calm row once started. When everything is done it says so once
// (per device) and then renders nothing. Presentational: progress comes in as a prop.
// 06.1-56 (A-HOME-9, D01s): the started row has a collapse chevron. Collapsed, it is a slim pill with the count and the bar, and a
// tap opens it again. The choice lasts for the app session (not stored): setup stays in view, only smaller.
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useT } from '@/i18n';
import { markSetupDoneSeen } from '@/features/decide/hints/decideHints';
import { PRESSED_OPACITY, radii, space } from '@/theme/layout';
import { DURATION, EASING, useReduceMotion } from '@/theme/motion';
import { useTheme } from '@/theme/ThemeProvider';
import { textRole } from '@/theme/typography';
import { hapticLight } from '@/ui/haptics';
import { StateGlyph } from '@/ui/glyphs/StateGlyph';
import { Pill } from '@/ui/Pill';
import { Text } from '@/ui/Text';
import { SETUP_ORDER, type SetupItemId, type SetupProgress } from '../logic/setupProgress';

const TILE = 48;

// 06.1-56 (A-HOME-9): collapsed or not, remembered for this app session only.
let collapsedThisSession = false;
/** Tests only: forget the session's collapsed choice. */
export function resetSetupBannerSession(): void {
  collapsedThisSession = false;
}
const SEGMENT_HEIGHT = 4;
const SEGMENT_GAP = 4;

function Segment({ filled }: { filled: boolean }) {
  const { colors } = useTheme();
  const reduced = useReduceMotion();
  const width = useSharedValue(filled && !reduced ? 0 : filled ? 100 : 0);
  useEffect(() => {
    const target = filled ? 100 : 0;
    width.value = reduced ? target : withTiming(target, { duration: DURATION.progress, easing: EASING });
  }, [filled, reduced, width]);
  const fillStyle = useAnimatedStyle(() => ({ width: `${width.value}%` }));
  return (
    <View style={[styles.segment, { backgroundColor: colors.line4 }]}>
      <Animated.View testID={filled ? 'setup-segment-filled' : 'setup-segment-empty'} style={[styles.segmentFill, { backgroundColor: colors.accent }, fillStyle]} />
    </View>
  );
}

/** Six segments, one per item: accent when done, line4 when not. The words around it carry the same count. */
export function SetupBar({ done }: { done: number }) {
  const t = useT();
  return (
    <View
      testID="setup-bar"
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={t('decide.screens.setup.banner.barA11y', { count: done })}
      accessibilityValue={{ min: 0, max: SETUP_ORDER.length, now: done }}
      style={styles.bar}
    >
      {SETUP_ORDER.map((id, i) => (
        <Segment key={id} filled={i < done} />
      ))}
    </View>
  );
}

export interface SetupBannerProps {
  progress: SetupProgress;
  /** Opens the first open item (state 1) or the next one (state 2). */
  onStart: (next: SetupItemId | null) => void;
  /** Scrolls to the check card on Decide home. */
  onCheckFirst: () => void;
  /** State 3: opens the setup checklist to show what Decide uses. */
  onSeeUses?: () => void;
  /** Device flag: the "setup done" note was already shown. */
  setupDoneSeen: boolean;
  /** Who the seen flag is kept for. */
  userId?: string | null;
  /** Names the next item in words (the caller owns item copy). */
  itemName: (id: SetupItemId) => string;
}

export function SetupBanner({ progress, onStart, onCheckFirst, onSeeUses, setupDoneSeen, userId, itemName }: SetupBannerProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const [markedSeen, setMarkedSeen] = useState(false);
  const [collapsed, setCollapsed0] = useState(collapsedThisSession);
  const setCollapsed = (next: boolean): void => {
    collapsedThisSession = next;
    hapticLight();
    setCollapsed0(next);
  };

  if (progress.allDone) {
    if (setupDoneSeen || markedSeen) return null;
    return (
      <View testID="setup-banner-done" style={[styles.card, { backgroundColor: colors.surface }]}>
        <Text style={{ ...textRole(pairing, 'bodyStrong'), color: colors.ink }}>{t('decide.screens.setup.banner.doneTitle')}</Text>
        <Pill
          variant="secondary"
          label={t('decide.screens.setup.banner.doneLink')}
          onPress={() => {
            hapticLight();
            if (userId) void markSetupDoneSeen(userId);
            setMarkedSeen(true);
            onSeeUses?.();
          }}
        />
      </View>
    );
  }

  if (progress.doneCount === 0) {
    return (
      <View testID="setup-banner-new" style={[styles.card, { backgroundColor: colors.surface }]}>
        <View style={styles.head}>
          <View style={[styles.tile, { backgroundColor: colors.accentTint1 }]}>
            <StateGlyph name="checkbuy" color={colors.accent} size={26} />
          </View>
          <View style={styles.headText}>
            <Text style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink }}>{t('decide.screens.setup.banner.newTitle')}</Text>
            <Text style={{ ...textRole(pairing, 'body'), color: colors.inkDim }}>{t('decide.screens.setup.banner.newSub')}</Text>
          </View>
        </View>
        <SetupBar done={0} />
        <View style={styles.actions}>
          <Pill
            variant="primary"
            label={t('decide.screens.setup.banner.start')}
            onPress={() => {
              hapticLight();
              onStart(progress.next);
            }}
          />
          <Pill variant="secondary" label={t('decide.screens.setup.banner.checkFirst')} onPress={onCheckFirst} />
        </View>
      </View>
    );
  }

  const next = progress.next === null ? '' : itemName(progress.next);
  const rowLabel = t('decide.screens.setup.banner.rowA11y', { count: progress.doneCount, next });
  if (collapsed) {
    return (
      <Pressable
        testID="setup-banner-slim"
        accessibilityRole="button"
        accessibilityState={{ expanded: false }}
        accessibilityLabel={rowLabel}
        onPress={() => setCollapsed(false)}
        style={({ pressed }) => [styles.slim, { backgroundColor: colors.surface, borderColor: colors.line4, opacity: pressed ? PRESSED_OPACITY : 1 }]}
      >
        <View style={styles.slimBar}>
          <SetupBar done={progress.doneCount} />
        </View>
        <Text style={{ ...textRole(pairing, 'label'), fontWeight: '600', color: colors.ink, flexShrink: 1 }}>{t('decide.screens.setup.banner.rowTitle', { count: progress.doneCount })}</Text>
      </Pressable>
    );
  }
  return (
    <View style={[styles.rowWrap, { backgroundColor: colors.surface }]}>
      <Pressable
        testID="setup-banner-row"
        accessibilityRole="button"
        accessibilityLabel={rowLabel}
        onPress={() => {
          hapticLight();
          onStart(progress.next);
        }}
        style={({ pressed }) => [styles.row, { opacity: pressed ? PRESSED_OPACITY : 1 }]}
      >
        <View style={styles.rowText}>
          <Text style={{ ...textRole(pairing, 'bodyStrong'), color: colors.ink }}>{t('decide.screens.setup.banner.rowTitle', { count: progress.doneCount })}</Text>
          <Text style={{ ...textRole(pairing, 'label'), color: colors.inkDim }}>{t('decide.screens.setup.banner.rowNext', { next })}</Text>
          <SetupBar done={progress.doneCount} />
        </View>
        <StateGlyph name="chev" color={colors.inkMuted} size={18} />
      </Pressable>
      <Pressable
        testID="setup-banner-collapse"
        accessibilityRole="button"
        accessibilityState={{ expanded: true }}
        accessibilityLabel={t('decide.screens.setup.banner.collapseA11y')}
        onPress={() => setCollapsed(true)}
        style={[styles.collapse, { borderLeftColor: colors.line1 }]}
      >
        <View style={[styles.collapseChevron, { borderColor: colors.inkMuted }]} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, padding: space.cardPad, gap: space.gapMd },
  head: { flexDirection: 'row', gap: space.gapMd, alignItems: 'center' },
  headText: { flex: 1, gap: 2 },
  tile: { width: TILE, minHeight: TILE, borderRadius: radii.glyphTile + 3, alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.gapSm },
  rowWrap: { flexDirection: 'row', alignItems: 'stretch', borderRadius: radii.card, overflow: 'hidden' },
  row: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.gapMd, padding: space.cardPad, minHeight: 64 },
  collapse: { width: space.touchMin, alignItems: 'center', justifyContent: 'center', borderLeftWidth: 1 },
  // The Row chevron convention, turned to point up: "make this smaller".
  collapseChevron: { width: 8, height: 8, borderTopWidth: 2, borderRightWidth: 2, marginTop: 4, transform: [{ rotate: '-45deg' }] },
  slim: { minHeight: space.touchMin, borderRadius: radii.pill, borderWidth: 1, paddingHorizontal: space.gapMd, flexDirection: 'row', alignItems: 'center', gap: space.gapMd },
  slimBar: { width: 48 },
  rowText: { flex: 1, gap: 4 },
  bar: { flexDirection: 'row', gap: SEGMENT_GAP },
  segment: { flex: 1, minHeight: SEGMENT_HEIGHT, borderRadius: SEGMENT_HEIGHT / 2, overflow: 'hidden' },
  segmentFill: { minHeight: SEGMENT_HEIGHT, borderRadius: SEGMENT_HEIGHT / 2 },
});
