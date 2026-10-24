/**
 * D-74 / UI-SPEC R1 "FoldRow": a 64pt-minimum button with a title (and an optional injected info accessory), a preview that
 * is never truncated, and a chevron. The open body mounts under the row. The info accessory arrives as a node, so this file
 * does not depend on the info kit; its 'about' action is exposed on the row for screen readers (R7).
 */
import React from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Text } from '@/ui/Text';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { DURATION, useReduceMotion } from '@/theme/motion';
import { size, space } from '@/theme/layout';
import { fontSize, textRole } from '@/theme/typography';
import { hapticSelection } from '@/ui/haptics';
import { useRevealTap } from './revealTap';

const CHEVRON_RIGHT = '45deg';
const CHEVRON_DOWN = '135deg';
const FOLD_MIN = 64;

export interface FoldInfo {
  node: React.ReactNode;
  aboutLabel: string;
  onAbout: () => void;
}

export interface FoldRowProps {
  title: string;
  preview: string;
  busy?: boolean;
  expanded: boolean;
  onToggle: () => void;
  info?: FoldInfo;
  onBodyLayout?: (event: LayoutChangeEvent) => void;
  children?: React.ReactNode;
}

export function FoldRow({ title, preview, busy, expanded, onToggle, info, onBodyLayout, children }: FoldRowProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const reduced = useReduceMotion();
  const revealTap = useRevealTap();
  const body = children;
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={busy ? { expanded, busy: true } : { expanded }}
        // an empty preview leaves the title alone, so the spoken label has no dangling separator
        accessibilityLabel={preview ? t('decide.fold.a11y.label', { title, preview }) : title}
        accessibilityHint={t(expanded ? 'decide.fold.a11y.hideHint' : 'decide.fold.a11y.showHint')}
        accessibilityActions={info ? [{ name: 'about', label: info.aboutLabel }] : undefined}
        onAccessibilityAction={
          info
            ? (e) => {
                if (e.nativeEvent.actionName === 'about') info.onAbout();
              }
            : undefined
        }
        onPress={() => {
          hapticSelection();
          revealTap();
          onToggle();
        }}
        style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.fill6 }]}
      >
        <View style={styles.left}>
          <View style={styles.titleRow}>
            <Text style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink, flexShrink: 1 }}>{title}</Text>
            {info ? info.node : null}
          </View>
          <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted }}>{preview}</Text>
        </View>
        <View
          style={[styles.chevron, { borderColor: colors.inkSoft3, transform: [{ rotate: expanded ? CHEVRON_DOWN : CHEVRON_RIGHT }] }]}
        />
      </Pressable>
      {expanded ? (
        reduced ? (
          <View style={styles.body} onLayout={onBodyLayout}>
            {body}
          </View>
        ) : (
          <Animated.View style={styles.body} onLayout={onBodyLayout} entering={FadeIn.duration(DURATION.entrance)}>
            {body}
          </Animated.View>
        )
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: FOLD_MIN,
    paddingVertical: space.rowPadDense,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.gapMd,
  },
  left: { flex: 1, flexShrink: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.gapSm, flexShrink: 1 },
  chevron: {
    width: size.chevronCompact,
    aspectRatio: 1,
    borderTopWidth: 2,
    borderRightWidth: 2,
    flexShrink: 0,
  },
  body: { paddingBottom: space.cardPad },
});
