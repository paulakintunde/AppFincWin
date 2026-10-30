// 05.3-24 (UI-SPEC "What kind of purchase?", P-12): the item-type chips wrap; General is selected by default. A retired type
// a stored check still carries shows as one read-only selected chip (it cannot be picked again).
import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { ItemTypeRef } from '@/engine/decide/v3';
import { useLooseT } from './useLooseT';
import { space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { textRole } from '@/theme/typography';
import { Chip } from '@/ui/Chip';
import { Text } from '@/ui/Text';
import { itemTypeOptions, type CustomLabel } from '../model/checkOptions';

export interface ItemTypeChipsProps {
  selected: ItemTypeRef;
  custom?: readonly CustomLabel[];
  onSelect(ref: ItemTypeRef): void;
  readOnly?: boolean;
}

const NO_CUSTOM: readonly CustomLabel[] = [];

export function ItemTypeChips({ selected, custom = NO_CUSTOM, onSelect, readOnly = false }: ItemTypeChipsProps): React.JSX.Element {
  const t = useLooseT();
  const { colors, pairing } = useTheme();
  const options = itemTypeOptions(selected, custom);
  return (
    <View style={styles.group}>
      <Text accessibilityRole="header" style={{ ...textRole(pairing, 'label'), color: colors.inkDim }}>
        {t('decide.v3.ui.check.kind')}
      </Text>
      <View style={styles.wrap}>
        {options.map((o) => {
          const label = o.labelKey === null ? (o.label ?? '') : t(o.labelKey);
          return (
            <Chip
              key={o.ref.kind === 'preset' ? o.ref.value : o.ref.id}
              label={label}
              selected={o.selected}
              numberOfLines={o.labelKey === null ? 2 : undefined}
              onPress={o.readOnly || readOnly ? undefined : () => onSelect(o.ref)}
            />
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: space.gapSm },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.gapSm },
});
