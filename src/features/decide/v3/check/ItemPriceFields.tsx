// 05.3-24 (UI-SPEC Check a purchase): Item and Price side by side at 3:2, stacked under rule S (narrow width or large text).
// The item input never truncates (rule T applies to display names only); the price goes through the shared amount parser.
import React, { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { MoneyInput } from '@/features/decide/ui/MoneyInput';
import { useShouldStack } from '@/features/decide/ui/textFit';
import { useT } from '@/i18n';
import { radii, space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { textRole } from '@/theme/typography';
import { Text } from '@/ui/Text';
import { TextInput } from '@/ui/TextInput';
import type { TextInput as TextInputInstance } from '@/ui/TextInput';

export interface ItemPriceFieldsProps {
  name: string;
  onName(name: string): void;
  price: number | null;
  onPrice(minor: number | null): void;
  currency: string;
  /** D-19: arriving from "Change the price" focuses the price with its text selected. */
  focusPrice: boolean;
  readOnly?: boolean;
}

const SELECT_ALL_END = 64;
const ITEM_MAX = 80;

export function ItemPriceFields({ name, onName, price, onPrice, currency, focusPrice, readOnly = false }: ItemPriceFieldsProps): React.JSX.Element {
  const t = useT();
  const { colors, pairing } = useTheme();
  const stacked = useShouldStack();
  const priceRef = useRef<TextInputInstance>(null);

  useEffect(() => {
    if (!focusPrice) return;
    const input = priceRef.current;
    if (input === null) return;
    input.focus();
    input.setSelection?.(0, SELECT_ALL_END);
  }, [focusPrice]);

  return (
    <View style={stacked ? styles.stack : styles.row}>
      <View style={stacked ? undefined : styles.item}>
        <Text style={{ ...textRole(pairing, 'label'), color: colors.inkDim }}>{t('decide.v3.ui.check.item')}</Text>
        <View style={[styles.field, { backgroundColor: colors.fill1 }]}>
          <TextInput
            value={name}
            onChangeText={onName}
            accessibilityLabel={t('decide.v3.ui.check.item')}
            maxLength={ITEM_MAX}
            editable={!readOnly}
            returnKeyType="next"
            placeholderTextColor={colors.inkMuted}
            style={[styles.input, { ...textRole(pairing, 'label'), color: colors.ink }]}
          />
        </View>
      </View>
      <View style={stacked ? undefined : styles.price}>
        <MoneyInput
          value={price}
          currency={currency}
          onChange={onPrice}
          label={t('decide.v3.ui.check.price')}
          accessibilityLabel={t('decide.v3.ui.check.price')}
          readOnly={readOnly}
          inputRef={priceRef}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.gapMd, alignItems: 'flex-start' },
  stack: { gap: space.gapMd },
  item: { flex: 3 },
  price: { flex: 2 },
  field: { minHeight: space.touchMin, borderRadius: radii.pill, paddingHorizontal: space.gapMd, justifyContent: 'center' },
  input: { minHeight: space.touchMin, padding: 0 },
});
