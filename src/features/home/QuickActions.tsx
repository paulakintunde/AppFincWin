// HOME-01 / D-30 item 1: the three quick actions. Add opens the app-wide entry sheet, Pay bills
// opens Activity on the Unpaid filter for Home's month, Import opens statement import. No Coach
// (backlog). Glyphs are hand-drawn bars in the accent colour and hidden from the screen reader.
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { Text } from '@/ui/Text';
import { EMPTY_FILTER } from '@/engine/activity';
import { openEntry } from '@/features/record/entry/entryHost';
import { useT } from '@/i18n';
import { requestActivityFocus } from '@/state/activityFocus';
import { useTheme } from '@/theme/ThemeProvider';
import { size, space } from '@/theme/layout';
import { FONT_PAIRINGS } from '@/theme/fonts';
import { fontSize } from '@/theme/typography';

// UI-SPEC prototype-literal exceptions (Home): top 18 / bottom 4 padding, 10 column gap, 2px bars.
const ROW_PAD_TOP = 18;
const ROW_PAD_BOTTOM = 4;
const COLUMN_GAP = 10;
const BAR = 2;
const BAR_LONG = 18;
const ARROW_ARM = 9;

function Glyph({ kind, color }: { kind: 'add' | 'pay' | 'import'; color: string }) {
  const bar = { position: 'absolute' as const, backgroundColor: color, borderRadius: BAR };
  return (
    <View style={styles.glyph} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      {kind === 'add' ? (
        <>
          <View style={[bar, { width: BAR_LONG, height: BAR }]} />
          <View style={[bar, { width: BAR, height: BAR_LONG }]} />
        </>
      ) : (
        <>
          <View style={[bar, { width: BAR, height: BAR_LONG, top: kind === 'pay' ? 3 : 1 }]} />
          <View
            style={[
              bar,
              {
                width: ARROW_ARM,
                height: BAR,
                top: kind === 'pay' ? 6 : 15,
                left: kind === 'pay' ? 4 : 5,
                transform: [{ rotate: kind === 'pay' ? '-45deg' : '45deg' }],
              },
            ]}
          />
          <View
            style={[
              bar,
              {
                width: ARROW_ARM,
                height: BAR,
                top: kind === 'pay' ? 6 : 15,
                right: kind === 'pay' ? 4 : 5,
                transform: [{ rotate: kind === 'pay' ? '45deg' : '-45deg' }],
              },
            ]}
          />
          {kind === 'import' ? <View style={[bar, { width: BAR_LONG, height: BAR, bottom: 1 }]} /> : null}
        </>
      )}
    </View>
  );
}

export function QuickActions({ month }: { month: string }) {
  const t = useT();
  const { colors, pairing } = useTheme();

  const items: { key: 'add' | 'pay' | 'import'; label: string; a11y: string; onPress: () => void }[] = [
    {
      key: 'add',
      label: t('home.quick.add'),
      a11y: t('home.quick.addA11y'),
      onPress: () => openEntry({ kind: 'new', direction: 'out' }),
    },
    {
      key: 'pay',
      label: t('home.quick.payBills'),
      a11y: t('home.quick.payBillsA11y'),
      onPress: () => {
        requestActivityFocus({ month, filter: { ...EMPTY_FILTER, unpaidOnly: true } });
        router.navigate('/activity' as Href);
      },
    },
    {
      key: 'import',
      label: t('home.quick.import'),
      a11y: t('home.quick.importA11y'),
      onPress: () => router.push({ pathname: '/import', params: { entry: 'you' } } as Href),
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
          style={({ pressed }) => [styles.column, pressed ? { opacity: 0.72 } : null]}
        >
          <View style={[styles.circle, { backgroundColor: colors.surface, borderColor: colors.line1 }]}>
            <Glyph kind={it.key} color={colors.accent} />
          </View>
          <Text style={{ fontSize: fontSize.eyebrow, fontFamily: FONT_PAIRINGS[pairing].body[500],color: colors.inkDim, textAlign: 'center' }}>
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
  column: { flex: 1, minHeight: space.touchMin, alignItems: 'center', gap: space.gapSm },
  circle: {
    width: size.homeQuickCircle,
    height: size.homeQuickCircle,
    borderRadius: size.homeQuickCircle / 2,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyph: { width: BAR_LONG + 2, height: BAR_LONG + 2, alignItems: 'center', justifyContent: 'center' },
});
