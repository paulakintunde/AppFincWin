// 07-09 (INS-02, INS-03, D-12, D-21, D-24): Money in and out. In / Out / Left tiles, paired bars, and a Left-each-month mode.
// Every figure comes from the engine through inOutModel; nothing is summed here.
import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { Prepared } from '@/engine/decide/v3';
import type { InsightsRange } from '@/engine/insights';
import { useT } from '@/i18n';
import { radii, step } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { shadows, stateColors } from '@/theme/tokens';
import { fontSize, textRole } from '@/theme/typography';
import { EmptyState } from '@/ui/EmptyState';
import { Glyph } from '@/ui/icons/Glyph';
import { FadeSwap } from '@/ui/motion/FadeSwap';
import { SegmentedToggle } from '@/ui/SegmentedToggle';
import { StatTile, StatTileRow } from '@/ui/StatTile';
import { Text } from '@/ui/Text';
import { SignedBars, useDetailFormat } from '@/features/decide/screens/answer/detail/detailKit';
import { ChartSummary } from '../charts/ChartSummary';
import { InOutBars } from '../charts/InOutBars';
import { inOutModel } from '../model/everyday';

const PERIOD_KEY = { '6m': 'insights.range.periodSixMonths', '1y': 'insights.range.periodOneYear', all: 'insights.range.periodAll' } as const;

export function MoneyInOutSection({ prepared, currency, range }: { prepared: Prepared; currency: string; range: InsightsRange }) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const f = useDetailFormat(currency);
  const [mode, setMode] = useState<'inout' | 'left'>('inout');
  const [selected, setSelected] = useState<string | null>(null);
  const model = useMemo(() => inOutModel(prepared, range), [prepared, range]);
  const currentMonth = prepared.inputs.asOf.slice(0, 7);
  const { bars, totals } = model;
  const withYear = bars.length > 0 && (bars[0]?.month as string).slice(0, 4) !== (bars[bars.length - 1]?.month as string).slice(0, 4);
  const period = t(PERIOD_KEY[range]);
  const short = totals.left < 0;
  const pick = bars.find((b) => b.month === selected) ?? null;
  const readout =
    pick === null
      ? null
      : (() => {
          const month = pick.month === currentMonth ? t('insights.inOut.soFar', { month: f.month(pick.month) }) : f.month(pick.month);
          const left = pick.left as number;
          return left < 0
            ? t('insights.inOut.readoutShort', { month, in: f.money(pick.comesIn), out: f.money(pick.goesOut), short: f.money(-left) })
            : t('insights.inOut.readout', { month, in: f.money(pick.comesIn), out: f.money(pick.goesOut), left: f.money(left) });
        })();

  return (
    <View testID="insights-in-out" style={[styles.card, shadows.card, { backgroundColor: colors.surface }]}>
      <Text accessibilityRole="header" style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink }}>
        {t('insights.inOut.title')}
      </Text>
      {model.empty ? (
        <EmptyState heading={t('insights.states.emptyHeading')} body={t('insights.states.emptyBody')} testID="insights-in-out-empty" />
      ) : (
        <>
          <StatTileRow columns={3}>
            <StatTile label={t('insights.inOut.tileIn')} value={f.money(totals.comesIn)} testID="insights-tile-in" />
            <StatTile label={t('insights.inOut.tileOut')} value={f.money(totals.goesOut)} testID="insights-tile-out" />
            <StatTile
              label={t('insights.inOut.tileLeft')}
              value={f.money(totals.left)}
              testID="insights-tile-left"
              status={
                short ? (
                  <View style={styles.statusRow}>
                    <Glyph name="stateShort" size={16} color={stateColors.short.color} />
                    <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: stateColors.short.color }}>{t('insights.inOut.short')}</Text>
                  </View>
                ) : undefined
              }
              statusText={short ? t('insights.inOut.short') : undefined}
            />
          </StatTileRow>
          {model.oneMonth ? <EmptyState heading={t('insights.inOut.oneMonthHeading')} body={t('insights.inOut.oneMonthBody')} testID="insights-in-out-one" /> : null}
          <SegmentedToggle
            haptic={false}
            accessibilityLabel={t('insights.inOut.modeLabel')}
            value={mode}
            onChange={(k) => setMode(k as 'inout' | 'left')}
            options={[
              { key: 'inout', label: t('insights.inOut.modeInOut') },
              { key: 'left', label: t('insights.inOut.modeLeft') },
            ]}
          />
          <FadeSwap value={`${range}:${mode}`}>
            {mode === 'inout' ? (
              <View style={styles.column}>
                <InOutBars bars={bars} currency={currency} selected={selected} onSelect={setSelected} currentMonth={currentMonth} withYear={withYear} />
                {readout !== null ? (
                  <Text testID="insights-in-out-readout" style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.ink }}>
                    {readout}
                  </Text>
                ) : null}
              </View>
            ) : (
              <SignedBars
                testID="insights-left-bars"
                currency={currency}
                chartLabel={t('insights.inOut.leftChartA11y')}
                items={bars.map((b) => ({
                  key: b.month,
                  label: b.month === currentMonth ? t('insights.inOut.soFar', { month: f.month(b.month) }) : f.month(b.month),
                  value: b.left,
                }))}
              />
            )}
          </FadeSwap>
          <ChartSummary
            text={
              mode === 'inout'
                ? t('insights.inOut.summary', { period, in: f.money(totals.comesIn), out: f.money(totals.goesOut) })
                : t('insights.inOut.leftSummary', { period })
            }
          />
          {range === 'all' ? (
            <Text testID="insights-all-window-note" style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted }}>
              {t('insights.range.allWindowNote')}
            </Text>
          ) : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, padding: step.card, gap: step.row },
  column: { gap: step.tight },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: step.hair },
});
