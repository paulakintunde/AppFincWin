// HOME-03 / D-34 / D-36: Home's Coming up card. Up to four unpaid bills, overdue first as chosen by
// selectComingUp. Recorded rows get a one-tap Pay (the existing Mark paid path, with its toast and
// Undo); projected rows have no Pay and open a read-only detail, because a projected bill cannot be
// paid until it is recorded (T-03-23-01).
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/Text';
import type { ActivityRowView, ProjectionView } from '@/data/queries/activity';
import type { CategoryLookup } from '@/data/queries/categories';
import { money } from '@/engine/money';
import { categoryName } from '@/features/record/categoryName';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { FONT_PAIRINGS } from '@/theme/fonts';
import { radii, size, space } from '@/theme/layout';
import { shadows } from '@/theme/tokens';
import { fontSize, textRole } from '@/theme/typography';
import type { MoneyFormatter } from '@/ui/money/useMoneyFormatter';
import type { ComingUpItem } from './comingUp';

// UI-SPEC prototype-literal exceptions (Home): row side padding 18, heading padding 0/6/10, Pay
// pill padding 7 x 13, empty-state padding 22 x 20, row gap 13.
const ROW_PAD_H = 18;
const ROW_GAP = 13;
const HEADING_PAD_H = 6;
const HEADING_PAD_BOTTOM = 10;
const PAY_PAD_V = 7;
const PAY_PAD_H = 13;
const EMPTY_PAD_V = 22;
const HIT_SLOP = (space.touchMin - 28) / 2;

export interface ComingUpCardProps {
  items: readonly ComingUpItem[];
  total: number;
  month: string;
  formatter: MoneyFormatter;
  homeCurrency: string;
  categories: CategoryLookup;
  loading: boolean;
  onPay(row: ActivityRowView): void;
  onOpenRow(row: ActivityRowView): void;
  onOpenProjection(projection: ProjectionView): void;
  onSeeAll(): void;
}

function monthWord(formatter: MoneyFormatter, date: string): string {
  const raw = new Intl.DateTimeFormat(formatter.locale, { month: 'short', timeZone: 'UTC' }).format(
    Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, 1)
  );
  return raw.replace(/\.$/, '').slice(0, 3);
}

