// Activity filters (ACT-04, D-50): category (including Uncategorised), account, direction and
// a home-currency amount range, plus Unpaid only (pending lines). Amounts go through the strict amount parser (never a float
// conversion); an invalid figure shows the parser's own message and is not applied.
import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import type { AccountRow, CategoryRow } from '@/db/rows';
import { EMPTY_FILTER, type ActivityFilter } from '@/engine/activity/filters';
import { categoryName } from '@/features/record/categoryName';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, space } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { Chip } from '@/ui/Chip';
import { Pill } from '@/ui/Pill';
import { Sheet, SheetScroll } from '@/ui/Sheet';
import { SheetHeader } from '@/ui/SheetHeader';
import { useAmountParser } from '@/ui/money/useAmountParser';

export interface FilterSheetProps {
  visible: boolean;
  value: ActivityFilter;
  homeCurrency: string;
  categories: readonly CategoryRow[];
  accounts: readonly AccountRow[];
  region?: string | null;
  onApply: (f: ActivityFilter) => void;
  onClose: () => void;
}

const DIRECTIONS: readonly ActivityFilter['direction'][] = ['all', 'out', 'in', 'transfers'];

function toggled<T>(list: readonly T[] | null, item: T): readonly T[] | null {
  const current = list ?? [];
  const next = current.includes(item) ? current.filter((x) => x !== item) : [...current, item];
  return next.length === 0 ? null : next;
}

export function FilterSheet(props: FilterSheetProps) {
  if (!props.visible) return null;
  return <FilterBody {...props} />;
}

function FilterBody({ value, homeCurrency, categories, accounts, region, onApply, onClose }: FilterSheetProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const parser = useAmountParser(region ?? null);
  const [draft, setDraft] = useState<ActivityFilter>(value);
  // S-CR-01: prefill from the applied range in the region's own notation, through the same
  // parser that reads it back (string maths, never a float), so it always round-trips.
  const [minText, setMinText] = useState(() => (value.amountMin === null ? '' : parser.toInputText(value.amountMin, homeCurrency)));
  const [maxText, setMaxText] = useState(() => (value.amountMax === null ? '' : parser.toInputText(value.amountMax, homeCurrency)));
  const [error, setError] = useState<string | null>(null);

  const labelStyle = { ...textRole(pairing, 'label'), color: colors.inkMuted };
  const inputStyle = [
    textRole(pairing, 'body'),
    styles.input,
    { backgroundColor: colors.fill1, color: colors.ink, borderRadius: radii.card / 2 },
  ];

  const directionLabel = (dir: ActivityFilter['direction']): string => {
    switch (dir) {
      case 'all':
        return t('activity.filter.all');
      case 'out':
        return t('activity.filter.out');
      case 'in':
        return t('activity.filter.in');
      case 'transfers':
        return t('activity.filter.transfers');
    }
  };

  const parseField =(text: string): { ok: true; value: number | null } | { ok: false; message: string } => {
    if (text.trim() === '') return { ok: true, value: null };
    const result = parser.parse(text, homeCurrency);
    if (!result.ok) return { ok: false, message: parser.errorMessage(result) };
    return { ok: true, value: Math.abs(result.value as number) };
  };

  const apply = () => {
    const min = parseField(minText);
    if (!min.ok) return setError(min.message);
    const max = parseField(maxText);
    if (!max.ok) return setError(max.message);
    if (min.value !== null && max.value !== null && min.value > max.value) return setError(t('activity.filter.rangeInvalid'));
    setError(null);
    onApply({ ...draft, amountMin: min.value, amountMax: max.value });
  };

  const clear = () => {
    setDraft(EMPTY_FILTER);
    setMinText('');
    setMaxText('');
    setError(null);
    onApply(EMPTY_FILTER);
  };

  return (
    <Sheet visible onDismiss={onClose} accessibilityLabel={t('activity.filter.title')}>
      <SheetHeader title={t('activity.filter.title')} cancelLabel={t('a11y.close')} onCancel={onClose} />
      <SheetScroll contentContainerStyle={styles.body}>
        <Text style={labelStyle}>{t('activity.filter.category')}</Text>
        <View style={styles.chips}>
          {categories.map((c) => (
            <Chip
              key={c.id}
              label={categoryName(c, t)}
              selected={draft.categoryIds?.includes(c.id) ?? false}
              onPress={() => setDraft((d) => ({ ...d, categoryIds: toggled(d.categoryIds, c.id) }))}
            />
          ))}
          <Chip
            label={t('record.sheet.uncategorised')}
            selected={draft.categoryIds?.includes(null) ?? false}
            onPress={() => setDraft((d) => ({ ...d, categoryIds: toggled(d.categoryIds, null) }))}
          />
        </View>
        <Text style={labelStyle}>{t('activity.filter.account')}</Text>
        <View style={styles.chips}>
          {accounts.map((a) => (
            <Chip
              key={a.id}
              label={a.name}
              selected={draft.accountIds?.includes(a.id) ?? false}
              onPress={() => setDraft((d) => ({ ...d, accountIds: toggled(d.accountIds, a.id) }))}
            />
          ))}
        </View>
        <Text style={labelStyle}>{t('activity.filter.direction')}</Text>
        <View style={styles.chips}>
          {DIRECTIONS.map((dir) => (
            <Chip
              key={dir}
              label={directionLabel(dir)}
              selected={draft.direction === dir}
              onPress={() => setDraft((d) => ({ ...d, direction: dir }))}
            />
          ))}
        </View>
        <Text style={labelStyle}>{t('activity.filter.status')}</Text>
        <View style={styles.chips}>
          <Chip
            label={t('activity.filter.unpaidOnly')}
            selected={draft.unpaidOnly}
            onPress={() => setDraft((d) => ({ ...d, unpaidOnly: !d.unpaidOnly }))}
          />
        </View>
        <Text style={labelStyle}>{`${t('activity.filter.amount')} (${homeCurrency})`}</Text>
        <View style={styles.chips}>
          <TextInput
            accessibilityLabel={t('activity.filter.min')}
            placeholder={t('activity.filter.min')}
            placeholderTextColor={colors.inkMuted}
            keyboardType="decimal-pad"
            value={minText}
            onChangeText={setMinText}
            style={[inputStyle, styles.half]}
          />
          <TextInput
            accessibilityLabel={t('activity.filter.max')}
            placeholder={t('activity.filter.max')}
            placeholderTextColor={colors.inkMuted}
            keyboardType="decimal-pad"
            value={maxText}
            onChangeText={setMaxText}
            style={[inputStyle, styles.half]}
          />
        </View>
        {error !== null ? (
          <Text accessibilityRole="alert" style={{ ...textRole(pairing, 'label'), color: colors.danger }}>
            {error}
          </Text>
        ) : null}
        <View style={styles.chips}>
          <Pill label={t('activity.filter.clear')} variant="secondary" onPress={clear} />
          <Pill label={t('activity.filter.apply')} variant="primary" onPress={apply} />
        </View>
      </SheetScroll>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: space.gapMd,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.gapSm,
  },
  input: {
    minHeight: space.touchMin,
    paddingHorizontal: space.gapMd,
  },
  half: {
    flex: 1,
    minWidth: 120,
  },
});
