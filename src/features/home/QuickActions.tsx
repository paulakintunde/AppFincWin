// HOME-01 / D-30 item 1: the three quick actions. Add opens the app-wide entry sheet, Pay bills
// opens Activity on the Unpaid filter for Home's month, Import opens statement import. No Coach
// (backlog). 06.2 (D-02, D-10): each action is a 48 IconTile with the set's add / payBills / import icon in the
// accent on the accent tint, the word below; Pay bills carries the month's unpaid count (spoken "Pay bills, 5 unpaid").
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { ACTIVITY_HREF } from '@/features/auth/appHome';
import { pushOnce } from '@/shell/navigation/pushOnce';
import { Text } from '@/ui/Text';
import { EMPTY_FILTER } from '@/engine/activity';
import { openEntry } from '@/features/record/entry/entryHost';
import { useT } from '@/i18n';
import { requestActivityFocus } from '@/state/activityFocus';
import { useTheme } from '@/theme/ThemeProvider';
import { PRESSED_OPACITY, radii, space, tile } from '@/theme/layout';
import { FONT_PAIRINGS } from '@/theme/fonts';
import { fontSize } from '@/theme/typography';
import { accentTintOver } from '@/ui/EmptyState';
import { IconTile } from '@/ui/icons/IconTile';
import type { IconName } from '@/ui/icons/iconData';

// UI-SPEC prototype-literal exceptions (Home): top 18 / bottom 4 padding, 10 column gap.
const ROW_PAD_TOP = 18;
const ROW_PAD_BOTTOM = 4;
const COLUMN_GAP = 10;
// 06.2 L01: the unpaid count sits on the Pay bills tile's top-right corner, 22 round.
const COUNT_SIZE = 22;
const COUNT_PAD_H = 6;
const COUNT_OFFSET_TOP = -4;
const COUNT_OFFSET_RIGHT = -6;

type ActionKey = 'add' | 'pay' | 'import';
const ICON: Record<ActionKey, IconName> = { add: 'add', pay: 'payBills', import: 'import' };

export interface QuickActionsProps {
  month: string;
  /** The month's unpaid bills, the same count Activity's Unpaid filter shows (MonthPosition.unpaidCount). */
  unpaidCount?: number;
}

export function QuickActions({ month, unpaidCount = 0 }: QuickActionsProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const tint = accentTintOver(colors.fill1, colors.accent);
  const showCount = unpaidCount > 0;

  const items: { key: ActionKey; label: string; a11y: string; onPress: () => void }[] = [
    {
      key: 'add',
      label: t('home.quick.add'),
      a11y: t('home.quick.addA11y'),
      onPress: () => openEntry({ kind: 'new', direction: 'out' }),
    },
    {
      key: 'pay',
      label: t('home.quick.payBills'),
      a11y: showCount ? t('appLife.home.payBillsUnpaid', { count: unpaidCount }) : t('home.quick.payBillsA11y'),
      onPress: () => {
        requestActivityFocus({ month, filter: { ...EMPTY_FILTER, unpaidOnly: true } });
        router.navigate(ACTIVITY_HREF);
      },
    },
    {
      key: 'import',
      label: t('home.quick.import'),
      a11y: t('home.quick.importA11y'),
      onPress: () => pushOnce({ pathname: '/import', params: { entry: 'you', from: 'home' } } as Href),
    },
  ];

  return (
    <View style={styles.row}>
      {items.map((it) => (
        <Pressable
          key={it.key}
          accessibilityRole="button"
          accessibilityLabel={it.a11y}
          onPress={it.onPress}
          style={({ pressed }) => [styles.column, pressed ? { opacity: PRESSED_OPACITY } : null]}
        >
          <View style={styles.tileBox}>
            <IconTile icon={ICON[it.key]} size={tile.big} color={colors.accent} tint={tint} testID={`quick-tile-${it.key}`} />
            {it.key === 'pay' && showCount ? (
              <View
                testID="quick-pay-count"
                importantForAccessibility="no-hide-descendants"
                accessibilityElementsHidden
                style={[styles.count, { backgroundColor: colors.accent }]}
              >
                <Text
                  scale="capped"
                  style={{ fontSize: fontSize.eyebrow, fontFamily: FONT_PAIRINGS[pairing].body[700], color: colors.surface }}
                >
                  {String(unpaidCount)}
                </Text>
              </View>
            ) : null}
          </View>
          <Text
            style={{
              fontSize: fontSize.meta,
              fontFamily: FONT_PAIRINGS[pairing].body[600],
              color: colors.inkDim,
              textAlign: 'center',
            }}
          >
            {it.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: COLUMN_GAP,
    paddingHorizontal: space.cardPad,
    paddingTop: ROW_PAD_TOP,
    paddingBottom: ROW_PAD_BOTTOM,
  },
  column: { flex: 1, minWidth: 0, minHeight: tile.big, alignItems: 'center', gap: space.gapSm },
  tileBox: { width: tile.big, height: tile.big },
  count: {
    position: 'absolute',
    top: COUNT_OFFSET_TOP,
    right: COUNT_OFFSET_RIGHT,
    minWidth: COUNT_SIZE,
    minHeight: COUNT_SIZE,
    paddingHorizontal: COUNT_PAD_H,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
