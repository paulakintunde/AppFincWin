/**
 * UI-SPEC Spacing Scale ("amount-display" token): the large entry-sheet amount figure --
 * a display-figure exception to the phase's 4-size type scale, matching the existing
 * netWorth/healthScore precedent. `tone` 'danger' is used where the figure itself must
 * read as a negative/destructive amount.
 */
import React from 'react';
import { Text } from '@/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';
import { fontSize } from '@/theme/typography';

export interface AmountDisplayProps {
  text: string;
  /** 'dim' (inkDim) is the transfer figure: money moving, not earned or spent (D-50). */
  tone?: 'default' | 'danger' | 'dim';
  /** D-94: the amount read by currency name ("1,500 Canadian dollars"); the visible text is unchanged. */
  a11yValue?: string;
}

export function AmountDisplay({ text, tone = 'default', a11yValue }: AmountDisplayProps) {
  const { colors, fonts } = useTheme();
  const color = tone === 'danger' ? colors.danger : tone === 'dim' ? colors.inkDim : colors.ink;

  return (
    <Text
      scale="capped"
      accessibilityLabel={a11yValue}
      style={{
        fontFamily: fonts.body[500],
        fontSize: fontSize.amountDisplay,
        letterSpacing: fontSize.amountDisplay * -0.04,
        color,
      }}
    >
      {text}
    </Text>
  );
}
