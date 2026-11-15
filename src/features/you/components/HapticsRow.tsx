/**
 * 06.2-15 (D-21, D-28, L04): the Haptics switch under "Alerts and feel". Default ON (plan 03's store). Turning it off
 * silences every haptic at once (src/ui/haptics.ts reads the same store); turning it on stores ON first, then gives
 * one tick (D-20: a switch), so the tick itself passes the gate. Read as "Haptics, switch, on".
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { step } from '@/theme/layout';
import { accentTintOver } from '@/ui/EmptyState';
import { hapticTick } from '@/ui/haptics';
import { useHapticsEnabled } from '@/ui/hapticsSetting';
import { IconTile } from '@/ui/icons/IconTile';
import { ToggleRow } from '@/ui/ToggleRow';
import { YOU_ROW_ICON } from './youRowIcons';

export function HapticsRow() {
  const t = useT();
  const { colors } = useTheme();
  const [enabled, setEnabled] = useHapticsEnabled();

  const onChange = (next: boolean): void => {
    setEnabled(next);
    if (next) hapticTick();
  };

  return (
    <View style={styles.row}>
      <IconTile
        icon={YOU_ROW_ICON.haptics}
        color={colors.accent}
        tint={accentTintOver(colors.fill1, colors.accent)}
        testID="you-tile-haptics"
      />
      <View style={styles.toggle}>
        <ToggleRow label={t('appLife.you.haptics')} sub={t('appLife.you.hapticsHint')} value={enabled} onChange={onChange} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: step.row },
  toggle: { flex: 1 },
});
