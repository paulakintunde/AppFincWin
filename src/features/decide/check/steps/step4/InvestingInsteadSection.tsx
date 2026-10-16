/**
 * 05-45 (D-31, D-44, D-47): step 4's collapsed "If it went into investing instead". Four projections at the rates the user
 * typed (price invested, payments invested, growth lost to a pause, net worth with and without), each captioned as a
 * projection, not a forecast. Declarative only: nothing here tells the reader to invest. The holding fee touches these
 * four views only (04 D-63). Free: no entitlement check.
 */
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { MinorUnits } from '@/engine/decide';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, space } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { Text } from '@/ui/Text';
import { investViewCopy } from '../../../copy/depthInputsCopy';
import { percentText } from '../../../copy/percentText';
import { NetWorthChart } from '../../../charts/NetWorthChart';
import { CollapsibleSection } from '../../../ui/CollapsibleSection';
import { SegmentedToggle } from '../../../ui/SegmentedToggle';
import { refText, type Translate } from '../../refText';
import type { StepProps } from '../../stepTypes';
import { Meta, moneyFn } from '../stepUi';
import { HoldingFeeInput, HorizonChips, RateChips } from './RateChips';

interface TileRow {
  label: string;
  line: string;
  caption: string;
}

export function InvestingInsteadSection(props: StepProps) {
  const { inputs, update, computation, source, whole, readOnly } = props;
  const t = useT() as Translate;
  const { colors, pairing } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const [chosen, setChosen] = useState(0);

  const views = computation.investmentViews;
  if (views === null) return null;

  const fmt = moneyFn(whole, source.currency);
  const copy = investViewCopy(views, fmt);
  const verdict = computation.verdict;
  const planTerm = verdict !== null && verdict.state !== 'missing' && verdict.plan.months > 0 ? verdict.plan.months : null;
  const chart = { formatMoney: (amount: MinorUnits) => whole.formatMoney({ amount, currency: source.currency }) };

  const rowsOf = (rows: { label: Parameters<typeof refText>[1]; figure: Parameters<typeof refText>[1]; caption: Parameters<typeof refText>[1] }[]): TileRow[] =>
    rows.map((r) => ({ label: refText(t, r.label), line: refText(t, r.figure), caption: refText(t, r.caption) }));

  const labelStyle = { ...textRole(pairing, 'label'), color: colors.ink };
  const tile = (title: string, rows: TileRow[], none?: string | null) => (
    <View key={title} style={[styles.tile, { backgroundColor: colors.surface }]}>
      <Text style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink }}>{title}</Text>
      {none ? <Meta tone="muted">{none}</Meta> : null}
      {rows.map((r, i) => (
        <View key={i} style={styles.tileRow}>
          <Text style={labelStyle}>{r.label}</Text>
          <Text style={{ ...textRole(pairing, 'body'), color: colors.inkDim }}>{r.line}</Text>
          <Meta>{r.caption}</Meta>
        </View>
      ))}
    </View>
  );

  const netRows = copy.netWorth.rows;
  const picked = Math.min(chosen, Math.max(0, netRows.length - 1));
  const path = views.netWorth[picked];
  const pickedRow = netRows[picked];

  return (
    <View style={[styles.outer, { backgroundColor: colors.fill1 }]}>
      <CollapsibleSection
        title={t('decide.depth.invest.section')}
        summary={t('decide.depth.invest.summary')}
        expanded={expanded}
        onToggle={() => setExpanded((v) => !v)}
      >
        <View style={styles.body}>
          <RateChips rates={inputs.projectionRates} onChange={(rates) => update({ projectionRates: rates })} readOnly={readOnly} />
          <HoldingFeeInput value={inputs.investHoldingFeeText} onChange={(text) => update({ investHoldingFeeText: text })} readOnly={readOnly} />
          <HorizonChips value={inputs.investHorizonMonths} planTerm={planTerm} onChange={(months) => update({ investHorizonMonths: months })} readOnly={readOnly} />
          {tile(refText(t, copy.price.title), rowsOf(copy.price.rows))}
          {tile(refText(t, copy.payments.title), rowsOf(copy.payments.rows))}
          {tile(refText(t, copy.pause.title), rowsOf(copy.pause.rows), copy.pause.none ? refText(t, copy.pause.none) : null)}
          <View style={[styles.tile, { backgroundColor: colors.surface }]}>
            <Text style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink }}>{refText(t, copy.netWorth.title)}</Text>
            {netRows.length > 1 ? (
              <SegmentedToggle
                options={netRows.map((r, i) => ({ key: String(i), label: refText(t, r.label) }))}
                value={String(picked)}
                onChange={(key) => setChosen(Number(key))}
                accessibilityLabel={t('decide.depth.invest.netWorthRateA11y')}
              />
            ) : null}
            {path !== undefined && pickedRow !== undefined ? (
              <>
                <NetWorthChart path={path} horizonMonths={views.horizonMonths} rateLabel={percentText(path.rate)} whole={chart} />
                <Meta>{refText(t, pickedRow.caption)}</Meta>
              </>
            ) : null}
          </View>
        </View>
      </CollapsibleSection>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: { borderRadius: radii.card, paddingHorizontal: space.cardPad, paddingBottom: space.cardPad },
  body: { gap: space.gapMd },
  tile: { borderRadius: radii.card, padding: space.cardPad, gap: space.gapSm },
  tileRow: { gap: 2 },
});
