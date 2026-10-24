/**
 * D-70 / UI-SPEC R1: the hand-drawn info glyph and its button. A 16pt glyph with hitSlop 14 gives the 44pt target. The
 * button is a plain Pressable (not a Pill) so a read-only scope never disables it: it explains a term on a decided check too.
 */
import React from 'react';
import { Pressable, StyleSheet, type View } from 'react-native';
import Svg, { Circle, Rect } from 'react-native-svg';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { PRESSED_OPACITY } from '@/theme/layout';
import { hapticSelection } from '@/ui/haptics';

export type InfoTone = 'light' | 'dark';

/** The drawn box is 16 units; a 12pt glyph scales the same drawing. */
const BOX = 16;
const HIT_SLOP = 14; // 16 + 2 x 14 = 44

export function InfoGlyph({ size = 16, color }: { size?: 16 | 12; color: string }): React.JSX.Element {
  return (
    <Svg
      width={size}
      height={size}
      viewBox={`0 0 ${BOX} ${BOX}`}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Circle cx={8} cy={8} r={7.25} fill="none" stroke={color} strokeWidth={1.5} />
      <Circle cx={8} cy={4.75} r={1} fill={color} />
      <Rect x={7.25} y={7} width={1.5} height={6} rx={0.75} fill={color} />
    </Svg>
  );
}

export interface InfoButtonProps {
  term: string;
  onPress: () => void;
  tone?: InfoTone;
  buttonRef?: React.Ref<View>;
}

export function InfoButton({ term, onPress, tone = 'light', buttonRef }: InfoButtonProps): React.JSX.Element {
  const t = useT();
  const { colors } = useTheme();
  return (
    <Pressable
      ref={buttonRef}
      accessibilityRole="button"
      accessibilityLabel={t('decide.infoButton.a11y', { term })}
      accessibilityHint={t('decide.infoButton.hint')}
      hitSlop={HIT_SLOP}
      onPress={() => {
        hapticSelection();
        onPress();
      }}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      <InfoGlyph size={16} color={tone === 'dark' ? colors.inkSoft1 : colors.inkMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { width: BOX, height: BOX },
  pressed: { opacity: PRESSED_OPACITY },
});
