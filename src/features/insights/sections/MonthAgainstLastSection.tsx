// 07-09 (INS-05, D-13): this month against the month before. Tiles say how much more or less in words; category change rows use a neutral
// arrow glyph and a word in inkDim, never red or green (T-07-28). Every figure, including each change, is the engine's.
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { Prepared } from '@/engine/decide/v3';
import type { CategoryChange } from '@/engine/insights';
import { useCategories } from '@/data/queries/categories';
import { useT } from '@/i18n';
import { radii, step } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { shadows, type CategorySwatchKey } from '@/theme/tokens';
import { fontSize, textRole } from '@/theme/typography';
import { useRecordContext } from '@/features/record/useRecordContext';
import { CategoryGlyph } from '@/ui/CategoryGlyph';
import { Chip } from '@/ui/Chip';
import { EmptyState } from '@/ui/EmptyState';
import { Glyph } from '@/ui/icons/Glyph';
import { iconForCategory } from '@/ui/icons/iconFor';
import { StatTile, StatTileRow } from '@/ui/StatTile';
import { Text } from '@/ui/Text';
import { useDetailFormat } from '@/features/decide/screens/answer/detail/detailKit';
import { NO_NAMING, shownCategory, type CategoryNaming } from '../model/categoryNaming';
import { compareModel, recordedMonths } from '../model/everyday';

const SHOWN = 6;

