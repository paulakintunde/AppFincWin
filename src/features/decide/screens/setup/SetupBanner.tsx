// 06.1-17 (D-10, D30): the Decide setup banner, three states. It has no control to remove it and never turns red: a person who has not
// finished setup keeps seeing how far along they are, as one calm row once started. When everything is done it says so once
// (per device) and then renders nothing. Presentational: progress comes in as a prop.
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
  return (
    <Pressable
      testID="setup-banner-row"
      accessibilityRole="button"
      accessibilityLabel={t('decide.screens.setup.banner.rowA11y', { count: progress.doneCount, next })}
      onPress={() => {
        hapticLight();
        onStart(progress.next);
      }}
      style={({ pressed }) => [styles.row, { backgroundColor: colors.surface, opacity: pressed ? PRESSED_OPACITY : 1 }]}
    >
      <View style={styles.rowText}>
        <Text style={{ ...textRole(pairing, 'bodyStrong'), color: colors.ink }}>{t('decide.screens.setup.banner.rowTitle', { count: progress.doneCount })}</Text>
        <Text style={{ ...textRole(pairing, 'label'), color: colors.inkDim }}>{t('decide.screens.setup.banner.rowNext', { next })}</Text>
        <SetupBar done={progress.doneCount} />
      </View>
      <StateGlyph name="chev" color={colors.inkMuted} size={18} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, padding: space.cardPad, gap: space.gapMd },
  head: { flexDirection: 'row', gap: space.gapMd, alignItems: 'center' },
  headText: { flex: 1, gap: 2 },
  tile: { width: TILE, minHeight: TILE, borderRadius: radii.glyphTile + 3, alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.gapSm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.gapMd, borderRadius: radii.card, padding: space.cardPad, minHeight: 64 },
  rowText: { flex: 1, gap: 4 },
  bar: { flexDirection: 'row', gap: SEGMENT_GAP },
  segment: { flex: 1, minHeight: SEGMENT_HEIGHT, borderRadius: SEGMENT_HEIGHT / 2, overflow: 'hidden' },
  segmentFill: { minHeight: SEGMENT_HEIGHT, borderRadius: SEGMENT_HEIGHT / 2 },
});
