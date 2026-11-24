// 07-09 (INS-04, D-14, D-15, D-24, D-27, D-28): Where it went. Ranked categories for one month or the range; a tap opens Activity on that
// category. Shares and amounts come from the engine. The bar colour is chartPalette[rank % 6], set inside CategoryRow.
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router, type Href } from 'expo-router';
import type { Prepared } from '@/engine/decide/v3';
import { EMPTY_FILTER } from '@/engine/activity';
import type { InsightsRange } from '@/engine/insights';
import { useCategories } from '@/data/queries/categories';
import { useT } from '@/i18n';
import { radii, step } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { shadows, type CategorySwatchKey } from '@/theme/tokens';
import { fontSize, textRole } from '@/theme/typography';
import { useRecordContext } from '@/features/record/useRecordContext';
import { requestActivityFocus } from '@/state/activityFocus';
import { Chip } from '@/ui/Chip';
import { EmptyState } from '@/ui/EmptyState';
import { iconForCategory } from '@/ui/icons/iconFor';
import { SegmentedToggle } from '@/ui/SegmentedToggle';
import { Text } from '@/ui/Text';
import { useDetailFormat } from '@/features/decide/screens/answer/detail/detailKit';
import { CategoryRow } from '../charts/CategoryRow';
import { NO_NAMING, filterIdsOf, shownCategory, type CategoryNaming } from '../model/categoryNaming';
import { categoryModel, recordedMonths } from '../model/everyday';

const SHOWN = 8;
const PERIOD_KEY = { '6m': 'insights.range.periodSixMonths', '1y': 'insights.range.periodOneYear', all: 'insights.range.periodAll' } as const;

export function WhereItWentSection({ prepared, currency, range, naming = NO_NAMING }: { prepared: Prepared; currency: string; range: InsightsRange; naming?: CategoryNaming }) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const f = useDetailFormat(currency);
  const rc = useRecordContext();
  const categories = useCategories(rc.userId ?? undefined).data;
  const byId = useMemo(() => new Map((categories ?? []).map((c) => [c.id, c])), [categories]);
  const months = useMemo(() => recordedMonths(prepared), [prepared]);
  const [kind, setKind] = useState<'month' | 'range'>('month');
  const [picked, setPicked] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const month = picked !== null && months.includes(picked) ? picked : (months[0] ?? prepared.inputs.asOf.slice(0, 7));
  const model = useMemo(
    () => categoryModel(prepared, kind === 'month' ? { kind: 'month', month } : { kind: 'range', range }),
    [prepared, kind, month, range],
  );
  const periodName = kind === 'month' ? f.month(month) : t(PERIOD_KEY[range]);
  // A range tap lands on the latest month of the range (D-15).
  const focusMonth = kind === 'month' ? month : (model.months[model.months.length - 1] ?? month);
  const shownRows = all ? model.rows : model.rows.slice(0, SHOWN);

  const open = (categoryId: string | null): void => {
    // 07 D-33: a row that gathers a partner's category on shared lines opens Activity on every stored id behind it.
    requestActivityFocus({ month: focusMonth, filter: { ...EMPTY_FILTER, categoryIds: filterIdsOf(categoryId, naming), direction: 'out' } });
    router.navigate('/activity' as Href);
  };

  return (
    <View testID="insights-where" style={[styles.card, shadows.card, { backgroundColor: colors.surface }]}>
      <Text accessibilityRole="header" style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink }}>
        {t('insights.categories.title')}
      </Text>
      <SegmentedToggle
        haptic={false}
        accessibilityLabel={t('insights.categories.periodLabel')}
        value={kind}
        onChange={(k) => {
          setKind(k as 'month' | 'range');
          setAll(false);
        }}
        options={[
          { key: 'month', label: t('insights.categories.periodMonth') },
          { key: 'range', label: t('insights.categories.periodRange') },
        ]}
      />
      {kind === 'month' ? (
        <View accessibilityRole="radiogroup" accessibilityLabel={t('insights.categories.monthPicker')} style={styles.chips}>
          {months.map((m) => (
            <Chip
              key={m}
              label={f.month(m)}
              selected={m === month}
              onPress={() => {
                setPicked(m);
                setAll(false);
              }}
            />
          ))}
        </View>
      ) : null}
      {model.rows.length === 0 && model.rest === null ? (
        <EmptyState heading={t('insights.categories.emptyHeading', { period: periodName })} body={t('insights.categories.emptyBody')} testID="insights-where-empty" />
      ) : (
        <>
          <Text testID="insights-where-total" style={{ ...textRole(pairing, 'bodyStrong'), color: colors.ink }}>
            {`${periodName}: ${t('insights.categories.total', { amount: f.money(model.total) })}`}
          </Text>
          <View>
            {shownRows.map((r, rank) => {
              const shown = shownCategory(r.categoryId, byId, naming, t as never);
              const name = shown.name;
              const row = shown.glyph;
              return (
                <CategoryRow
                  key={r.categoryId ?? 'none'}
                  testID={`insights-cat-${r.categoryId ?? 'none'}`}
                  categoryId={r.categoryId}
                  glyph={row ? { colorKey: ((row.color_key as CategorySwatchKey | null) ?? 'slate') as CategorySwatchKey, letter: name.charAt(0).toUpperCase(), icon: iconForCategory(row) } : null}
                  name={name}
                  amount={f.money(r.amount)}
                  spokenAmount={f.spoken(r.amount)}
                  shareBp={r.shareBp}
                  colorIndex={rank}
                  onPress={() => open(r.categoryId)}
                />
              );
            })}
            {model.rest !== null && (all || model.rows.length <= SHOWN) ? (
              <CategoryRow
                testID="insights-cat-rest"
                categoryId={null}
                glyph={null}
                name={t('insights.categories.everythingElse')}
                amount={f.money(model.rest.amount)}
                spokenAmount={f.spoken(model.rest.amount)}
                shareBp={model.rest.shareBp}
                colorIndex={null}
              />
            ) : null}
          </View>
          {!all && model.rows.length > SHOWN ? (
            <Pressable
              testID="insights-where-show-all"
              accessibilityRole="button"
              onPress={() => setAll(true)}
              style={styles.showAll}
            >
              <Text style={{ ...textRole(pairing, 'label'), color: colors.accent }}>{t('insights.categories.showAll', { count: model.rows.length + (model.rest === null ? 0 : 1) })}</Text>
            </Pressable>
          ) : null}
        </>
      )}
      {model.leftOut ? (
        <Text testID="insights-where-leftout" style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted }}>
          {t('insights.categories.leftOutNote')}
        </Text>
      ) : null}
      <Text testID="insights-where-debt-note" style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted }}>
        {t('insights.categories.debtSavingNote')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, padding: step.card, gap: step.row },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: step.tight },
  showAll: { minHeight: 44, justifyContent: 'center' },
});
