/**
 * 05.3-30 (UI-SPEC How this was worked out, "Your last 6 months"): six 120-high bars, accent for a month the typical month
 * uses, inkSoft1 otherwise, danger when the month was negative, a dashed inkSoft1 outline for a half-logged or left-out
 * month. The drawing is hidden from assistive tech; one group label reads "{Month}: {amount}, {state}" for every month.
 * Rule S: three columns over two rows. At 2.0x text: a plain list of the same lines.
 */
import React from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { useT } from '@/i18n';
import { space } from '@/theme/layout';
import { useFontScale } from '@/theme/FontScaleProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { fontSize, textRole } from '@/theme/typography';
import { Text } from '@/ui/Text';
import { useV3Format } from '../shared/useV3Format';
import type { WorkedModel } from '../model/workedModel';

export const BAR_AREA = 120;
const STACK_WIDTH = 360;
const STACK_SCALE = 1.3;
const LIST_SCALE = 2;
const SHORT_MONTH = 3;
const FIGURE_MIN_FONT_SCALE = 0.8;

/** Integer bar heights, proportional to |left| against the largest, never above BAR_AREA; any non-zero month shows at least 2. */
export function barHeights(values: readonly number[], area: number = BAR_AREA): number[] {
  const max = values.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
  if (max === 0) return values.map(() => 0);
  return values.map((v) => (v === 0 ? 0 : Math.max(2, Math.round((Math.abs(v) * area) / max))));
}

type Translate = (key: string, options?: Record<string, unknown>) => string;
type Six = WorkedModel['six'][number];

export interface SixMonthBarsProps {
  six: WorkedModel['six'];
  typical: WorkedModel['typical'];
  largest: WorkedModel['largest'];
}

export function SixMonthBars({ six, typical, largest }: SixMonthBarsProps): React.JSX.Element | null {
  const t = useT() as unknown as Translate;
  const f = useV3Format();
  const { colors, pairing } = useTheme();
  const { width } = useWindowDimensions();
  const scale = useFontScale();
  const K = 'decide.v3.ui.worked.';
  if (six.length === 0) return null;

  const signed = (m: number): string => (m < 0 ? '−' : '') + f.money(Math.abs(m));
  const signedA11y = (m: number): string => (m < 0 ? '−' : '') + f.moneyA11y(Math.abs(m));
  const lineOf = (s: Six, money: (m: number) => string): string =>
    t(`${K}barA11y`, { month: f.month(s.month), amount: money(Number(s.left)), state: t(`${K}state.${s.state}`) });
  const lines = six.map((s) => lineOf(s, signed));
  const group = six.map((s) => lineOf(s, signedA11y)).join('. ');

  const heights = barHeights(six.map((s) => Number(s.left)));
  const list = scale >= LIST_SCALE;
  const perRow = width < STACK_WIDTH || scale > STACK_SCALE ? 3 : 6;
  const rows: Six[][] = [];
  for (let i = 0; i < six.length; i += perRow) rows.push(six.slice(i, i + perRow) as Six[]);

  const barFor = (s: Six, h: number): React.JSX.Element => {
    const negative = Number(s.left) < 0;
    if (s.state !== 'normal') {
      return (
        <View
          testID={`bar-${s.month}`}
          style={[styles.bar, { height: h, borderWidth: 1.5, borderStyle: 'dashed', borderColor: negative ? colors.danger : colors.inkSoft1 }]}
        />
      );
    }
    return <View testID={`bar-${s.month}`} style={[styles.bar, { height: h, backgroundColor: negative ? colors.danger : colors.accent }]} />;
  };

  const halfMonths = six.filter((s) => s.state === 'half').map((s) => f.month(s.month));

  return (
    <View style={styles.wrap}>
      {list ? (
        <View style={styles.list}>
          {lines.map((l, i) => (
            <Text key={six[i]!.month} style={{ ...textRole(pairing, 'body'), fontSize: fontSize.body, color: colors.ink }}>
              {l}
            </Text>
          ))}
        </View>
      ) : (
        <View accessible accessibilityLabel={group} style={styles.chart}>
          <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={styles.chart}>
            {rows.map((row) => (
              <View key={row[0]!.month} style={styles.row}>
                {row.map((s) => {
                  const h = heights[six.indexOf(s)]!;
                  return (
                    <View key={s.month} testID={`six-${s.month}`} style={styles.col}>
                      <Text
                        scale="capped"
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={FIGURE_MIN_FONT_SCALE}
                        style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: Number(s.left) < 0 ? colors.danger : colors.ink }}
                      >
                        {signed(Number(s.left))}
                      </Text>
                      <View style={styles.barArea}>{barFor(s, h)}</View>
                      <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted }}>
                        {f.month(s.month).slice(0, SHORT_MONTH)}
                      </Text>
                    </View>
                  );
                })}
              </View>
            ))}
          </View>
        </View>
      )}
      <View style={styles.notes}>
        {typical === null ? null : (
          <Text style={{ ...textRole(pairing, 'body'), fontSize: fontSize.body, color: colors.ink }}>
            {t(`${K}middle`, { amount: f.money(Number(typical)) })}
          </Text>
        )}
        {halfMonths.map((m) => (
          <Text key={m} style={{ ...textRole(pairing, 'body'), fontSize: fontSize.body, color: colors.inkMuted }}>
            {t(`${K}halfLogged`, { month: m })}
          </Text>
        ))}
        {largest === null ? null : (
          <Text style={{ ...textRole(pairing, 'body'), fontSize: fontSize.body, color: colors.inkMuted }}>
            {t(`${K}largest`, { month: f.month(largest.month), amount: f.money(Number(largest.amount)) })}
          </Text>
        )}
        {six.length < 6 ? (
          <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{t(`${K}basedOn`, { count: six.length })}</Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.gapMd },
  chart: { gap: space.gapMd },
  row: { flexDirection: 'row', gap: space.gapSm },
  col: { flex: 1, alignItems: 'center', gap: 4 },
  barArea: { height: BAR_AREA, width: '100%', justifyContent: 'flex-end', alignItems: 'center' },
  bar: { width: '70%', borderRadius: 4 },
  list: { gap: space.gapSm },
  notes: { gap: space.gapSm },
});
