// HOME-03 / D-34 / D-36: Home's Coming up card. Up to four unpaid bills, overdue first as chosen by
// selectComingUp. Recorded rows get a one-tap Pay (the existing Mark paid path, with its toast and
// Undo); projected rows have no Pay and open a read-only detail, because a projected bill cannot be
// paid until it is recorded (T-03-23-01).
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/Text';
import type { MonthDataState } from '@/data/queries/monthDataState';
import type { ActivityRowView, ProjectionView } from '@/data/queries/activity';
import type { CategoryLookup } from '@/data/queries/categories';
import { money } from '@/engine/money';
import { categoryName } from '@/features/record/categoryName';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { useFontScale } from '@/theme/FontScaleProvider';
import { FONT_PAIRINGS } from '@/theme/fonts';
import { PRESSED_OPACITY, radii, size, space } from '@/theme/layout';
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
const PAY_MIN_WIDTH = 48; // prototype Pay pill: 13 + label + 13 (UI-SPEC literal)
const STACK_ABOVE = 1.3;
const HIT_SLOP = (space.touchMin - 28) / 2;

export interface ComingUpCardProps {
  items: readonly ComingUpItem[];
  total: number;
  month: string;
  formatter: MoneyFormatter;
  homeCurrency: string;
  categories: CategoryLookup;
  state: MonthDataState;
  onPay(row: ActivityRowView): void;
  onOpenRow(row: ActivityRowView): void;
  onOpenProjection(projection: ProjectionView): void;
  onSeeAll(): void;
}

function monthWord(formatter: MoneyFormatter, date: string): string {
  return new Intl.DateTimeFormat(formatter.locale, { month: 'short', timeZone: 'UTC' }).format(
    Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, 1)
  );
}

export function ComingUpCard({
  items,
  total,
  month,
  formatter,
  homeCurrency,
  categories,
  state,
  onPay,
  onOpenRow,
  onOpenProjection,
  onSeeAll,
}: ComingUpCardProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const bodyFont = FONT_PAIRINGS[pairing].body;
  const stacked = useFontScale() > STACK_ABOVE;

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

  // M1: the shadow sits on the outer view; the inner view clips the rows to the corners.
  const wrap = (children: React.ReactNode, a11y?: React.ComponentProps<typeof View>) => (
    <View style={[styles.cardOuter, { backgroundColor: colors.surface }, shadows.card]} {...a11y}>
      <View style={styles.cardInner}>{children}</View>
    </View>
  );
  const noteStyle = {
    fontFamily: bodyFont[500],
    fontSize: fontSize.s13_5,
    lineHeight: fontSize.s13_5 * 1.5,
    color: colors.inkMuted,
    paddingVertical: EMPTY_PAD_V,
    paddingHorizontal: space.cardPadLg,
  };

  if (state === 'error' || state === 'offline') {
    // No See all while the month has not loaded: there is nothing to open.
    return (
      <View>
        {heading}
        {wrap(<Text style={noteStyle}>{t(state === 'error' ? 'home.state.upcomingError' : 'home.state.upcomingOffline')}</Text>)}
      </View>
    );
  }

  if (state === 'loading') {
    return (
      <View>
        {heading}
        {wrap(
          [0, 1, 2].map((i) => (
            <View key={i} style={[styles.row, i === 0 ? null : { borderTopWidth: 1, borderTopColor: colors.fill2 }]}>
              <View style={[styles.dateBlock, { backgroundColor: colors.line4, height: size.homeDateBlock }]} />
              <View style={[styles.placeholderLine, { backgroundColor: colors.line4 }]} />
            </View>
          )),
          { accessible: true, accessibilityLabel: t('home.loading'), accessibilityState: { busy: true } }
        )}
      </View>
    );
  }

  if (items.length === 0) {
    const monthName = new Intl.DateTimeFormat(formatter.locale, { month: 'long', timeZone: 'UTC' }).format(
      Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1)
    );
    return (
      <View>
        {heading}
        {wrap(<Text style={noteStyle}>{t('home.upcoming.empty', { month: monthName })}</Text>)}
      </View>
    );
  }

  return (
    <View>
      {heading}
      {wrap(
        items.map((item, i) => {
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
                style={({ pressed }) => [styles.body, pressed ? { opacity: PRESSED_OPACITY } : null, stacked ? { flexBasis: '100%' } : null]}
              >
                <View style={styles.dateBlock} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
                  <Text
                    scale="capped"
                    numberOfLines={1}
                    style={{
                      fontFamily: bodyFont[600],
                      fontSize: fontSize.tabLabel,
                      letterSpacing: fontSize.tabLabel * 0.09,
                      color: colors.inkMuted,
                    }}
                  >
                    {monthWord(formatter, item.date).toLocaleUpperCase(formatter.locale)}
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
                    stacked ? { alignSelf: 'flex-end' } : null,
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
              ) : stacked ? null : (
                <View testID="coming-up-pay-spacer" style={{ width: PAY_MIN_WIDTH }} />
              )}
            </View>
          );
        })
      )}
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
  cardOuter: { marginHorizontal: space.cardPad, borderRadius: radii.card },
  cardInner: { borderRadius: radii.card, overflow: 'hidden' },
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
    minWidth: PAY_MIN_WIDTH,
    alignItems: 'center',
  },
  placeholderLine: { flex: 1, height: space.cardPad, borderRadius: radii.glyphTile },
});
