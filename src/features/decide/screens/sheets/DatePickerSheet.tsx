/**
 * 06.1-15 (D40, D40N, FIN-24): Pick a date. A month grid (this month to 6 months ahead) as a radio group of 44 px days, paydays
 * marked with a dot and named in the day's label, today ringed. The date applies only on the primary button. A polite preview
 * line judges the check with that purchase date through useCheckEngine, settled so a screen reader is not read every tap.
 * Dates past the 90-day look-ahead say so. The sheet never writes the check itself: onUse hands the date back.
 */
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { CASH_PATH_DAYS_V3, type CheckV2, type LocalDate } from '@/engine/decide/v3';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, space } from '@/theme/layout';
import { fontSize, textRole } from '@/theme/typography';
import { Pill } from '@/ui/Pill';
import { Sheet, SheetScroll } from '@/ui/Sheet';
import { SheetHeader } from '@/ui/SheetHeader';
import { Text } from '@/ui/Text';
import { useSettledLabel } from '@/ui/useSettledLabel';
import { useCheckEngine } from '../engine/useCheckEngine';
import { sayResult, type SayDeps } from '../logic/sayResult';
import { stateForVerdict } from '../logic/stateForVerdict';
import { addMonthsTo, daysBetweenDays, daysInMonth, parseDay, toDay, weekdayOf } from './dateMath';

export interface DatePickerSheetProps {
  visible: boolean;
  /** The check being built; its purchaseDate is the starting pick. */
  check: CheckV2;
  today: LocalDate;
  paydays: readonly LocalDate[];
  /** The money set aside for it; when given and the engine finds a day it is covered, "When it's saved up" is offered. */
  savedUp?: number | null;
  locale: string;
  formatDate: (date: LocalDate) => string;
  onUse: (date: LocalDate) => void;
  onDismiss: () => void;
}

const MONTHS_AHEAD = 6; // FIN-24
const CELL = 44;
const PREVIEW_MS = 600;

const CHIP_BY_TONE = {
  fits: 'decide.state.fits',
  extra: 'decide.state.fits',
  tight: 'decide.state.adjust',
  net: 'decide.state.adjust',
  cond: 'decide.state.adjust',
  short: 'decide.state.no',
  notYet: 'decide.state.waiting',
} as const;

const monthStart = (day: string): string => `${day.slice(0, 7)}-01`;

export function DatePickerSheet(props: DatePickerSheetProps) {
  // The form mounts per opening so the pick starts from the check each time.
  return props.visible ? <DatePickerForm {...props} /> : null;
}

