// 10-22 (D-09): the sheet that comes before the OS dialog. It is only ever opened by a person switching an alert on.
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useT } from '@/i18n';
import { PlanLink } from '@/features/plans/components/NoticeCard';
import { Pill } from '@/ui/Pill';
import { Sheet } from '@/ui/Sheet';
import { Text } from '@/ui/Text';
import { accentTintOver } from '@/ui/EmptyState';
import { IconTile } from '@/ui/icons/IconTile';
import { hapticTap } from '@/ui/haptics';
import { useTheme } from '@/theme/ThemeProvider';
import { space, tile } from '@/theme/layout';
import { textRole } from '@/theme/typography';

export interface PermissionPreAskProps {
  visible: boolean;
  busy?: boolean;
  onContinue: () => void;
  onNotNow: () => void;
}

export function PermissionPreAsk({ visible, busy = false, onContinue, onNotNow }: PermissionPreAskProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const title = t('system.alerts.preAskTitle');
  return (
    <Sheet visible={visible} onDismiss={onNotNow} accessibilityLabel={title} dismissible={!busy}>
      <View style={styles.column} testID="alerts-preask">
        <IconTile icon="alerts" size={tile.big} color={colors.accent} tint={accentTintOver(colors.fill1, colors.accent)} />
        <Text accessibilityRole="header" style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink }}>
          {title}
        </Text>
        <Text style={{ ...textRole(pairing, 'body'), color: colors.inkDim }}>{t('system.alerts.preAskBody')}</Text>
        <Pill
          label={t('system.alerts.preAskContinue')}
          variant="primary"
          pending={busy}
          onPress={() => {
            hapticTap();
            onContinue();
          }}
        />
        <PlanLink label={t('system.alerts.preAskNotNow')} onPress={onNotNow} testID="alerts-preask-notnow" />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  column: { gap: space.groupGap, alignItems: 'flex-start', paddingBottom: space.sheetPadBottom },
});
