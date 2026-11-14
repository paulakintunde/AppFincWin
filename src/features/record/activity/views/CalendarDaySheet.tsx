/**
 * 06.2-12 (L03, NAV-06): the calendar's day sheet. Tapping a day opens this sheet in place of the old inline list: the
 * long date as the title, the day net, and that day's lines through the caller's row renderer (same rows, same actions).
 * The rise (0.26 s, no bounce), drag to dismiss and Reduce Motion all come from the app's own Sheet.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { ActivityRowView } from '@/data/queries/activity';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { textRole } from '@/theme/typography';
import { Sheet, SheetScroll } from '@/ui/Sheet';
import { SheetHeader } from '@/ui/SheetHeader';
import { Text } from '@/ui/Text';

export interface CalendarDaySheetProps {
  visible: boolean;
  /** The selected YYYY-MM-DD local date, or null when nothing is selected. */
  date: string | null;
  /** The already formatted title ("Sunday, Nov 8"). */
  title: string;
  /** The day net, signed and formatted, or null on a day with no counted lines. */
  netText: string | null;
  rows: readonly ActivityRowView[];
  renderRow: (row: ActivityRowView, index: number, all: readonly ActivityRowView[]) => React.ReactNode;
  onClose: () => void;
}

export function CalendarDaySheet({ visible, date, title, netText, rows, renderRow, onClose }: CalendarDaySheetProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const open = visible && date !== null;

  return (
    <Sheet visible={open} onDismiss={onClose} accessibilityLabel={title}>
      <View testID="calendar-day-sheet">
        <SheetHeader title={title} cancelLabel={t('appLife.calendar.close')} onCancel={onClose} />
        {netText !== null ? (
          <Text style={[textRole(pairing, 'label'), styles.net, { color: colors.inkMuted }]}>{netText}</Text>
        ) : null}
      </View>
      <SheetScroll>
        {rows.length === 0 ? (
          <Text style={{ ...textRole(pairing, 'body'), color: colors.inkMuted }}>{t('activity.calendar.empty')}</Text>
        ) : (
          rows.map((row, index) => <React.Fragment key={row.id}>{renderRow(row, index, rows)}</React.Fragment>)
        )}
      </SheetScroll>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  net: { marginBottom: 8 },
});
