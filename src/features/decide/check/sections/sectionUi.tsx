/**
 * 05-15: small presentational pieces shared by the four table sections (a divided row, a status dot, the shared props
 * shape). Nothing here decides anything; each section passes engine figures in already formatted.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { Assessment } from '@/engine/decide';
import { minorUnits } from '@/engine/money';
import type { MoneyFormatter } from '@/ui/money/useMoneyFormatter';
import { Text } from '@/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, space } from '@/theme/layout';
import { fontSize, textRole } from '@/theme/typography';
import type { CheckComputation, CheckInputs } from '../../snapshot/types';

/** Declared per section file in the plan; kept here once for the four sections of 05-15 (structurally identical). */
export interface SectionProps {
  computation: CheckComputation;
  inputs: CheckInputs;
  update: (patch: Partial<CheckInputs>) => void;
  whole: MoneyFormatter;
  exact: MoneyFormatter;
  currency: string;
  expanded: boolean;
  onToggle: () => void;
  readOnly: boolean;
}

/** The resolved assessment behind step 3's figure sections, or null (missing verdict, first read, none, unconverted). */
export function assessmentOf(c: CheckComputation): Assessment | null {
  if (c.status !== 'logged' || !c.verdict || c.verdict.state === 'missing') return null;
  return c.verdict;
}

export type Money = (minor: number) => string;
export function moneyOf(f: MoneyFormatter, currency: string): Money {
  return (n) => f.formatMoney({ amount: minorUnits(n), currency: currency as never });
}

export function Dot({ color }: { color: string }) {
  return <View accessibilityElementsHidden importantForAccessibility="no" style={[styles.dot, { backgroundColor: color }]} />;
}

export interface TableRowProps {
  label: string;
  sub?: string;
  value?: string;
  leading?: React.ReactNode;
  emphasis?: boolean;
  tone?: 'ink' | 'danger' | 'accent';
  a11yLabel?: string;
  /** A margin or fact line under the sub text, in warn1 (05-42). */
  extra?: string;
}

export function TableRow({ label, sub, value, leading, emphasis = false, tone = 'ink', a11yLabel, extra }: TableRowProps) {
  const { colors, pairing } = useTheme();
  const valueColor = tone === 'danger' ? colors.danger : tone === 'accent' ? colors.accent : colors.ink;
  return (
    <View
      accessible
      accessibilityLabel={a11yLabel ?? [label, value, sub, extra].filter(Boolean).join(', ')}
      style={[styles.row, { borderTopColor: colors.line2 }]}
    >
      {leading}
      <View style={styles.text}>
        <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.s13_5, color: colors.ink, fontWeight: emphasis ? '700' : undefined }}>{label}</Text>
        {sub ? <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted }}>{sub}</Text> : null}
        {extra ? <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.warn1 }}>{extra}</Text> : null}
      </View>
      {value ? (
        <Text scale="capped" style={{ ...textRole(pairing, 'label'), color: valueColor, textAlign: 'right' }}>
          {value}
        </Text>
      ) : null}
    </View>
  );
}

export function Note({ children }: { children: React.ReactNode }) {
  const { colors, pairing } = useTheme();
  return <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted, paddingBottom: space.gapSm }}>{children}</Text>;
}

export function Tile({ children }: { children: React.ReactNode }) {
  const { colors, pairing } = useTheme();
  return (
    <View style={[styles.tile, { backgroundColor: colors.fill1 }]}>
      <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.s13_5, color: colors.ink }}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  dot: { width: 6, height: 6, borderRadius: 3 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.gapMd,
    minHeight: space.touchMin,
    paddingVertical: space.gapSm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  text: { flex: 1, flexShrink: 1 },
  tile: { borderRadius: radii.glyphTile, padding: space.cardPad, marginTop: space.gapSm },
});
