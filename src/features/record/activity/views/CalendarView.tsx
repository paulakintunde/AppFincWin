// The Calendar view (ACT-06, ACT-16, UI-SPEC 1 Calendar): a 7-column month grid in week-start
// order (one row container per week, flex cells, so seven columns fit at any width). A day with
// activity sits on a soft tile with one dot coloured by the sign of the day net; 44px minimum cells. Tapping a day selects it
// (accent ring) and opens the day sheet with its lines and the day net. Cells and nets come from the
// engine calendarCells; the caller passes the already filtered/searched rows, and bulk select
// is not offered here.
// 06.2-12 (L03): the dot grows with what was spent that day (three sizes, same colour, size also spoken), a day with an
// unpaid bill shows the 16 slate clock, a legend under the grid names the sizes and the clock, and the selected day opens
// CalendarDaySheet instead of the old inline list.
import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/Text';
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
import { stateColors } from '@/theme/tokens';
import { Glyph } from '@/ui/icons/Glyph';
import { useMoneyFormatter } from '@/ui/money/useMoneyFormatter';
import { ActivityRow } from '../ActivityRow';
import { CalendarDaySheet } from './CalendarDaySheet';
import {
  BAND_HIGH_MAJOR,
  BAND_LOW_MAJOR,
  DOT_DIAMETER,
  dayHasBillDue,
  daySpentMinor,
  dotBand,
  minorPerMajorOf,
  type DotBand,
} from './calendarDots';

export interface CalendarViewProps {
  month: string;
  weekStart: 0 | 1;
  rows: readonly ActivityRowView[];
  today: string;
  onRowPress: (row: ActivityRowView) => void;
  renderRow?: (row: ActivityRowView) => React.ReactNode;
}

const COLUMNS = 7;
/** The dot drawn on an active day with nothing spent (money in only): today's dot, unchanged. */
const PLAIN_DOT = 5;
/** The slate clock on a day with a bill due (L03). */
const CLOCK_SIZE = 16;

/** A YYYY-MM-DD local date as "Oct 14", never shifted by the device zone. */
function shortDay(date: string, locale: string): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(Date.UTC(y, m - 1, d));
}

/** Narrow weekday initial for a day-of-week number (0 Sunday). 2023-01-01 was a Sunday. */
function weekdayInitial(dow: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, { weekday: 'narrow', timeZone: 'UTC' }).format(Date.UTC(2023, 0, 1 + dow));
}

