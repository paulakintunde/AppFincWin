// 06-19 (D-20): "Make this the plan?" The shared confirm for the goal and debt calculators. It shows before -> after rows and
// writes nothing itself: the owner passes `onConfirm`, which is called once on the primary button. The backdrop, the Cancel
// control and "Not now" all call `onCancel` and change nothing (T-06-19-01). Declarative copy only; the choice is the user's.
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useT } from '@/i18n';
import { ChangeRows, type ChangeRow } from '@/features/grow/ui/ChangeRows';
import { space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { fontSize, textRole } from '@/theme/typography';
import { Pill } from '@/ui/Pill';
import { Sheet, SheetScroll } from '@/ui/Sheet';
import { SheetHeader } from '@/ui/SheetHeader';
import { Text } from '@/ui/Text';

export interface MakePlanSheetProps {
  visible: boolean;
  rows: readonly ChangeRow[];
  /** A short note under the rows (when it starts, what Decide will use). */
  note?: string;
  /** One line under the rows when a rule line of the user's is crossed. */
  lineNote?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function MakePlanSheet({ visible, rows, note, lineNote, onConfirm, onCancel }: MakePlanSheetProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  if (!visible) return null;
  const small = { ...textRole(pairing, 'label'), fontSize: fontSize.label, color: colors.inkMuted };
  return (
    <Sheet visible onDismiss={onCancel} accessibilityLabel={t('grow.calc.confirmTitle')}>
      <SheetHeader title={t('grow.calc.confirmTitle')} cancelLabel={t('grow.common.cancel')} onCancel={onCancel} />
      <SheetScroll>
        <View style={styles.body}>
          <Text style={{ ...textRole(pairing, 'body'), color: colors.inkDim }}>{t('grow.calc.confirmSub')}</Text>
          <ChangeRows rows={rows} />
          {lineNote ? <Text style={small}>{lineNote}</Text> : null}
          {note ? <Text style={small}>{note}</Text> : null}
          <Pill label={t('grow.calc.makePlan')} variant="primary" onPress={onConfirm} />
          <Pill label={t('grow.calc.notNow')} variant="secondary" onPress={onCancel} />
        </View>
      </SheetScroll>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: space.groupGap, paddingBottom: space.groupGap },
});
