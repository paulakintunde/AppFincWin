// The Calendar view (ACT-06, ACT-16, UI-SPEC 1 Calendar): a 7-column month grid in week-start
// order, up to three category-colour dots per day, 44px minimum cells. Tapping a day selects it
// (accent ring) and lists its lines below with the day net. Cells and nets come from the
// engine calendarCells; the caller passes the already filtered/searched rows, and bulk select
// is not offered here.
import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useAccounts } from '@/data/queries/accounts';
import type { ActivityRowView } from '@/data/queries/activity';
import { useCategoryLookup } from '@/data/queries/categories';
import { calendarCells, weekdayOrder } from '@/engine/activity';
import { money } from '@/engine/money';
import { useRecordContext } from '@/features/record/useRecordContext';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, space } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { categorySwatch, type CategorySwatchKey } from '@/theme/tokens';
import { useMoneyFormatter } from '@/ui/money/useMoneyFormatter';
import { ActivityRow } from '../ActivityRow';

export interface CalendarViewProps {
  month: string;
  weekStart: 0 | 1;
  rows: readonly ActivityRowView[];
  today: string;
  onRowPress: (row: ActivityRowView) => void;
  renderRow?: (row: ActivityRowView) => React.ReactNode;
}

const COLUMNS = 7;

/** A YYYY-MM-DD local date as "Oct 14", never shifted by the device zone. */
function shortDay(date: string, locale: string): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(Date.UTC(y, m - 1, d));
}

/** Narrow weekday initial for a day-of-week number (0 Sunday). 2023-01-01 was a Sunday. */
function weekdayInitial(dow: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, { weekday: 'narrow', timeZone: 'UTC' }).format(Date.UTC(2023, 0, 1 + dow));
}

export function CalendarView({ month, weekStart, rows, today, onRowPress, renderRow }: CalendarViewProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const { width } = useWindowDimensions();
  const rc = useRecordContext();
  const formatter = useMoneyFormatter(rc.showCents);
  const categories = useCategoryLookup(rc.userId ?? undefined);
  const accounts = useAccounts(rc.householdId ?? undefined).data;
  const [selected, setSelected] = useState<string | null>(null);

  const cellWidth = (width - 2 * space.screenH) / COLUMNS;
  const cells = useMemo(() => calendarCells(month, weekStart, rows), [month, weekStart, rows]);
  const headers = useMemo(
    () => weekdayOrder(weekStart).map((d) => ({ d, initial: weekdayInitial(d, formatter.locale) })),
    [weekStart, formatter.locale]
  );

  const accountName = useCallback(
    (id: string): string => (accounts ?? []).find((a) => a.id === id)?.name ?? '',
    [accounts]
  );

  const dotColor = (categoryId: string | null): string => {
    const key = categoryId === null ? undefined : (categories.byId.get(categoryId)?.color_key as CategorySwatchKey | undefined);
    return key !== undefined && key in categorySwatch ? categorySwatch[key].color : colors.inkFaint;
  };

  const signed = (net: number): string => {
    const text = formatter.formatMoney(money(net, rc.homeCurrency));
    return net > 0 ? `+${text}` : text;
  };

  const labelStyle = { ...textRole(pairing, 'label'), color: colors.inkMuted };
  const selectedCell = cells.find((c) => c.kind === 'day' && c.date === selected);
  const selectedRows = selected === null ? [] : rows.filter((r) => r.local_date === selected);

  const lines = selectedRows.map((row, index) => {
    if (renderRow !== undefined) return <React.Fragment key={row.id}>{renderRow(row)}</React.Fragment>;
    return (
      <ActivityRow
        key={row.id}
        row={row}
        categories={categories}
        accountName={accountName}
        formatter={formatter}
        homeCurrency={rc.homeCurrency}
        today={today}
        cardPosition={
          selectedRows.length === 1 ? 'only' : index === 0 ? 'first' : index === selectedRows.length - 1 ? 'last' : 'middle'
        }
        onPress={onRowPress}
        onMarkPaid={onRowPress}
      />
    );
  });

  return (
    <View>
      <View style={styles.grid}>
        {headers.map((h) => (
          <View key={`h-${h.d}`} style={{ width: cellWidth }}>
            <Text style={[labelStyle, styles.center]}>{h.initial}</Text>
          </View>
        ))}
        {cells.map((cell) => {
          if (cell.kind === 'blank') {
            return <View key={cell.key} testID="calendar-blank" style={{ width: cellWidth, minHeight: space.touchMin }} />;
          }
          const isSelected = selected === cell.date;
          const label =
            cell.count === 0
              ? t('activity.calendar.cellEmptyA11y', { date: shortDay(cell.date, formatter.locale) })
              : t('activity.calendar.cellA11y', {
                  count: cell.count,
                  date: shortDay(cell.date, formatter.locale),
                  amount: signed(cell.net),
                });
          return (
            <Pressable
              key={cell.key}
              accessibilityRole="button"
              accessibilityLabel={label}
              accessibilityState={{ selected: isSelected }}
              onPress={() => setSelected(isSelected ? null : cell.date)}
              style={[
                styles.cell,
                {
                  width: cellWidth,
                  minHeight: space.touchMin,
                  borderColor: isSelected ? colors.accent : 'transparent',
                },
              ]}
            >
              <Text style={{ ...textRole(pairing, 'label'), color: colors.ink }}>{cell.day}</Text>
              <View style={styles.dots}>
                {cell.dots.map((categoryId, i) => (
                  <View key={`${cell.key}-${i}`} testID="calendar-dot" style={[styles.dot, { backgroundColor: dotColor(categoryId) }]} />
                ))}
              </View>
            </Pressable>
          );
        })}
      </View>
      {selected !== null && selectedCell !== undefined && selectedCell.kind === 'day' ? (
        <View style={styles.detail}>
          <View style={styles.detailHeader}>
            <Text style={{ ...textRole(pairing, 'label'), color: colors.ink }}>
              {t('activity.calendar.dayHeading', { date: formatter.formatDate(selected, 'medium') })}
            </Text>
            {selectedCell.count > 0 ? (
              <Text style={{ ...textRole(pairing, 'label'), color: colors.ink }}>{signed(selectedCell.net)}</Text>
            ) : null}
          </View>
          {selectedRows.length === 0 ? (
            <Text style={{ ...textRole(pairing, 'body'), color: colors.inkMuted }}>{t('activity.calendar.empty')}</Text>
          ) : (
            lines
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  center: { textAlign: 'center' },
  cell: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderRadius: radii.glyphTile,
  },
  dots: { flexDirection: 'row', gap: 2, height: 6, marginTop: 2 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  detail: { marginTop: space.groupGap, gap: 8 },
  detailHeader: { flexDirection: 'row', justifyContent: 'space-between' },
});
