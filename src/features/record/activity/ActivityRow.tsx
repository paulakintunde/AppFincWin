// One Activity line (ACT-01, D-05, D-06, D-50): glyph, name, meta, own-currency amount, an
// optional home figure, status tags and a one-tap Mark paid. A transfer leg is an ordinary
// row with the Transfer category's tile and a dimmed figure; it never offers Mark paid
// (D-51, D-56). A projection is muted, tagged Expected and not tappable.
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ActivityRowView, ProjectionView } from '@/data/queries/activity';
import type { CategoryLookup } from '@/data/queries/categories';
import { money } from '@/engine/money';
import { categoryName } from '@/features/record/categoryName';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, space } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import type { CategorySwatchKey } from '@/theme/tokens';
import { CategoryGlyph } from '@/ui/CategoryGlyph';
import { Pill } from '@/ui/Pill';
import type { MoneyFormatter } from '@/ui/money/useMoneyFormatter';

export interface ActivityRowProps {
  row: ActivityRowView;
  categories: CategoryLookup;
  accountName: (id: string) => string;
  formatter: MoneyFormatter;
  homeCurrency: string;
  /** 02-23 turns selection on; until then rows are never selectable. */
  selectable?: boolean;
  onPress: (row: ActivityRowView) => void;
  onMarkPaid: (row: ActivityRowView) => void;
}

function letterOf(name: string): string {
  const first = name.trim().charAt(0);
  return first === '' ? '?' : first.toUpperCase();
}

function Tag({ label }: { label: string }) {
  const { colors, pairing } = useTheme();
  return (
    <View style={[styles.tag, { backgroundColor: colors.fill1 }]}>
      <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{label}</Text>
    </View>
  );
}

export function ActivityRow({ row, categories, accountName, formatter, homeCurrency, onPress, onMarkPaid }: ActivityRowProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const isTransfer = row.transfer_id !== null;

  const category = isTransfer
    ? categories.all.find((c) => c.id === categories.transferCategoryId)
    : row.category_id !== null
      ? categories.byId.get(row.category_id)
      : undefined;
  const categoryLabel = category ? categoryName(category, t) : '';

  let name: string;
  if (isTransfer) {
    const other = row.counterpartAccountId !== null ? accountName(row.counterpartAccountId) : '';
    if (other === '') name = t('activity.transferOther');
    else if (row.original_amount < 0) name = t('activity.transferTo', { account: other });
    else name = t('activity.transferFrom', { account: other });
  } else {
    name = row.name ?? categoryLabel;
  }

  const swatchKey: CategorySwatchKey = (category?.color_key as CategorySwatchKey | undefined) ?? 'slate';
  const letter = letterOf(isTransfer ? t('activity.transferOther') : name || categoryLabel);

  const metaParts = [isTransfer ? '' : categoryLabel, accountName(row.account_id), formatter.formatDate(row.local_date, 'short')];
  const meta = metaParts.filter((p) => p !== '').join(' · ');

  const amountText = formatter.formatMoney(money(row.original_amount, row.original_currency));
  const showHome = !isTransfer && row.original_currency !== homeCurrency && row.amountHome !== null;
  const homeText = showHome ? formatter.formatMoney(money(row.amountHome as number, homeCurrency)) : null;
  const amountColor = isTransfer ? colors.inkDim : colors.ink;

  const canMarkPaid = row.status === 'pending' && !isTransfer;

  return (
    <View style={styles.wrap}>
      <Pressable
        testID={`activity-row-${row.id}`}
        accessibilityRole="button"
        accessibilityLabel={`${name}, ${amountText}`}
        onPress={() => onPress(row)}
        style={styles.main}
      >
        <CategoryGlyph colorKey={swatchKey} letter={letter} />
        <View style={styles.text}>
          <Text numberOfLines={1} style={{ ...textRole(pairing, 'body'), color: colors.ink }}>
            {name}
          </Text>
          <Text numberOfLines={1} style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>
            {meta}
          </Text>
          <View style={styles.tags}>
            {row.pending ? <Tag label={t('sync.pendingRow')} /> : null}
            {row.overdue ? <Tag label={t('record.recurring.overdue')} /> : null}
            {row.status === 'pending' && !row.overdue ? (
              <Tag label={t('record.recurring.dueOn', { date: formatter.formatDate(row.local_date, 'short') })} />
            ) : null}
          </View>
        </View>
        <View style={styles.amounts}>
          <Text style={{ ...textRole(pairing, 'body'), color: amountColor }}>{amountText}</Text>
          {homeText !== null ? (
            <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{homeText}</Text>
          ) : null}
        </View>
      </Pressable>
      {canMarkPaid ? (
        <View style={styles.markPaid}>
          <Pill label={t('record.recurring.markPaid')} variant="primary" onPress={() => onMarkPaid(row)} />
        </View>
      ) : null}
    </View>
  );
}

export interface ProjectionRowProps {
  projection: ProjectionView;
  categories: CategoryLookup;
  accountName: (id: string) => string;
  formatter: MoneyFormatter;
  homeCurrency: string;
}

export function ProjectionRow({ projection, categories, accountName, formatter, homeCurrency }: ProjectionRowProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const category = projection.categoryId !== null ? categories.byId.get(projection.categoryId) : undefined;
  const categoryLabel = category ? categoryName(category, t) : '';
  const swatchKey: CategorySwatchKey = (category?.color_key as CategorySwatchKey | undefined) ?? 'slate';
  const amountText = formatter.formatMoney(money(projection.amount, projection.currency));
  const showHome = projection.currency !== homeCurrency && projection.amountHome !== null;
  const meta = [categoryLabel, accountName(projection.accountId), formatter.formatDate(projection.date, 'short')]
    .filter((p) => p !== '')
    .join(' · ');

  return (
    <View testID={`projection-${projection.key}`} style={[styles.wrap, styles.main, { opacity: 0.7 }]}>
      <CategoryGlyph colorKey={swatchKey} letter={letterOf(projection.name || categoryLabel)} />
      <View style={styles.text}>
        <Text numberOfLines={1} style={{ ...textRole(pairing, 'body'), color: colors.inkMuted }}>
          {projection.name}
        </Text>
        <Text numberOfLines={1} style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>
          {meta}
        </Text>
        <View style={styles.tags}>
          <Tag label={t('record.recurring.projected')} />
        </View>
      </View>
      <View style={styles.amounts}>
        <Text style={{ ...textRole(pairing, 'body'), color: colors.inkMuted }}>{amountText}</Text>
        {showHome ? (
          <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>
            {formatter.formatMoney(money(projection.amountHome as number, homeCurrency))}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingVertical: space.gapSm,
  },
  main: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.gapMd,
    minHeight: space.touchMin,
  },
  text: {
    flex: 1,
    gap: 2,
  },
  amounts: {
    alignItems: 'flex-end',
  },
  tags: {
    flexDirection: 'row',
    gap: space.gapSm,
  },
  tag: {
    borderRadius: radii.pill,
    paddingHorizontal: space.gapSm,
    paddingVertical: 1,
  },
  markPaid: {
    alignItems: 'flex-start',
    paddingTop: space.gapSm,
  },
});
