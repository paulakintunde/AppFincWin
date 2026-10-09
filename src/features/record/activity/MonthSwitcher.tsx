// ACT-02: chevrons step through the months the switcher offers (every month with data plus
// the current and next); the label opens a sheet listing all of them. `months` arrives
// newest first, so "previous" moves toward the end of the list.
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { Row } from '@/ui/Row';
import { Sheet, SheetScroll } from '@/ui/Sheet';
import { SheetHeader } from '@/ui/SheetHeader';

export function formatMonthLabel(month: string, locale: string): string {
  const [yearStr, monthStr] = month.split('-') as [string, string];
  return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    Date.UTC(Number(yearStr), Number(monthStr) - 1, 1)
  );
}

export interface MonthSwitcherProps {
  month: string;
  months: readonly string[];
  locale: string;
  onChange: (month: string) => void;
  /** ACT-15: entry count per month, shown under each month in the list. */
  counts?: ReadonlyMap<string, number>;
  /** ACT-15: the month the last row would add, or null (no row) at 12 months ahead. */
  addMonth?: string | null;
  onAddMonth?: (month: string) => void;
}

function monthName(month: string, locale: string): string {
  const [yearStr, monthStr] = month.split('-') as [string, string];
  return new Intl.DateTimeFormat(locale, { month: 'long', timeZone: 'UTC' }).format(
    Date.UTC(Number(yearStr), Number(monthStr) - 1, 1)
  );
}

function Chevron({ direction, color }: { direction: 'left' | 'right'; color: string }) {
  return (
    <View
      style={[
        styles.chevron,
        { borderColor: color, transform: [{ rotate: direction === 'left' ? '-135deg' : '45deg' }] },
      ]}
    />
  );
}

function RadioDot({ selected }: { selected: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.radio, { borderColor: selected ? colors.accent : colors.inkFaint }]}>
      {selected ? <View style={[styles.radioFill, { backgroundColor: colors.accent }]} /> : null}
    </View>
  );
}

export function MonthSwitcher({ month, months, locale, onChange, counts, addMonth = null, onAddMonth }: MonthSwitcherProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const [listOpen, setListOpen] = useState(false);

  const index = months.indexOf(month);
  const previous = index >= 0 ? months[index + 1] : undefined;
  const next = index > 0 ? months[index - 1] : undefined;

  const step = (target: string | undefined) => {
    if (target !== undefined) onChange(target);
  };

  return (
    <View style={styles.bar}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('activity.monthSwitcher.previous')}
        accessibilityState={{ disabled: previous === undefined }}
        disabled={previous === undefined}
        onPress={() => step(previous)}
        style={[styles.hit, { opacity: previous === undefined ? 0.35 : 1 }]}
      >
        <Chevron direction="left" color={colors.ink} />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('activity.monthSwitcher.label')}
        accessibilityValue={{ text: formatMonthLabel(month, locale) }}
        onPress={() => setListOpen(true)}
        style={styles.label}
      >
        <Text numberOfLines={1} style={{ ...textRole(pairing, 'body'), color: colors.ink }}>
          {formatMonthLabel(month, locale)}
        </Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('activity.monthSwitcher.next')}
        accessibilityState={{ disabled: next === undefined }}
        disabled={next === undefined}
        onPress={() => step(next)}
        style={[styles.hit, { opacity: next === undefined ? 0.35 : 1 }]}
      >
        <Chevron direction="right" color={colors.ink} />
      </Pressable>
      <Sheet visible={listOpen} onDismiss={() => setListOpen(false)} accessibilityLabel={t('activity.monthSwitcher.label')}>
        <SheetHeader
          title={t('activity.monthSwitcher.label')}
          cancelLabel={t('record.sheet.cancel')}
          onCancel={() => setListOpen(false)}
        />
        <SheetScroll>
          {months.map((m) => (
            <Row
              key={m}
              label={formatMonthLabel(m, locale)}
              sublabel={
                counts !== undefined ? t('activity.months.entries', { count: counts.get(m) ?? 0 }) : undefined
              }
              leading={<RadioDot selected={m === month} />}
              selected={m === month}
              onPress={() => {
                setListOpen(false);
                onChange(m);
              }}
            />
          ))}
          {addMonth !== null && onAddMonth !== undefined ? (
            <Row
              label={t('activity.months.add', { month: monthName(addMonth, locale) })}
              sublabel={t('activity.months.addSub')}
              onPress={() => {
                setListOpen(false);
                onAddMonth(addMonth);
                onChange(addMonth);
              }}
            />
          ) : null}
        </SheetScroll>
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.gapSm,
  },
  hit: {
    minWidth: space.touchMin,
    minHeight: space.touchMin,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    flexShrink: 1,
    minHeight: space.touchMin,
    justifyContent: 'center',
  },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioFill: { width: 8, height: 8, borderRadius: 4 },
  chevron: {
    width: 10,
    height: 10,
    borderTopWidth: 2,
    borderRightWidth: 2,
  },
});
