/**
 * 05.3-38 (UI-SPEC "Facts"): one surface card of rows separated by a hairline. Figure rows put the label left and the figure
 * right (one line, shrinking); sentence rows run full width. Under rule S a figure row stacks. D-11: the over-999% sentence
 * comes from the model's key, so "9999" never reaches a text node.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useT } from '@/i18n';
import { Text } from '@/ui/Text';
import { useShouldStack } from '@/features/decide/ui/textFit';
import type { FactRow } from '@/features/decide/v3/model/factRows';
import { useV3Format, type V3Format } from '@/features/decide/v3/shared/useV3Format';
import { radii } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { fontSize, textRole } from '@/theme/typography';

type Translate = (key: string, options?: Record<string, unknown>) => string;

const MONEY_KEYS = ['quoted', 'computed', 'monthly', 'leanLeft', 'shortfall', 'bridge', 'after', 'before', 'left', 'used', 'amount'] as const;
const MINUS = '−';
const FACT_UI = 'decide.v3.ui.factRow.';
const MONTH_RE = /^\d{4}-\d{2}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Turns raw model params into strings: money by the shipped formatter, months and dates by locale, ids by name. */
export function factParams(f: V3Format, params: Readonly<Record<string, string | number>>, labelKey: string): Record<string, string> {
  const money: string[] = [...MONEY_KEYS];
  if (labelKey.endsWith('_money')) money.push('value', 'limit');
  const flat = f.flat(params, money).screen;
  const out: Record<string, string> = { ...flat };
  for (const [k, v] of Object.entries(params)) {
    if (typeof v !== 'string') continue;
    if (MONTH_RE.test(v)) out[k] = f.month(v);
    else if (DATE_RE.test(v)) out[k] = f.date(v);
  }
  return out;
}

function Figure({ row, last }: { row: FactRow; last: boolean }): React.JSX.Element {
  const t = useT() as unknown as Translate;
  const f = useV3Format();
  const { colors, pairing } = useTheme();
  const figure = row.figure === undefined ? 0 : Number(row.figure);
  const shown = row.negative === true || figure < 0 ? `${MINUS}${f.money(Math.abs(figure))}` : f.money(figure);
  const spoken = f.moneyA11y(figure);
  const stacked = useShouldStack(shown.length);
  const label = t(row.labelKey, factParams(f, row.labelParams, row.labelKey));
  // the model gives the untouched fund no sub-line; the spec reads "untouched" under it
  const subKey = row.subKey ?? (row.labelKey === `${FACT_UI}emergencyUntouched` ? `${FACT_UI}untouched` : undefined);
  const sub = subKey === undefined ? null : t(subKey, factParams(f, row.subParams ?? {}, subKey));
  const a11y = sub === null ? t(`${FACT_UI}rowA11yNoSub`, { label, figure: spoken }) : `${t(`${FACT_UI}rowA11y`, { label, figure: spoken, sub })}.`;
  const negative = row.negative === true || figure < 0;
  const figureText = (
    <Text
      scale="capped"
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.8}
      style={{ ...textRole(pairing, 'sheetTitle'), color: negative ? colors.danger : colors.ink, textAlign: stacked ? 'left' : 'right' }}
    >
      {shown}
    </Text>
  );
  const subText =
    sub === null ? null : (
      <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted, textAlign: stacked ? 'left' : 'right' }}>{sub}</Text>
    );
  return (
    <View accessible accessibilityLabel={a11y} style={[styles.row, last ? null : { borderBottomWidth: 1, borderBottomColor: colors.line1 }]}>
      {stacked ? (
        <View style={styles.stack}>
          <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.s13_5, color: colors.inkDim }}>{label}</Text>
          {figureText}
          {subText}
        </View>
      ) : (
        <View style={styles.side}>
          <Text style={[styles.label, { ...textRole(pairing, 'label'), fontSize: fontSize.s13_5, color: colors.inkDim }]}>{label}</Text>
          <View style={styles.figure}>
            {figureText}
            {subText}
          </View>
        </View>
      )}
    </View>
  );
}

function Sentence({ row, last }: { row: FactRow; last: boolean }): React.JSX.Element {
  const t = useT() as unknown as Translate;
  const f = useV3Format();
  const { colors, pairing } = useTheme();
  const params = factParams(f, row.labelParams, row.labelKey);
  // a "ready by" date reads in the same slot as a month: "Covered by 28 Oct"
  if (row.kind === 'coveredBy' && params.date !== undefined && params.month === undefined) params.month = params.date;
  const text = t(row.labelKey, params);
  const sub = row.kind === 'coveredBy' ? t('decide.v3.ui.answer.coveredBySub') : null;
  const tone = row.tone === 'warn' ? colors.warn1 : colors.inkDim;
  return (
    <View
      accessible
      accessibilityLabel={sub === null ? text : `${text}. ${sub}.`}
      style={[styles.row, last ? null : { borderBottomWidth: 1, borderBottomColor: colors.line1 }]}
    >
      <Text style={{ ...textRole(pairing, 'body'), fontSize: fontSize.s13_5, color: tone }}>{text}</Text>
      {sub === null ? null : <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted }}>{sub}</Text>}
    </View>
  );
}

export function FactRows({ rows }: { rows: readonly FactRow[] }): React.JSX.Element | null {
  const { colors } = useTheme();
  if (rows.length === 0) return null;
  return (
    <View style={[styles.card, { backgroundColor: colors.surface }]}>
      {rows.map((row, i) => {
        const last = i === rows.length - 1;
        const key = `${row.labelKey}-${i}`;
        return row.kind === 'figure' ? <Figure key={key} row={row} last={last} /> : <Sentence key={key} row={row} last={last} />;
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, paddingVertical: 2, paddingHorizontal: 18 },
  row: { minHeight: 52, justifyContent: 'center', paddingVertical: 8 },
  side: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  label: { flex: 1, flexShrink: 1 },
  figure: { flexShrink: 0, maxWidth: '55%', alignItems: 'flex-end' },
  stack: { gap: 4 },
});
