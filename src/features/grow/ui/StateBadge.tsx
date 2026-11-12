// 06-09: a state badge is a glyph shape plus a word, never colour alone. Tones map only to existing token pairs:
// accent (Met, Reached), warn (Over your rule), blue (Locked), plum (Linked to a check), slate (Expected, As of).
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';
import { radii } from '@/theme/layout';
import { ACCENT_TINT_OPACITY, categorySwatch, warnTint } from '@/theme/tokens';
import { fontSize, textRole } from '@/theme/typography';
import { GrowGlyph, type GrowGlyphName } from './GrowGlyph';

export type StateBadgeTone = 'accent' | 'warn' | 'blue' | 'plum' | 'slate';
export type StateBadgeShape = Extract<GrowGlyphName, 'sCheck' | 'sHalf' | 'sOver' | 'sUp' | 'sDown' | 'sClock' | 'sQuestion' | 'lock'>;

export interface StateBadgeProps {
  tone: StateBadgeTone;
  shape: StateBadgeShape;
  label: string;
  /** Spoken text when it differs from the visible word ("Locked, no Decide answer spends it"). */
  accessibilityLabel?: string;
}

const GLYPH = 16;

export function StateBadge({ tone, shape, label, accessibilityLabel }: StateBadgeProps) {
  const { colors, pairing } = useTheme();
  let background: string = colors.fill1;
  let ink: string = colors.inkDim;
  let overlay = false;
  if (tone === 'accent') {
    ink = colors.accent;
    overlay = true;
  } else if (tone === 'warn') {
    background = warnTint;
    ink = colors.warn1;
  } else {
    background = categorySwatch[tone].tint;
    ink = categorySwatch[tone].color;
  }
  return (
    <View testID="grow-state-badge" accessible accessibilityLabel={accessibilityLabel ?? label} style={[styles.badge, { backgroundColor: background }]}>
      {overlay ? (
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { backgroundColor: colors.accent, opacity: ACCENT_TINT_OPACITY, borderRadius: radii.pill }]}
        />
      ) : null}
      <GrowGlyph name={shape} color={ink} size={GLYPH} />
      <Text scale="capped" style={{ ...textRole(pairing, 'label'), fontSize: fontSize.eyebrow, color: ink }}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 24,
    paddingVertical: 2,
    paddingLeft: 5,
    paddingRight: 8,
    borderRadius: radii.pill,
  },
});
