// 08-18 (D-09): the one-time card after joining. It says what the household sees and what it never sees, in the agreed words,
// then the person carries on into the app. It never shows twice for the same household (the screen stores a "seen" mark).
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { IconTile } from '@/ui/icons/IconTile';
import { Pill } from '@/ui/Pill';
import { Sheet } from '@/ui/Sheet';
import { Text } from '@/ui/Text';
import { accentTintOver } from '@/ui/EmptyState';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { step, tile } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { householdIcons } from '../glyphs';

export interface WhatsSharedSheetProps {
  visible: boolean;
  household: string;
  onDone: () => void;
}

export function WhatsSharedSheet({ visible, household, onDone }: WhatsSharedSheetProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  if (!visible) return null;
  const title = t('household.join.shared.title', { household });
  return (
    <Sheet visible onDismiss={onDone} accessibilityLabel={title}>
      <View style={styles.column}>
        <IconTile
          icon={householdIcons.people}
          color={colors.accent}
          tint={accentTintOver(colors.surface, colors.accent)}
          size={tile.big}
        />
        <Text accessibilityRole="header" style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink }}>
          {title}
        </Text>
        <Text style={{ ...textRole(pairing, 'body'), color: colors.ink }} testID="whats-shared-body">
          {t('household.join.shared.body', { household })}
        </Text>
        <Pill label={t('household.join.shared.gotIt')} variant="primary" onPress={onDone} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  column: { gap: step.row, alignItems: 'flex-start' },
});
