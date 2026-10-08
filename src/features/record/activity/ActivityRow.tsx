// One Activity line (ACT-01, D-05, D-06, D-50): glyph, name, meta, own-currency amount, an
// optional home figure, status tags and a one-tap Mark paid. A transfer leg is an ordinary
// row with the Transfer category's tile and a dimmed figure; it never offers Mark paid
// (D-51, D-56). A projection is muted, tagged Expected and not tappable.
import React from 'react';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import type { ActivityRowView, ProjectionView } from '@/data/queries/activity';
import type { CategoryLookup } from '@/data/queries/categories';
import { money } from '@/engine/money';
import type { CardPositionOf } from './activitySections';
import { categoryName } from '@/features/record/categoryName';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, space } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { shadows, type CategorySwatchKey, type colors as ThemeColours } from '@/theme/tokens';
import { CategoryGlyph } from '@/ui/CategoryGlyph';
import type { MoneyFormatter } from '@/ui/money/useMoneyFormatter';

/** Where a row sits in its run of rows: a section is one grouped card (UI-SPEC list-row cards). */
export type CardPosition = CardPositionOf;

/** Prototype row padding: 13px 18px (space.rowPadDense = 13). */
const ROW_PAD_H = 18;

/**
 * Surface card segment: the card radius on the outer corners only, shadows.card on the run's
 * outer rows, and a 1px line1 separator above every row but the first.
 */
export function cardStyle(position: CardPosition, c: Pick<typeof ThemeColours, 'surface' | 'line1'>): ViewStyle {
  const base: ViewStyle = {
    backgroundColor: c.surface,
    paddingVertical: space.rowPadDense,
    paddingHorizontal: ROW_PAD_H,
  };
  if (position === 'only') return { ...base, borderRadius: radii.card, ...shadows.card };
  const top = position === 'first' ? radii.card : 0;
  const bottom = position === 'last' ? radii.card : 0;
  const corners: ViewStyle = {
    borderTopLeftRadius: top,
    borderTopRightRadius: top,
    borderBottomLeftRadius: bottom,
    borderBottomRightRadius: bottom,
  };
  const separator: ViewStyle = position === 'first' ? {} : { borderTopWidth: 1, borderTopColor: c.line1 };
  const shadow = position === 'middle' ? {} : shadows.card;
  return { ...base, ...corners, ...separator, ...shadow };
}

export interface ActivityRowProps {
  row: ActivityRowView;
  categories: CategoryLookup;
  accountName: (id: string) => string;
  formatter: MoneyFormatter;
  homeCurrency: string;
  /** Select mode: the row shows a checkbox and a press toggles selection instead of opening. */
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: (row: ActivityRowView) => void;
  onPress: (row: ActivityRowView) => void;
  onMarkPaid: (row: ActivityRowView) => void;
  cardPosition?: CardPosition;
}

function letterOf(name: string): string {
  const first = name.trim().charAt(0);
  return first === '' ? '?' : first.toUpperCase();
}

/**
 * Status tag. 'unpaid' (Due / Overdue / Expected) is danger, as in the prototype (UI-SPEC
 * colour amendment, 2026-10-07); danger on fill1 is 4.71:1. The word always carries the
 * meaning, never the colour alone.
 */
function Tag({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'unpaid' }) {
  const { colors, pairing } = useTheme();
  return (
    <View style={[styles.tag, { backgroundColor: colors.fill1 }]}>
      <Text style={{ ...textRole(pairing, 'label'), color: tone === 'unpaid' ? colors.danger : colors.inkMuted }}>{label}</Text>
    </View>
  );
}

