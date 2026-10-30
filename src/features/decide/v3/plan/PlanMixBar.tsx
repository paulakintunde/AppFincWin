// 05.3-28 (DSV-09): "what the total is made of". Segments in order Price, Tax and fees, Interest, Running costs; zero
// parts are not drawn. The bar and legend are one accessibility element with the whole sentence.
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useT } from '@/i18n';
import { Text } from '@/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';
import { fontSize } from '@/theme/typography';
import type { PlanMixPart } from '../model/planModel';
import { useV3Format } from '../shared/useV3Format';

const LABEL_KEY: Record<PlanMixPart['part'], string> = {
  price: 'decide.v3.ui.plan.mixPrice',
  taxFees: 'decide.v3.ui.plan.mixTaxFees',
  interest: 'decide.v3.ui.plan.mixInterest',
  running: 'decide.v3.ui.plan.mixRunning',
};
const BAR_HEIGHT = 16;
const DOT = 10;
const RUNNING_OPACITY = 0.5;

export function PlanMixBar({ mix }: { mix: readonly PlanMixPart[] }): React.JSX.Element {
  const t = useT();
  const f = useV3Format();
  const { colors, fonts } = useTheme();
  const color = (p: PlanMixPart['part']): string => (p === 'price' ? colors.ink : p === 'taxFees' ? colors.warn2 : p === 'interest' ? colors.danger : colors.accent);
  const opacity = (p: PlanMixPart['part']): number => (p === 'running' ? RUNNING_OPACITY : 1);
  const parts = mix.filter((p) => p.amount > 0);
  const label = (p: PlanMixPart): string => t(LABEL_KEY[p.part] as never);
  // "Price $x, tax and fees $x, ...": the first word keeps its capital, the rest are lower-case.
  const sentence = parts.map((p, i) => `${i === 0 ? label(p) : label(p).toLowerCase()} ${f.moneyA11y(Number(p.amount))}`).join(', ');
  return (
    <View accessible accessibilityLabel={t('decide.v3.ui.plan.mixA11y' as never, { parts: sentence } as never)} style={styles.wrap}>
      <View style={[styles.bar, { backgroundColor: colors.fill1 }]}>
        {parts.map((p) => (
          <View key={p.part} style={{ flexGrow: Number(p.amount), flexBasis: 0, backgroundColor: color(p.part), opacity: opacity(p.part) }} />
        ))}
      </View>
      <View style={styles.legend}>
        {parts.map((p) => (
          <View key={p.part} style={styles.legendItem}>
            <View style={[styles.dot, { backgroundColor: color(p.part), opacity: opacity(p.part) }]} />
            <Text style={{ fontFamily: fonts.body[500], fontSize: fontSize.label, lineHeight: fontSize.label * 1.4, color: colors.inkDim, flexShrink: 1 }}>
              {label(p)}{' '}
              <Text style={{ fontFamily: fonts.body[700], fontSize: fontSize.label, color: colors.ink }}>{f.money(Number(p.amount))}</Text>
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.gapMd },
  bar: { height: BAR_HEIGHT, borderRadius: BAR_HEIGHT / 2, flexDirection: 'row', gap: 2, overflow: 'hidden' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space.cardPad, rowGap: space.gapSm },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: space.gapSm, flexShrink: 1 },
  dot: { width: DOT, height: DOT, borderRadius: 3 },
});
