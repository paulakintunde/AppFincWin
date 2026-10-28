/**
 * Plan 05.2-45 (D-24): the "What changed?" list. Seven everyday life changes; a press hands the id to the screen, which
 * opens the matching edit. The sheet itself changes nothing (D-21).
 */
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/Text';
import { Sheet, SheetScroll } from '@/ui/Sheet';
import { SheetHeader } from '@/ui/SheetHeader';
import { useT } from '@/i18n';
import { PRESSED_OPACITY, space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { textRole } from '@/theme/typography';
import { SOMETHING_CHANGED, type ChangeId } from './somethingChanged';

export interface SomethingChangedSheetProps {
  visible: boolean;
  onClose: () => void;
  onPick: (id: ChangeId) => void;
}

export function SomethingChangedSheet({ visible, onClose, onPick }: SomethingChangedSheetProps) {
  const t = useT() as unknown as (key: string) => string;
  const { colors, pairing } = useTheme();
  const title = t('decide.settings.changed.title');
  return (
    <Sheet visible={visible} onDismiss={onClose} accessibilityLabel={title}>
      <SheetHeader title={title} cancelLabel={t('record.sheet.cancel')} onCancel={onClose} />
      <SheetScroll contentContainerStyle={styles.list}>
        {SOMETHING_CHANGED.map((c, i) => (
          <Pressable
            key={c.id}
            accessibilityRole="button"
            accessibilityLabel={t(c.labelKey)}
            onPress={() => {
              onClose();
              onPick(c.id);
            }}
            style={({ pressed }) => [styles.row, i > 0 && { borderTopWidth: 1, borderTopColor: colors.line1 }, { opacity: pressed ? PRESSED_OPACITY : 1 }]}
          >
            <Text style={[styles.label, { ...textRole(pairing, 'body'), color: colors.ink }]}>{t(c.labelKey)}</Text>
            <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.chevron, { borderColor: colors.inkFaint }]} />
          </Pressable>
        ))}
      </SheetScroll>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  list: { paddingBottom: space.gapMd },
  row: { minHeight: space.touchMin, flexDirection: 'row', alignItems: 'center', gap: space.gapMd, paddingVertical: space.rowPad },
  label: { flex: 1 },
  chevron: { width: 8, height: 8, borderTopWidth: 2, borderRightWidth: 2, transform: [{ rotate: '45deg' }] },
});