export function ComingUpCard({
  items,
  total,
  month,
  formatter,
  homeCurrency,
  categories,
  loading,
  onPay,
  onOpenRow,
  onOpenProjection,
  onSeeAll,
}: ComingUpCardProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const bodyFont = FONT_PAIRINGS[pairing].body;

  const heading = (
    <View style={styles.headingRow}>
      <Text accessibilityRole="header" style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>
        {t('home.upcoming.heading')}
      </Text>
      {total > 0 ? (
        <Pressable
          accessibilityRole="button"
          onPress={onSeeAll}
          hitSlop={HIT_SLOP}
          style={styles.seeAll}
        >
          {({ pressed }) => (
            <Text style={{ ...textRole(pairing, 'label'), color: pressed ? colors.ink : colors.accent }}>
              {t('home.upcoming.seeAll')}
            </Text>
          )}
        </Pressable>
      ) : null}
    </View>
  );

  const card = [styles.card, { backgroundColor: colors.surface }, shadows.card];

  if (loading) {
    return (
      <View>
        {heading}
        <View style={card} accessible accessibilityLabel={t('home.loading')} accessibilityState={{ busy: true }}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={[styles.row, i === 0 ? null : { borderTopWidth: 1, borderTopColor: colors.fill2 }]}>
              <View style={[styles.dateBlock, { backgroundColor: colors.fill1, height: size.homeDateBlock }]} />
              <View style={[styles.placeholderLine, { backgroundColor: colors.fill1 }]} />
            </View>
          ))}
        </View>
      </View>
    );
  }

  if (items.length === 0) {
    return (
      <View>
        {heading}
        <View style={card}>
          <Text
            style={{
              fontFamily: bodyFont[500],
              fontSize: fontSize.s13_5,
              lineHeight: fontSize.s13_5 * 1.5,
              color: colors.inkMuted,
              paddingVertical: EMPTY_PAD_V,
              paddingHorizontal: space.cardPadLg,
            }}
          >
            {t('home.upcoming.empty', { month: monthWord(formatter, `${month}-01`) })}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View>
      {heading}
      <View style={card}>
        {items.map((item, i) => {
          const isRow = item.kind === 'row';
          const row = item.kind === 'row' ? item.row : null;
          const projection = item.kind === 'projection' ? item.projection : null;
          const name = (row ? row.name : projection?.name) ?? '';
          const categoryId = row ? row.category_id : (projection?.categoryId ?? null);
          const category = categoryId !== null ? categories.byId.get(categoryId) : undefined;
          const categoryLabel = category ? categoryName(category, t) : '';
          const nativeAmount = row ? row.original_amount : (projection?.amount ?? 0);
          const nativeCurrency = row ? row.original_currency : (projection?.currency ?? homeCurrency);
          const amountHome = row ? row.amountHome : (projection?.amountHome ?? null);
          const waiting = amountHome === null && nativeCurrency !== homeCurrency;
          const nativeText = formatter.formatMoney(money(nativeAmount, nativeCurrency));
          const amountText = waiting
            ? nativeText
            : formatter.formatMoney(money(amountHome ?? nativeAmount, homeCurrency));
          const overdue = row?.overdue === true;

          const parts: string[] = [];
          if (row) {
            if (row.is_automatic) parts.push(t('home.upcoming.automatic'));
            if (categoryLabel !== '') parts.push(categoryLabel);
          } else {
            parts.push(t('home.upcoming.projected'));
            if (categoryLabel !== '') parts.push(categoryLabel);
          }
          if (nativeCurrency !== homeCurrency && !waiting) parts.push(nativeText);
          if (waiting) parts.push(t('activity.balance.waiting'));
          // Row 'Automatic · Category' reads as one phrase; the rest join with a dot too.
          const subText = parts.join(' · ');

          const dateLabel = formatter.formatDate(item.date, 'medium');
          const label = t(overdue ? 'home.upcoming.a11yOverdue' : 'home.upcoming.a11y', {
            name,
            amount: amountText,
            date: dateLabel,
          });
          const key = row ? row.id : (projection?.key ?? String(i));

          return (
            <View
              key={key}
              style={[styles.row, i === 0 ? null : { borderTopWidth: 1, borderTopColor: colors.fill2 }]}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={label}
                onPress={() => (row ? onOpenRow(row) : projection ? onOpenProjection(projection) : undefined)}
                style={({ pressed }) => [styles.body, pressed ? { opacity: 0.72 } : null]}
              >
                <View style={styles.dateBlock} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
                  <Text
                    scale="capped"
                    style={{
                      fontFamily: bodyFont[600],
                      fontSize: fontSize.tabLabel,
                      letterSpacing: fontSize.tabLabel * 0.09,
                      color: colors.inkMuted,
                      textTransform: 'uppercase',
                    }}
                  >
                    {monthWord(formatter, item.date)}
                  </Text>
                  <Text scale="capped" style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink }}>
                    {Number(item.date.slice(8, 10))}
                  </Text>
                </View>
                <View style={styles.text}>
                  <Text numberOfLines={2} style={{ ...textRole(pairing, 'body'), color: colors.ink }}>
                    {name}
                  </Text>
                  <Text style={{ fontFamily: bodyFont[500], fontSize: fontSize.meta, color: colors.inkMuted }}>
                    {overdue ? (
                      <Text style={{ fontFamily: bodyFont[600], fontSize: fontSize.meta, color: colors.danger }}>
                        {t('activity.tag.overdue')}
                      </Text>
                    ) : null}
                    {overdue && subText !== '' ? ' · ' : ''}
                    {subText}
                  </Text>
                </View>
                <Text style={{ ...textRole(pairing, 'body'), color: colors.ink }}>{amountText}</Text>
              </Pressable>
              {isRow && row ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('home.upcoming.payA11y', { name })}
                  onPress={() => onPay(row)}
                  hitSlop={HIT_SLOP}
                  style={({ pressed }) => [
                    styles.pay,
                    { backgroundColor: pressed ? colors.accent : colors.fill1 },
                  ]}
                >
                  {({ pressed }) => (
                    <Text
                      style={{
                        fontFamily: bodyFont[600],
                        fontSize: fontSize.meta,
                        color: pressed ? colors.surface : colors.accent,
                      }}
                    >
                      {t('home.upcoming.pay')}
                    </Text>
                  )}
                </Pressable>
              ) : null}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: space.cardPad,
    marginTop: space.cardPad,
    paddingHorizontal: HEADING_PAD_H,
    paddingBottom: HEADING_PAD_BOTTOM,
  },
  seeAll: { minHeight: 28, justifyContent: 'center' },
  card: {
    marginHorizontal: space.cardPad,
    borderRadius: radii.card,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: ROW_GAP,
    paddingVertical: space.rowPadDense,
    paddingHorizontal: ROW_PAD_H,
    minHeight: space.touchMin,
  },
  body: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: ROW_GAP,
    minHeight: space.touchMin,
    minWidth: 0,
  },
  dateBlock: { width: size.homeDateBlock, alignItems: 'center' },
  text: { flex: 1, minWidth: 0 },
  pay: {
    borderRadius: radii.pill,
    paddingVertical: PAY_PAD_V,
    paddingHorizontal: PAY_PAD_H,
  },
  placeholderLine: { flex: 1, height: space.cardPad, borderRadius: radii.glyphTile },
});