export function MonthAgainstLastSection({
  prepared,
  currency,
  onAddEntry,
  naming = NO_NAMING,
}: {
  prepared: Prepared;
  currency: string;
  onAddEntry: () => void;
  naming?: CategoryNaming;
}) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const f = useDetailFormat(currency);
  const rc = useRecordContext();
  const categories = useCategories(rc.userId ?? undefined).data;
  const byId = useMemo(() => new Map((categories ?? []).map((c) => [c.id, c])), [categories]);
  const months = useMemo(() => recordedMonths(prepared), [prepared]);
  const currentMonth = prepared.inputs.asOf.slice(0, 7);
  const [picked, setPicked] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const month = picked !== null && months.includes(picked) ? picked : (months[0] ?? currentMonth);
  const cmp = useMemo(() => compareModel(prepared, month), [prepared, month]);
  const previousName = f.month(cmp.previous);
  const hasPrev = cmp.previousRecorded && cmp.totalsChange !== null;
  const bar = cmp.bar;

  const tileStatus = (change: number | null): string | undefined => {
    if (!hasPrev || change === null) return undefined;
    if (change > 0) return t('insights.compare.tileMore', { amount: f.money(change), month: previousName });
    if (change < 0) return t('insights.compare.tileLess', { amount: f.money(-change), month: previousName });
    return t('insights.compare.tileSame', { month: previousName });
  };
  const tc = cmp.totalsChange;
  const rows = all ? cmp.changes : cmp.changes.slice(0, SHOWN);

  const wordOf = (c: CategoryChange): string => {
    if (c.kind === 'new') return t('insights.compare.newThisMonth');
    if (c.kind === 'none') return t('insights.compare.noneThisMonth');
    if (c.kind === 'same') return t('insights.compare.same');
    return t(c.kind === 'more' ? 'insights.compare.more' : 'insights.compare.less');
  };

  return (
    <View testID="insights-compare" style={[styles.card, shadows.card, { backgroundColor: colors.surface }]}>
      <Text accessibilityRole="header" style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink }}>
        {t('insights.compare.title')}
      </Text>
      <View accessibilityRole="radiogroup" accessibilityLabel={t('insights.compare.monthPicker')} style={styles.chips}>
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
      {month === currentMonth ? (
        <Text testID="insights-compare-current" style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted }}>
          {t('insights.compare.currentNote')}
        </Text>
      ) : null}
      {bar === null ? (
        <EmptyState heading={t('insights.states.emptyHeading')} body={t('insights.states.emptyBody')} actionLabel={t('insights.states.emptyAction')} onAction={onAddEntry} testID="insights-compare-empty" />
      ) : (
        <>
          <StatTileRow columns={3}>
            <StatTile label={t('insights.compare.tileIn')} value={f.money(bar.comesIn)} statusText={tileStatus(tc?.comesIn ?? null)} status={statusLine(tileStatus(tc?.comesIn ?? null))} testID="insights-compare-in" />
            <StatTile label={t('insights.compare.tileOut')} value={f.money(bar.goesOut)} statusText={tileStatus(tc?.goesOut ?? null)} status={statusLine(tileStatus(tc?.goesOut ?? null))} testID="insights-compare-out" />
            <StatTile label={t('insights.compare.tileLeft')} value={f.money(bar.left)} statusText={tileStatus(tc?.left ?? null)} status={statusLine(tileStatus(tc?.left ?? null))} testID="insights-compare-left" />
          </StatTileRow>
          {!hasPrev ? (
            <EmptyState
              heading={t('insights.compare.nothingPrevHeading', { month: previousName })}
              body={t('insights.compare.nothingPrevBody')}
              actionLabel={t('insights.compare.addEntry')}
              onAction={onAddEntry}
              testID="insights-compare-nothing-prev"
            />
          ) : (
            <>
              <View>
                {rows.map((c) => {
                  const shown = shownCategory(c.categoryId, byId, naming, t as never);
                  const name = shown.name;
                  const row = shown.glyph ?? undefined;
                  const word = wordOf(c);
                  const arrow = c.kind === 'more' ? 'stateUp' : c.kind === 'less' ? 'stateDown' : null;
                  const abs = c.change < 0 ? -(c.change as number) : (c.change as number);
                  const changeText = arrow === null ? word : t('insights.compare.changeLine', { word, amount: f.money(abs) });
                  const changeSpoken =
                    c.kind === 'more'
                      ? t('insights.compare.changeMoreA11y', { amount: f.spoken(abs), month: previousName })
                      : c.kind === 'less'
                        ? t('insights.compare.changeLessA11y', { amount: f.spoken(abs), month: previousName })
                        : c.kind === 'same'
                          ? t('insights.compare.changeSameA11y', { month: previousName })
                          : word;
                  return (
                    <View
                      key={c.categoryId ?? 'none'}
                      testID={`insights-change-${c.categoryId ?? 'none'}`}
                      accessible
                      accessibilityLabel={t('insights.compare.rowA11y', { name, amount: f.spoken(c.thisMonth), month: f.month(month), change: changeSpoken })}
                      style={styles.changeRow}
                    >
                      <CategoryGlyph
                        colorKey={((row?.color_key as CategorySwatchKey | undefined) ?? 'slate') as CategorySwatchKey}
                        letter={name.charAt(0).toUpperCase()}
                        icon={iconForCategory(row)}
                        size={36}
                      />
                      <View style={styles.changeText}>
                        <Text numberOfLines={1} style={{ ...textRole(pairing, 'bodyStrong'), color: colors.ink }}>
                          {name}
                        </Text>
                        <View style={styles.changeLine}>
                          {arrow !== null ? <Glyph name={arrow} size={16} color={colors.inkDim} /> : null}
                          <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkDim }}>{changeText}</Text>
                        </View>
                      </View>
                      <Text scale="capped" style={{ ...textRole(pairing, 'bodyStrong'), color: colors.ink, fontVariant: ['tabular-nums'] }}>
                        {f.money(c.thisMonth)}
                      </Text>
                    </View>
                  );
                })}
              </View>
              {!all && cmp.changes.length > SHOWN ? (
                <Pressable testID="insights-compare-show-all" accessibilityRole="button" onPress={() => setAll(true)} style={styles.showAll}>
                  <Text style={{ ...textRole(pairing, 'label'), color: colors.accent }}>{t('insights.compare.showAll', { count: cmp.changes.length })}</Text>
                </Pressable>
              ) : null}
            </>
          )}
        </>
      )}
    </View>
  );

  function statusLine(text: string | undefined): React.ReactNode {
    if (text === undefined) return undefined;
    return <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkDim }}>{text}</Text>;
  }
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, padding: step.card, gap: step.row },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: step.tight },
  changeRow: { flexDirection: 'row', alignItems: 'center', gap: step.row, minHeight: 52, paddingVertical: step.hair },
  changeText: { flex: 1, gap: 2 },
  changeLine: { flexDirection: 'row', alignItems: 'center', gap: step.hair },
  showAll: { minHeight: 44, justifyContent: 'center' },
});