export function ActivityRow({
  row,
  categories,
  accountName,
  formatter,
  homeCurrency,
  selectable = false,
  selected = false,
  onToggleSelect,
  onPress,
  onMarkPaid,
  cardPosition = 'only',
}: ActivityRowProps) {
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
  // 2026-10-07 colour amendment: money in is accent with a leading +; transfers stay inkDim.
  const isIncome = !isTransfer && row.original_amount > 0;
  const amountColor = isTransfer ? colors.inkDim : isIncome ? colors.accent : colors.ink;
  const amountShown = isIncome ? `+${amountText}` : amountText;

  const canMarkPaid = row.status === 'pending' && !isTransfer && !selectable;

  // S-WR-14: an accessibility label replaces the children, so it carries everything the row
  // shows that matters: name, amount, the home figure and the queued / overdue / due tags.
  const tagTexts = [
    row.pending ? t('sync.pendingRow') : null,
    row.overdue ? t('record.recurring.overdue') : null,
    row.status === 'pending' && !row.overdue ? t('record.recurring.dueOn', { date: formatter.formatDate(row.local_date, 'short') }) : null,
  ];
  const spoken = [name, amountText, homeText, ...tagTexts].filter((p): p is string => p !== null && p !== '').join(', ');

  const onRowPress = () => (selectable ? onToggleSelect?.(row) : onPress(row));

  return (
    <View testID={`activity-card-${row.id}`} style={[styles.card, cardStyle(cardPosition, colors)]}>
      <Pressable
        testID={`activity-row-${row.id}`}
        accessibilityRole={selectable ? 'checkbox' : 'button'}
        accessibilityLabel={selectable ? t('a11y.selectRow', { name }) : spoken}
        accessibilityState={selectable ? { checked: selected } : undefined}
        onPress={onRowPress}
        style={styles.main}
      >
        {selectable ? (
          <View
            style={[
              styles.checkbox,
              { borderColor: selected ? colors.accent : colors.inkFaint, backgroundColor: selected ? colors.accent : 'transparent' },
            ]}
          >
            {selected ? <View style={[styles.checkDot, { backgroundColor: colors.surface }]} /> : null}
          </View>
        ) : null}
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
            {row.overdue ? <Tag tone="unpaid" label={t('record.recurring.overdue')} /> : null}
            {row.status === 'pending' && !row.overdue ? (
              <Tag tone="unpaid" label={t('record.recurring.dueOn', { date: formatter.formatDate(row.local_date, 'short') })} />
            ) : null}
          </View>
        </View>
      </Pressable>
      {/* The figures and the compact Mark paid sit beside the row, so a pending line is no taller
          than a paid one. The amount repeats the row's press but is hidden from assistive tech: the
          row's own label already speaks the amount (S-WR-14). */}
      <View style={styles.amounts}>
        <Pressable
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
          onPress={onRowPress}
          style={styles.amountPress}
        >
          <Text numberOfLines={1} style={{ ...textRole(pairing, 'body'), color: amountColor }}>{amountShown}</Text>
          {homeText !== null ? (
            <Text numberOfLines={1} style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{homeText}</Text>
          ) : null}
        </Pressable>
        {canMarkPaid ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('record.recurring.markPaid')}
            hitSlop={MARK_PAID_HIT_SLOP}
            onPress={() => onMarkPaid(row)}
            style={[styles.markPaid, { backgroundColor: colors.accent }]}
          >
            <Text style={{ ...textRole(pairing, 'label'), color: colors.surface }}>{t('record.recurring.markPaid')}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

// 28pt visible + 8pt slop top and bottom = the 44pt touch minimum (space.touchMin).
const MARK_PAID_HEIGHT = 28;
const MARK_PAID_SLOP = (space.touchMin - MARK_PAID_HEIGHT) / 2;
const MARK_PAID_HIT_SLOP = { top: MARK_PAID_SLOP, bottom: MARK_PAID_SLOP, left: MARK_PAID_SLOP, right: MARK_PAID_SLOP };

export interface ProjectionRowProps {
  projection: ProjectionView;
  categories: CategoryLookup;
  accountName: (id: string) => string;
  formatter: MoneyFormatter;
  homeCurrency: string;
  cardPosition?: CardPosition;
}

export function ProjectionRow({ projection, categories, accountName, formatter, homeCurrency, cardPosition = 'only' }: ProjectionRowProps) {
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
    <View testID={`projection-${projection.key}`} style={[styles.card, cardStyle(cardPosition, colors), { opacity: 0.7 }]}>
      <CategoryGlyph colorKey={swatchKey} letter={letterOf(projection.name || categoryLabel)} />
      <View style={styles.text}>
        <Text numberOfLines={1} style={{ ...textRole(pairing, 'body'), color: colors.inkMuted }}>
          {projection.name}
        </Text>
        <Text numberOfLines={1} style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>
          {meta}
        </Text>
        <View style={styles.tags}>
          <Tag tone="unpaid" label={t('record.recurring.projected')} />
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
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.gapMd,
  },
  main: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.gapMd,
    minHeight: space.touchMin,
    minWidth: 0,
  },
  text: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  amounts: {
    flexShrink: 0,
    alignItems: 'flex-end',
    gap: 4,
  },
  amountPress: {
    alignItems: 'flex-end',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: radii.pill,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkDot: {
    width: 8,
    height: 8,
    borderRadius: radii.pill,
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
    minHeight: MARK_PAID_HEIGHT,
    paddingHorizontal: space.gapMd,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