/** The day sheet title, "Sunday, Nov 8", never shifted by the device zone. */
function longDay(date: string, locale: string): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Intl.DateTimeFormat(locale, { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(
    Date.UTC(y, m - 1, d)
  );
}

export function CalendarView({ month, weekStart, rows, today, onRowPress, renderRow }: CalendarViewProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const rc = useRecordContext();
  const formatter = useMoneyFormatter(rc.showCents);
  // The legend and the spoken band edges read in whole units ("Under $50"), whatever the cents setting.
  const wholeFormatter = useMoneyFormatter(false);
  const categories = useCategoryLookup(rc.userId ?? undefined);
  const accounts = useAccounts(rc.householdId ?? undefined).data;
  const [selected, setSelected] = useState<string | null>(null);

  const cells = useMemo(() => calendarCells(month, weekStart, rows), [month, weekStart, rows]);
  const headers = useMemo(
    () => weekdayOrder(weekStart).map((d) => ({ d, initial: weekdayInitial(d, formatter.locale) })),
    [weekStart, formatter.locale]
  );

  const accountName = useCallback(
    (id: string): string => (accounts ?? []).find((a) => a.id === id)?.name ?? '',
    [accounts]
  );

  const netColor = (net: number): string => (net > 0 ? colors.accent : net < 0 ? colors.danger : colors.inkFaint);

  const weeks = useMemo(() => {
    const out: (typeof cells)[] = [];
    for (let i = 0; i < cells.length; i += COLUMNS) out.push(cells.slice(i, i + COLUMNS));
    return out;
  }, [cells]);

  const signed = (net: number): string => {
    const text = formatter.formatMoney(money(net, rc.homeCurrency));
    return net > 0 ? `+${text}` : text;
  };

  const rowsByDate = useMemo(() => {
    const map = new Map<string, ActivityRowView[]>();
    for (const r of rows) {
      const list = map.get(r.local_date);
      if (list === undefined) map.set(r.local_date, [r]);
      else list.push(r);
    }
    return map;
  }, [rows]);

  const minorPerMajor = minorPerMajorOf(rc.homeCurrency);
  const lowText = wholeFormatter.formatMoney(money(BAND_LOW_MAJOR * minorPerMajor, rc.homeCurrency));
  const highText = wholeFormatter.formatMoney(money(BAND_HIGH_MAJOR * minorPerMajor, rc.homeCurrency));
  const bandA11y = (band: DotBand): string | null =>
    band === 'small'
      ? t('appLife.calendar.spentUnderA11y', { amount: lowText })
      : band === 'medium'
        ? t('appLife.calendar.spentBetweenA11y', { low: lowText, high: highText })
        : band === 'large'
          ? t('appLife.calendar.spentOverA11y', { amount: highText })
          : null;

  const labelStyle = { ...textRole(pairing, 'label'), color: colors.inkMuted };
  const selectedCell = cells.find((c) => c.kind === 'day' && c.date === selected);
  const selectedRows = selected === null ? [] : (rowsByDate.get(selected) ?? []);

  const sheetRow = (row: ActivityRowView, index: number, all: readonly ActivityRowView[]): React.ReactNode => {
    if (renderRow !== undefined) return renderRow(row);
    return (
      <ActivityRow
        row={row}
        categories={categories}
        accountName={accountName}
        formatter={formatter}
        homeCurrency={rc.homeCurrency}
        today={today}
        cardPosition={all.length === 1 ? 'only' : index === 0 ? 'first' : index === all.length - 1 ? 'last' : 'middle'}
        onPress={onRowPress}
        onMarkPaid={onRowPress}
      />
    );
  };

  const legendText = { ...textRole(pairing, 'label'), color: colors.inkMuted };
  const legendWord = (band: Exclude<DotBand, 'none'>): string =>
    band === 'small'
      ? t('appLife.calendar.under', { amount: lowText })
      : band === 'medium'
        ? t('appLife.calendar.between', { low: lowText, high: highText })
        : t('appLife.calendar.over', { amount: highText });
  const legendLabel = [
    t('appLife.calendar.legendA11y'),
    legendWord('small'),
    legendWord('medium'),
    legendWord('large'),
    t('appLife.calendar.billDue'),
  ].join(', ');

  return (
    <View>
      <View testID="calendar-header" style={styles.row}>
        {headers.map((h) => (
          <View key={`h-${h.d}`} style={styles.flexCell}>
            <Text style={[labelStyle, styles.center]}>{h.initial}</Text>
          </View>
        ))}
      </View>
      {weeks.map((week, w) => (
        <View key={`w-${w}`} testID={`calendar-week-${w}`} style={styles.row}>
          {week.map((cell) => {
            if (cell.kind === 'blank') {
              return <View key={cell.key} testID="calendar-blank" style={[styles.flexCell, { minHeight: space.touchMin }]} />;
            }
            const isSelected = selected === cell.date;
            const active = cell.count > 0;
            const dayRows = rowsByDate.get(cell.date) ?? [];
            const band = dotBand(daySpentMinor(dayRows), minorPerMajor);
            const billDue = dayHasBillDue(dayRows);
            const base = !active
              ? t('activity.calendar.cellEmptyA11y', { date: shortDay(cell.date, formatter.locale) })
              : t('activity.calendar.cellA11y', {
                  count: cell.count,
                  date: shortDay(cell.date, formatter.locale),
                  amount: signed(cell.net),
                });
            const spoken = [base, bandA11y(band), billDue ? t('appLife.calendar.billDueA11y') : null];
            const label = spoken.filter((part): part is string => part !== null).join(', ');
            const diameter = band === 'none' ? (active ? PLAIN_DOT : 0) : DOT_DIAMETER[band];
            return (
              <View key={cell.key} style={styles.flexCell}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={label}
                  accessibilityState={{ selected: isSelected }}
                  onPress={() => setSelected(isSelected ? null : cell.date)}
                  style={[
                    styles.cell,
                    {
                      minHeight: space.touchMin,
                      backgroundColor: active ? colors.fill1 : 'transparent',
                      borderColor: isSelected ? colors.accent : 'transparent',
                    },
                  ]}
                >
                  <Text style={{ ...textRole(pairing, 'label'), color: colors.ink }}>{cell.day}</Text>
                  <View style={styles.dots}>
                    {diameter > 0 ? (
                      <View
                        testID="calendar-dot"
                        style={{ width: diameter, height: diameter, borderRadius: diameter / 2, backgroundColor: netColor(cell.net) }}
                      />
                    ) : null}
                    {billDue ? (
                      <Glyph testID="calendar-bill-due" name="stateDue" size={CLOCK_SIZE} color={stateColors.notYet.color} />
                    ) : null}
                  </View>
                </Pressable>
              </View>
            );
          })}
        </View>
      ))}
      <View testID="calendar-legend" accessible accessibilityLabel={legendLabel} style={styles.legend}>
        {(['small', 'medium', 'large'] as const).map((band) => (
          <View key={band} style={styles.legendItem}>
            <View
              style={{
                width: DOT_DIAMETER[band],
                height: DOT_DIAMETER[band],
                borderRadius: DOT_DIAMETER[band] / 2,
                backgroundColor: colors.inkMuted,
              }}
            />
            <Text style={legendText}>{legendWord(band)}</Text>
          </View>
        ))}
        <View style={styles.legendItem}>
          <Glyph name="stateDue" size={CLOCK_SIZE} color={stateColors.notYet.color} />
          <Text style={legendText}>{t('appLife.calendar.billDue')}</Text>
        </View>
      </View>
      <CalendarDaySheet
        visible={selected !== null}
        date={selected}
        title={selected === null ? '' : longDay(selected, formatter.locale)}
        netText={selectedCell !== undefined && selectedCell.kind === 'day' && selectedCell.count > 0 ? signed(selectedCell.net) : null}
        rows={selectedRows}
        renderRow={sheetRow}
        onClose={() => setSelected(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  flexCell: { flex: 1 },
  center: { textAlign: 'center' },
  cell: {
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderRadius: radii.glyphTile,
  },
  dots: { flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: CLOCK_SIZE, marginTop: 2 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 6, marginTop: space.gapSm },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
