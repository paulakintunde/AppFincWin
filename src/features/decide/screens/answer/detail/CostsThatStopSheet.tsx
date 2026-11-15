// 06.1-20 (D59 / N17, UX-42): "Costs that stop when you buy". New running costs, the costs the purchase stops and the sale of the old
// one, each from the check's `replaces` and the engine's own Purchase and facts (sale_counted, debt_left_after_sale). A stop's monthly
// share is the engine's monthlyEquivalentOf, never a sum written here. With nothing counted it says so and offers to add one.
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { monthlyEquivalentOf, type Fact, type Replaces } from '@/engine/decide/v3';
import { minorUnits } from '@/engine/money';
import { useT } from '@/i18n';
import { radii, space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { textRole } from '@/theme/typography';
import { ChangeRows } from '@/ui/ChangeRows';
import { LabelValueRow } from '@/ui/LabelValueRow';
import { Pill } from '@/ui/Pill';
import { Text } from '@/ui/Text';
import { DetailShell, useDetailFormat } from './detailKit';

export interface StopNames {
  /** A readable name for a stop: the bill's name or the everyday category's. */
  stop: (stopId: string) => string;
}

export interface CostsThatStopSheetProps {
  replaces: Replaces | null;
  /** Purchase.runningMonthly (my share, a month). */
  runningMonthly: number;
  facts: readonly Fact[];
  currency: string;
  names: StopNames;
  onAdd: () => void;
  onClose: () => void;
}

const factValues = (facts: readonly Fact[], code: string): Readonly<Record<string, unknown>> | null => {
  const hit = facts.find((x) => x.code === code);
  return hit === undefined ? null : (hit.values as Readonly<Record<string, unknown>>);
};

export function CostsThatStopSheet({ replaces, runningMonthly, facts, currency, names, onAdd, onClose }: CostsThatStopSheetProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const f = useDetailFormat(currency, true);
  const k = (key: string): string => String(t(`decide.screens.answerDetail.stops.${key}` as never));
  const stops = replaces?.stops ?? [];
  const sale = replaces?.sale ?? null;
  const none = stops.length === 0 && sale === null;
  const monthly = stops.map((s) => ({ stop: s, perMonth: monthlyEquivalentOf(minorUnits(s.amount), { unit: 'month', every: s.everyMonths }) as number }));
  const stoppedMonthly = monthly.reduce((sum, m) => sum + m.perMonth, 0);
  const change = runningMonthly - stoppedMonthly;
  const saleFact = factValues(facts, 'sale_counted');
  const debtFact = factValues(facts, 'debt_left_after_sale');
  const line = (key: string, values: Record<string, string>): string => String(t(`decide.v3.fact.${key}` as never, values as never));

  return (
    <DetailShell title={k('title')} sub={k('sub')} footer={t('legal.decideAnswer.footer')} onClose={onClose}>
      {none ? (
        <View testID="stops-none" style={[styles.empty, { backgroundColor: colors.fill6 }]}>
          <Text style={{ ...textRole(pairing, 'bodyStrong'), color: colors.ink }}>{k('none')}</Text>
          <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{k('replaceQ')}</Text>
          <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{k('replaceExample')}</Text>
        </View>
      ) : (
        <>
          <View testID="stops-changes">
            <ChangeRows
              rows={[
                { key: 'new', label: k('newCosts'), before: f.money(0), after: f.money(runningMonthly), beforeSpoken: f.spoken(0), afterSpoken: f.spoken(runningMonthly) },
                { key: 'stopped', label: k('stoppedCosts'), before: f.money(stoppedMonthly), after: f.money(0), beforeSpoken: f.spoken(stoppedMonthly), afterSpoken: f.spoken(0) },
              ]}
            />
          </View>
          <View testID="stops-list">
            {monthly.map(({ stop, perMonth }) => (
              <LabelValueRow
                key={stop.id}
                label={names.stop(stop.id)}
                sub={String(t('decide.screens.answerDetail.stops.stopRow' as never, { date: f.date(stop.stopDate) } as never))}
                value={f.money(perMonth)}
                a11yLabel={`${names.stop(stop.id)}, ${f.spoken(perMonth)}`}
              />
            ))}
            {sale !== null ? <LabelValueRow label={k('saleLabel')} sub={f.date(sale.arrives)} value={f.money(sale.amount)} a11yLabel={`${k('saleLabel')}, ${f.spoken(sale.amount)}`} /> : null}
          </View>
          <LabelValueRow
            label={k('change')}
            value={`${change > 0 ? '+' : change < 0 ? '−' : ''}${f.money(Math.abs(change))}`}
            valueTone="accent"
            a11yLabel={`${k('change')}, ${change < 0 ? '−' : ''}${f.spoken(Math.abs(change))}`}
          />
          {saleFact !== null && typeof saleFact['amount'] === 'number' && typeof saleFact['date'] === 'string' ? (
            <Text testID="stops-sale-counted" style={{ ...textRole(pairing, 'label'), color: colors.inkDim }}>
              {line('sale_counted', { amount: f.money(saleFact['amount']), date: f.date(saleFact['date']) })}
            </Text>
          ) : null}
          {debtFact !== null && typeof debtFact['amount'] === 'number' ? (
            <Text testID="stops-debt-left" style={{ ...textRole(pairing, 'label'), color: colors.inkDim }}>
              {line('debt_left_after_sale', { amount: f.money(debtFact['amount']) })}
            </Text>
          ) : null}
        </>
      )}
      <Pill label={k('add')} variant="secondary" onPress={onAdd} />
    </DetailShell>
  );
}

const styles = StyleSheet.create({
  empty: { borderRadius: radii.card, padding: space.cardPad, gap: space.gapSm },
});
