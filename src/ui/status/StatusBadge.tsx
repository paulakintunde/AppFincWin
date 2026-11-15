/**
 * 06.2 D-12..D-14: the shared status badge. A 24-tall pill with a 16 icon, a hair (4) gap and the word, all in the
 * tone colour on the tone tint (neutral: fill1 / inkDim). One accessible text element: the word is spoken, the icon
 * is hidden. Reads STATUS (statusMap.ts) so every screen shows the same colour, shape and word for a status.
 * Decide answer boards keep 06.1 StateBadge (D-23).
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, step } from '@/theme/layout';
import { stateColors } from '@/theme/tokens';
import { fontSize, textRole } from '@/theme/typography';
import { Glyph } from '@/ui/icons/Glyph';
import { Text } from '@/ui/Text';
import { STATUS, type StatusKey } from './statusMap';

export interface StatusBadgeProps {
  status: StatusKey;
  /** Visible word when a screen needs a fuller one ("$40 over cap"); defaults to the map's word. */
  label?: string;
  /** Params for words that carry them (overCapBy, dueOn, up, down). */
  params?: Record<string, string | number>;
  /** Spoken text when it differs from the visible word. */
  accessibilityLabel?: string;
  testID?: string;
}

const ICON = 16;

export function StatusBadge({ status, label, params, accessibilityLabel, testID }: StatusBadgeProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const def = STATUS[status];
  // The map's keys are a union whose placeholders differ (percent, amount, date); callers pass the params a word needs.
  const word = label ?? (t as (key: string, options?: Record<string, string | number>) => string)(def.wordKey, params);
  const tone = def.tone === 'neutral' ? null : stateColors[def.tone];
  const background = tone ? tone.tint : colors.fill1;
  const ink = tone ? tone.color : colors.inkDim;
  return (
    <View
      testID={testID ?? `status-badge-${status}`}
      accessible
      accessibilityRole="text"
      accessibilityLabel={accessibilityLabel ?? word}
      style={[styles.badge, { backgroundColor: background }]}
    >
      <Glyph name={def.icon} size={ICON} color={ink} />
      <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, lineHeight: fontSize.meta * 1.4, color: ink }}>
        {word}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: step.hair,
    minHeight: 24,
    paddingHorizontal: step.tight,
    paddingVertical: 2,
    borderRadius: radii.pill,
  },
});
