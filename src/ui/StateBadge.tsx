// 06-09, moved to src/ui in 06.1-08: a state badge is a glyph shape plus a word, never colour alone. Tones map only to existing token pairs:
// accent (Met, Reached), warn (Over your rule), blue (Locked), plum (Linked to a check), slate (Expected, As of).
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';
import { radii } from '@/theme/layout';
import { ACCENT_TINT_OPACITY, categorySwatch, stateColors, warnTint, type StateTone } from '@/theme/tokens';
import { fontSize, textRole } from '@/theme/typography';
import { StateGlyph, type StateGlyphName } from '@/ui/glyphs/StateGlyph';

export type StateBadgeTone = StateTone | 'accent' | 'warn' | 'blue' | 'plum' | 'slate';
export type StateBadgeShape = Extract<StateGlyphName, 'sCheck' | 'sHalf' | 'sOver' | 'sUp' | 'sDown' | 'sClock' | 'sQuestion' | 'lock'>;

export interface StateBadgeProps {
  tone: StateBadgeTone;
  shape: StateBadgeShape;
  label: string;
  /** Spoken text when it differs from the visible word ("Locked, no Decide answer spends it"). */
  accessibilityLabel?: string;
  /** Defaults to "grow-state-badge" so Grow tests keep working. */
  testID?: string;
}

const GLYPH = 16;

export function StateBadge({ tone, shape, label, accessibilityLabel, testID = 'grow-state-badge' }: StateBadgeProps) {
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
  } else if (tone === 'blue' || tone in stateColors) {
    // 06.1 D-16: Grow's safety-net "blue" becomes the "net" state token.
    const state = stateColors[tone === 'blue' ? 'net' : (tone as StateTone)];
    background = state.tint;
    ink = state.color;
  } else {
    const swatch = categorySwatch[tone as 'plum' | 'slate'];
    background = swatch.tint;
    ink = swatch.color;
  }
  return (
    <View testID={testID} accessible accessibilityLabel={accessibilityLabel ?? label} style={[styles.badge, { backgroundColor: background }]}>
      {overlay ? (
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { backgroundColor: colors.accent, opacity: ACCENT_TINT_OPACITY, borderRadius: radii.pill }]}
        />
      ) : null}
      <StateGlyph name={shape} color={ink} size={GLYPH} />
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
