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

export function MonthSwitcher({ month, months, locale, onChange }: MonthSwitcherProps) {
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
              value={m === month ? '✓' : undefined}
              onPress={() => {
                setListOpen(false);
                onChange(m);
              }}
            />
          ))}
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
  chevron: {
    width: 10,
    height: 10,
    borderTopWidth: 2,
    borderRightWidth: 2,
  },
});
