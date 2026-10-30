// 05.3-35 (D-14): the quiet "Refund of your {payee} purchase?" chip on an unlinked money-in row. One tap opens the 05.2
// refund picker preselected on that purchase; nothing links until the user presses Link refund (05.2 D-21). Same
// shape as RefundTag: fill1, inkDim, tabLabel, pill, 44 dp through hitSlop; never warn1 or accent.
import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, space } from '@/theme/layout';
import { fontSize, textRole } from '@/theme/typography';
import { Text } from '@/ui/Text';

export interface RefundHintChipProps {
  payee: string;
  onPress: () => void;
}

export function RefundHintChip({ payee, onPress }: RefundHintChipProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('decide.v3.ui.refund.chipA11y', { payee })}
      hitSlop={HIT_SLOP}
      onPress={onPress}
      style={[styles.chip, { backgroundColor: colors.fill1 }]}
    >
      <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.tabLabel, color: colors.inkDim }}>
        {t('decide.v3.ui.refund.chip', { payee })}
      </Text>
    </Pressable>
  );
}

const HIT_SLOP = { top: 10, bottom: 10, left: 4, right: 4 };

const styles = StyleSheet.create({
  // 05.3-50 F6: never wider than the tags row, no fixed width, so a long label wraps between words.
  chip: {
    alignSelf: 'flex-start',
    flexShrink: 1,
    maxWidth: '100%',
    borderRadius: radii.pill,
    paddingHorizontal: space.gapSm,
    paddingVertical: 3,
  },
});