function DatePickerForm({ check, today, paydays, savedUp, locale, formatDate, onUse, onDismiss }: DatePickerSheetProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const initial = check.purchaseDate != null && check.purchaseDate >= today ? check.purchaseDate : today;
  const [picked, setPicked] = useState<LocalDate>(initial);
  const [shown, setShown] = useState<string>(monthStart(initial));

  const firstMonth = monthStart(today);
  const lastMonth = addMonthsTo(firstMonth, MONTHS_AHEAD);
  const paydaySet = useMemo(() => new Set(paydays), [paydays]);

  const engine = useCheckEngine({ ...check, purchaseDate: picked });
  const ready = savedUp != null && savedUp > 0 ? engine.readyDate(savedUp) : null;

  const { chip, line } = useMemo(() => {
    const result = engine.evaluation?.result;
    if (result === undefined) return { chip: '', line: '' };
    const tone = stateForVerdict(result.code, result.variant).tone;
    const deps: SayDeps = {
      t: (key, values) => (t as unknown as (k: string, v?: object) => string)(key, values),
      exists: () => true,
      money: (minor) => String(minor),
      date: (d) => formatDate(d),
      currency: '',
      today,
      names: { category: () => '', series: () => '', account: () => '', debt: () => '', envelope: () => '', figure: () => '' },
      onMissing: () => undefined,
    };
    let after = '';
    try {
      after = sayResult(result, deps).afterBuy.lead?.text ?? '';
    } catch {
      after = '';
    }
    return { chip: t(CHIP_BY_TONE[tone]), line: after };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine.evaluation, today]);

  const answer = line === '' ? chip : `${chip}. ${line}`;
  const settled = useSettledLabel(answer === '' ? '' : t('decide.screens.sheetsInput.date.preview', { date: formatDate(picked), answer }), chip, PREVIEW_MS);

  const { y, m } = parseDay(shown);
  const blanks = weekdayOf(shown);
  const total = daysInMonth(y, m);
  const fmt = useMemo(() => new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }), [locale]);
  const weekday = useMemo(() => new Intl.DateTimeFormat(locale, { weekday: 'narrow', timeZone: 'UTC' }), [locale]);
  const heads = [0, 1, 2, 3, 4, 5, 6].map((i) => weekday.format(Date.UTC(2023, 0, 1 + i)));
  const canPrev = shown > firstMonth;
  const canNext = shown < lastMonth;
  const far = daysBetweenDays(today, picked) > CASH_PATH_DAYS_V3;
  const title = t('decide.screens.sheetsInput.date.title');

  const cells: (number | null)[] = [...Array<null>(blanks).fill(null), ...Array.from({ length: total }, (_, i) => i + 1)];

  return (
    <Sheet visible onDismiss={onDismiss} accessibilityLabel={title}>
      <SheetHeader title={title} cancelLabel={t('decide.screens.common.cancel')} onCancel={onDismiss} />
      <SheetScroll contentContainerStyle={styles.column}>
        <View style={styles.monthRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('decide.screens.sheetsInput.date.earlierA11y')}
            accessibilityState={{ disabled: !canPrev }}
            disabled={!canPrev}
            onPress={() => setShown(addMonthsTo(shown, -1))}
            style={[styles.arrow, !canPrev && styles.dim]}
          >
            <Text style={{ ...textRole(pairing, 'body'), color: colors.ink }}>{'‹'}</Text>
          </Pressable>
          <Text accessibilityRole="header" style={{ ...textRole(pairing, 'heading'), color: colors.ink }}>
            {fmt.format(Date.UTC(y, m - 1, 1))}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('decide.screens.sheetsInput.date.laterA11y')}
            accessibilityState={{ disabled: !canNext }}
            disabled={!canNext}
            onPress={() => setShown(addMonthsTo(shown, 1))}
            style={[styles.arrow, !canNext && styles.dim]}
          >
            <Text style={{ ...textRole(pairing, 'body'), color: colors.ink }}>{'›'}</Text>
          </Pressable>
        </View>

        <View style={styles.grid}>
          {heads.map((h, i) => (
            <View key={`h${i}`} style={styles.cell} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted }}>{h}</Text>
            </View>
          ))}
        </View>
        <View accessibilityRole="radiogroup" accessibilityLabel={title} style={styles.grid}>
          {cells.map((n, i) => {
            if (n === null) return <View key={`b${i}`} style={styles.cell} />;
            const day = toDay(y, m, n);
            const past = day < today;
            const isToday = day === today;
            const isPayday = paydaySet.has(day);
            const selected = day === picked;
            const dateText = formatDate(day);
            const label = past
              ? t('decide.screens.sheetsInput.date.pastA11y', { date: dateText })
              : isPayday
                ? t('decide.screens.sheetsInput.date.cellPaydayA11y', { date: dateText })
                : isToday
                  ? t('decide.screens.sheetsInput.date.todayA11y', { date: dateText })
                  : dateText;
            return (
              <Pressable
                key={day}
                accessibilityRole="radio"
                accessibilityLabel={label}
                accessibilityState={{ selected, disabled: past }}
                disabled={past}
                onPress={() => setPicked(day)}
                style={[
                  styles.cell,
                  { borderRadius: radii.pill },
                  isToday && { borderWidth: 1.5, borderColor: colors.ink },
                  selected && { backgroundColor: colors.accent },
                  past && styles.dim,
                ]}
              >
                <Text style={{ ...textRole(pairing, 'body'), color: selected ? colors.surface : colors.ink }}>{n}</Text>
                {isPayday ? <View testID={`payday-${day}`} style={[styles.dot, { backgroundColor: selected ? colors.surface : colors.accent }]} /> : null}
              </Pressable>
            );
          })}
        </View>
        <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted }}>{t('decide.screens.sheetsInput.date.legend')}</Text>

        {ready !== null ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('decide.screens.sheetsInput.date.savedUp')}
            onPress={() => {
              setPicked(ready);
              setShown(monthStart(ready));
            }}
            style={styles.saved}
          >
            <Text style={{ ...textRole(pairing, 'body'), color: colors.ink }}>{t('decide.screens.sheetsInput.date.savedUp')}</Text>
            <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted }}>
              {t('decide.screens.sheetsInput.date.savedUpSub', { date: formatDate(ready) })}
            </Text>
          </Pressable>
        ) : null}

        {far ? (
          <Text accessibilityRole="alert" style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.warn1 }}>
            {t('decide.screens.sheetsInput.date.farOff')}
          </Text>
        ) : null}

        <View accessibilityLiveRegion="polite" accessible={settled !== ''} accessibilityLabel={settled === '' ? undefined : settled}>
          {settled !== '' ? <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted }}>{settled}</Text> : null}
        </View>

        <Pill label={t('decide.screens.sheetsInput.date.use', { date: formatDate(picked) })} variant="primary" onPress={() => onUse(picked)} />
      </SheetScroll>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  column: { gap: space.gapSm, paddingBottom: space.gapMd },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  arrow: { minWidth: CELL, minHeight: CELL, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, minHeight: CELL, alignItems: 'center', justifyContent: 'center', gap: 2, paddingVertical: 2 },
  dot: { width: 5, height: 5, borderRadius: 3 },
  dim: { opacity: 0.4 },
  saved: { minHeight: CELL, justifyContent: 'center', gap: 2 },
});
