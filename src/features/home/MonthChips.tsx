// HOME-02 / UI-SPEC Home 3: the month chips in the This month header. Lists the months Activity
// offers, oldest first; the selected chip is ink on surface text, the rest fill1 on inkMuted.
// Not the shared Chip (it uses the accent tint). The month change does not animate.
import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet } from 'react-native';
import { Text } from '@/ui/Text';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { FONT_PAIRINGS } from '@/theme/fonts';
import { radii, space } from '@/theme/layout';
import { fontSize } from '@/theme/typography';

// UI-SPEC Spacing "prototype-literal exceptions (Home)": chip gap and padding.
const CHIP_GAP = 5;
const CHIP_PAD_V = 5;
const CHIP_PAD_H = 11;
// L2: half the gap, so neighbouring hit areas never overlap.
const H_SLOP = Math.floor(CHIP_GAP / 2);

export interface MonthChipsProps {
  months: readonly string[];
  selected: string;
  locale: string;
  onChange(month: string): void;
}

function monthDate(month: string): number {
  return Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1);
}

export function MonthChips({ months, selected, locale, onChange }: MonthChipsProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const ordered = useMemo(() => [...months].reverse(), [months]);
  const short = useMemo(() => new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' }), [locale]);
  const long = useMemo(() => new Intl.DateTimeFormat(locale, { month: 'long', timeZone: 'UTC' }), [locale]);
  // Chip height is about 26 (5 + line + 5); reach the 44 touch minimum with a slop.
  const slop = Math.ceil(Math.max(0, space.touchMin - 26) / 2);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      accessibilityRole="tablist"
    >
      {ordered.map((m) => {
        const isSelected = m === selected;
        return (
          <Pressable
            key={m}
            accessibilityRole="tab"
            accessibilityState={{ selected: isSelected }}
            accessibilityLabel={t('home.month.chipA11y', { month: long.format(monthDate(m)), year: m.slice(0, 4) })}
            hitSlop={{ top: slop, bottom: slop, left: H_SLOP, right: H_SLOP }}
            onPress={() => onChange(m)}
            style={[styles.chip, { backgroundColor: isSelected ? colors.ink : colors.fill1 }]}
          >
            <Text
              style={{
                fontFamily: FONT_PAIRINGS[pairing].body[600],
                fontSize: fontSize.eyebrow,
                color: isSelected ? colors.surface : colors.inkMuted,
              }}
            >
              {short.format(monthDate(m))}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: CHIP_GAP, alignItems: 'center' },
  chip: {
    paddingVertical: CHIP_PAD_V,
    paddingHorizontal: CHIP_PAD_H,
    borderRadius: radii.pill,
  },
});
