// 05.3-24 (UI-SPEC "What kind of purchase?", P-12): the item-type chips wrap; General is selected by default. A retired type
// a stored check still carries shows as one read-only selected chip (it cannot be picked again).
// 05.3-83: the user's own kinds follow the nine presets, then '+ Your own' opens a sheet to name a new one.
import React, { useState } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import type { ItemTypeRef, V3PresetItemType } from '@/engine/decide/v3';
import { useLooseT } from './useLooseT';
import { space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { fontSize, textRole } from '@/theme/typography';
import { Chip } from '@/ui/Chip';
import { Text } from '@/ui/Text';
import { itemTypeOptions, type CustomLabel } from '../model/checkOptions';
import { OWN_LIVE_MAX } from '../model/ownOptions';
import { OwnOptionSheet, type OwnSaveOutcome } from './OwnOptionSheet';
import { EditOwnLink } from './OwnOptionsListSheet';
import { useOwnOptions } from './useOwnOptions';

export interface ItemTypeChipsProps {
  selected: ItemTypeRef;
  custom?: readonly CustomLabel[];
  onSelect(ref: ItemTypeRef): void;
  readOnly?: boolean;
}

export function ItemTypeChips({ selected, custom, onSelect, readOnly = false }: ItemTypeChipsProps): React.JSX.Element {
  const t = useLooseT();
  const { colors, pairing } = useTheme();
  const own = useOwnOptions();
  const [open, setOpen] = useState(false);
  const [limit, setLimit] = useState(false);
  const options = itemTypeOptions(selected, custom ?? own.itemTypes, own.retired);

  const press = (): void => {
    if (own.liveCount.itemTypes >= OWN_LIVE_MAX) {
      setLimit(true);
      AccessibilityInfo.announceForAccessibility(t('decide.v3.ui.ownOptions.tooMany'));
      return;
    }
    setOpen(true);
  };
  const save = (input: { name: string; base?: V3PresetItemType }): OwnSaveOutcome => {
    const r = own.add('itemType', input);
    if (!r.ok) return r.reason;
    setOpen(false);
    onSelect({ kind: 'custom', id: r.id });
    return 'ok';
  };

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
        {readOnly ? null : (
          <Chip
            label={t('decide.v3.ui.ownOptions.addChip')}
            accessibilityLabel={t('decide.v3.ui.ownOptions.addChipA11y', { group: t('decide.v3.ui.ownOptions.groupItem') })}
            onPress={press}
          />
        )}
      </View>
      {readOnly ? null : <EditOwnLink mode="itemType" />}
      {limit ? (
        <Text accessibilityLiveRegion="polite" style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkDim }}>
          {t('decide.v3.ui.ownOptions.tooMany')}
        </Text>
      ) : null}
      <OwnOptionSheet visible={open} mode="itemType" onCancel={() => setOpen(false)} onSave={save} />
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: space.gapSm },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.gapSm },
});
