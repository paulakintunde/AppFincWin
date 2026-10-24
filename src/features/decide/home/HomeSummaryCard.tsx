/**
 * 05-114 (D-95, D-97; UI-SPEC R17.2-R17.4, R17.7, R17.13 M2/M3): the dark card at the top of Decide home.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { space } from '@/theme/layout';
import { FONT_PAIRINGS } from '@/theme/fonts';
import { useTheme } from '@/theme/ThemeProvider';
import { fontSize } from '@/theme/typography';
import { Text } from '@/ui/Text';
import { heroAmountText } from './heroAmountText';

export { heroAmountText };

/** The hero's declared rule-N exception (R17.7): 0.75 instead of 0.8, so "$1,234,567" fits at 320 wide and 2.0x. */
const HERO_MIN_FONT_SCALE = 0.75;

export interface HomeHeroProps {
  /** The formatted absolute amount ("$1,240"). */
  amount: string;
  /** The word after it: "left" or "short" (already translated). */
  word: string;
  short: boolean;
}

/** R17.13 M2: two Texts in a wrapping baseline row. The amount stays whole on line 1; the word wraps under it. */
export function HomeHero({ amount, word, short }: HomeHeroProps) {
  const { colors, pairing } = useTheme();
  const { text, fitOneLine } = heroAmountText(amount);
  const base = {
    fontFamily: FONT_PAIRINGS[pairing].display,
    fontSize: fontSize.netWorth,
    lineHeight: fontSize.netWorth * 1.0,
    letterSpacing: fontSize.netWorth * -0.01,
  };
  return (
    <View style={styles.row}>
      <Text
        scale="capped"
        numberOfLines={fitOneLine ? 1 : undefined}
        adjustsFontSizeToFit={fitOneLine}
        minimumFontScale={HERO_MIN_FONT_SCALE}
        style={[base, styles.amount, { color: short ? colors.dangerTint2 : colors.surface }]}
      >
        {text}
      </Text>
      <Text scale="capped" style={[base, styles.word, { color: colors.surface }]}>
        {word}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: space.gapSm },
  amount: { flexShrink: 1 },
  word: { flexShrink: 1 },
});
