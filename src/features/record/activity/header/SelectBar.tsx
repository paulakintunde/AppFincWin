// D-63: in select mode this bar replaces band 4. It wraps at large text instead of shrinking.
// Selection changes only; Delete stays in BulkBar behind its confirm sheet.
import React from 'react';
import { View } from 'react-native';
import { Text } from '@/ui/Text';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { Pill } from '@/ui/Pill';

export interface SelectBarProps {
  count: number;
  onSelectAll: () => void;
  onSelectNone: () => void;
  onDone: () => void;
}

export function SelectBar({ count, onSelectAll, onSelectNone, onDone }: SelectBarProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  return (
    <View
      testID="activity-select-bar"
      style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.gapSm }}
    >
      <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{t('activity.selected', { count })}</Text>
      <Pill label={t('activity.selectAll')} variant="secondary" onPress={onSelectAll} />
      <Pill label={t('activity.selectNone')} variant="secondary" onPress={onSelectNone} />
      <Pill label={t('activity.done')} variant="secondary" onPress={onDone} />
    </View>
  );
}
