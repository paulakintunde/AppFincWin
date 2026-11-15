// 06.1-20 (D54, FIN-31, FIN-24): "Full cost, with tax". Price, tax, one-off fees, plan interest and fees, running costs for a year and
// the total, all from the engine's Evaluation (planCard when the check is a plan; the tax_estimate fact otherwise). The tax row is
// labelled an estimate. A check typed in another currency carries the at-today's-rate line.
import React from 'react';
import { View } from 'react-native';
import type { CheckV2, Evaluation } from '@/engine/decide/v3';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { textRole } from '@/theme/typography';
import { LabelValueRow } from '@/ui/LabelValueRow';
import { Text } from '@/ui/Text';
import { Card, DetailShell, useDetailFormat } from './detailKit';

export interface FullCostFigures {
  price: number;
  tax: number;
  oneOffFees: number;
  /** null: not a plan. */
  planCost: number | null;
  runningYear: number;
  /** Price, tax, one-off fees and plan cost. */
  total: number;
  /** The total plus a year of running costs. */
  totalYear: number;
}

const factNumber = (e: Evaluation, code: string, key: string): number | null => {
  const hit = e.result.facts.find((f) => f.code === code);
  const v = hit === undefined ? undefined : (hit.values as Readonly<Record<string, unknown>>)[key];
  return typeof v === 'number' ? v : null;
};

/** The figures the engine states for this check: planCard for a plan, the typed price and the tax_estimate fact for a one-off. */
export function fullCostFigures(evaluation: Evaluation, check: CheckV2): FullCostFigures {
  const card = evaluation.planCard;
  const runningYear = (evaluation.purchase?.runningMonthly ?? 0) * 12;
  if (card !== null) {
    const planCost = card.interest + card.fees;
    return { price: card.price, tax: card.tax, oneOffFees: card.oneOffFees, planCost, runningYear, total: card.total, totalYear: card.total + runningYear };
  }
  const price = check.price ?? 0;
  const tax = check.taxIncluded === true ? 0 : (factNumber(evaluation, 'tax_estimate', 'amount') ?? 0);
  const total = price + tax + check.oneOffFees;
  return { price, tax, oneOffFees: check.oneOffFees, planCost: null, runningYear, total, totalYear: total + runningYear };
}

export interface FullCostSheetProps {
  itemName: string;
  currency: string;
  figures: FullCostFigures;
  /** The check is typed in another currency (FIN-24). */
  foreign?: boolean;
  onClose: () => void;
}

export function FullCostSheet({ itemName, currency, figures, foreign = false, onClose }: FullCostSheetProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const f = useDetailFormat(currency, true);
  const k = (key: string): string => String(t(`decide.screens.answerDetail.fullCost.${key}` as never));
  const hasRunning = figures.runningYear > 0;
  return (
    <DetailShell title={k('title')} footer={t('legal.decideAnswer.footer')} onClose={onClose}>
      <Text testID="fullcost-item" style={{ ...textRole(pairing, 'bodyStrong'), color: colors.ink }}>
        {itemName}
      </Text>
      <Card testID="fullcost-rows">
        <LabelValueRow label={k('price')} value={f.money(figures.price)} a11yLabel={`${k('price')}, ${f.spoken(figures.price)}`} />
        <LabelValueRow label={k('taxEstimate')} value={f.money(figures.tax)} a11yLabel={`${k('taxEstimate')}, ${f.spoken(figures.tax)}`} />
        <LabelValueRow label={k('fees')} value={f.money(figures.oneOffFees)} a11yLabel={`${k('fees')}, ${f.spoken(figures.oneOffFees)}`} />
        {figures.planCost !== null ? <LabelValueRow label={k('planCost')} value={f.money(figures.planCost)} a11yLabel={`${k('planCost')}, ${f.spoken(figures.planCost)}`} /> : null}
        {hasRunning ? <LabelValueRow label={k('running')} value={f.money(figures.runningYear)} a11yLabel={`${k('running')}, ${f.spoken(figures.runningYear)}`} /> : null}
        <LabelValueRow
          label={hasRunning ? k('totalYear') : k('total')}
          value={f.money(hasRunning ? figures.totalYear : figures.total)}
          valueTone="accent"
          a11yLabel={`${hasRunning ? k('totalYear') : k('total')}, ${f.spoken(hasRunning ? figures.totalYear : figures.total)}`}
        />
      </Card>
      {figures.planCost !== null ? <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{k('planNote')}</Text> : null}
      {foreign ? (
        <View>
          <Text testID="fullcost-foreign" style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>
            {k('atTodaysRate')}
          </Text>
        </View>
      ) : null}
    </DetailShell>
  );
}
