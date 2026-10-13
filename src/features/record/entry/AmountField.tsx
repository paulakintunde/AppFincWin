// The compact amount field of the entry sheet (02.3 D-12): one tappable field under the type
// chips that shows the typed figure or the "Amount" placeholder. The in-app pad opens only
// when it is tapped; the accent border marks the field the pad is typing into.
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, space } from '@/theme/layout';
import { textRole } from '@/theme/typography';

export interface AmountFieldProps {
  /** Formatted figure, or null when nothing is typed. */
  text: string | null;
  currency: string;
  open: boolean;
  /** Transfer: prefix the figure with the transfer arrow and dim it. */
  transfer?: boolean;
  /** t('record.sheet.field.amount' | 'amountOut' | 'amountIn'). */
  hint: string;
  onPress: () => void;
}

export function AmountField({ text, currency, open, transfer = false, hint, onPress }: AmountFieldProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const empty = text === null || text === '';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={empty ? t('record.sheet.field.amount') : t('record.sheet.keypad.amountA11y', { amount: text })}
      accessibilityHint={hint}
      accessibilityState={{ expanded: open }}
      accessibilityLiveRegion="polite"
      onPress={onPress}
      style={{
        minHeight: space.touchMin,
        backgroundColor: colors.fill1,
        borderRadius: radii.card / 2,
        paddingHorizontal: space.cardPad,
        paddingVertical: space.gapSm,
        borderWidth: 1.5,
        borderColor: open ? colors.accent : 'transparent',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <View style={{ flexShrink: 1 }}>
        {empty ? (
          <Text style={[textRole(pairing, 'body'), { color: colors.inkFaint }]}>{hint}</Text>
        ) : (
          <Text style={[textRole(pairing, 'sheetTitle'), { color: transfer ? colors.inkDim : colors.ink }]}>
            {transfer ? `↔ ${text}` : text}
          </Text>
        )}
      </View>
      <Text style={[textRole(pairing, 'label'), { color: colors.inkMuted }]}>{currency}</Text>
    </Pressable>
  );
}
