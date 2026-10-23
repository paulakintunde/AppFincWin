/** D-75 / UI-SPEC R1 "Show details" / "Hide details": a 44pt accent text button that reveals the rest of a block in place. */
import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Text } from '@/ui/Text';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { PRESSED_OPACITY, space } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { hapticSelection } from '@/ui/haptics';
import { useRevealTap } from './revealTap';

export interface DetailsToggleProps {
  expanded: boolean;
  onToggle: () => void;
  block: string;
}

export function DetailsToggle({ expanded, onToggle, block }: DetailsToggleProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const revealTap = useRevealTap();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      accessibilityLabel={t(expanded ? 'decide.details.hideA11y' : 'decide.details.showA11y', { block })}
      onPress={() => {
        hapticSelection();
        revealTap();
        onToggle();
      }}
      style={({ pressed }) => [styles.button, { opacity: pressed ? PRESSED_OPACITY : 1 }]}
    >
      <Text style={{ ...textRole(pairing, 'label'), color: colors.accent }}>
        {t(expanded ? 'decide.details.hide' : 'decide.details.show')}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { minHeight: space.touchMin, justifyContent: 'center', alignSelf: 'flex-start' },
});
