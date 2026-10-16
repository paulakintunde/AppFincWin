/**
 * 05-17 Step 4, "Alternatives" (DCU-05, DCU-06, DCU-11). Four stacked rows (as planned, cheaper, wait and save, skip) with
 * On the day / A month / Kept; a row whose money is not genuinely spare shows "—" and one amber reason from the engine's
 * suppression code, never a kept figure (DCU-06). Kept is at 0% unless the user adds a rate (D-07). The table is free: no lock,
 * no entitlement check (D-17). The check's single rate list is `inputs.projectionRates` (assumption 17).
 */
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { ZERO_PERCENT } from '@/engine/decide';
import type { AlternativeRow } from '@/engine/decide';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { useFontScale } from '@/theme/FontScaleProvider';
import { PRESSED_OPACITY, radii, space } from '@/theme/layout';
import { fontSize, textRole } from '@/theme/typography';
import { CloseGlyph } from '@/ui/CloseGlyph';
import { Text } from '@/ui/Text';
import { cheaperDescriptor, keptHeader, suppressionReason } from '../../copy/alternativesCopy';
import { percentText } from '../../copy/percentText';
import { isValidProjectionRateText, repriceInputs } from '../../snapshot/checkInputs';
import { FigureStrip } from '../../ui/FigureStrip';
import { RateInput } from '../../ui/RateInput';
import { StepSlider } from '../../ui/StepSlider';
import { refText, type Translate } from '../refText';
import type { StepProps } from '../stepTypes';
import { Card, Eyebrow, Lock, Meta, moneyFn } from './stepUi';
import { InvestingInsteadSection } from './step4/InvestingInsteadSection';

const MAX_RATES = 3;
const MIN_RATIO = 30;
const MAX_RATIO = 100;
const TWO_LINES_ABOVE = 1.3;

export function Step4Alternatives(props: StepProps) {
  const { inputs, update, computation, source, whole, exact, goToStep, readOnly } = props;
  const t = useT() as Translate;
  const { colors, pairing } = useTheme();
  const fontScale = useFontScale();
  const [adding, setAdding] = useState(false);
  const [rateText, setRateText] = useState('');

  const alts = computation.alternatives;
  const check = computation.check;
  const resolved = computation.resolvedPrice;
  if (alts === null || check === null || resolved === null) return <View />;

  const fmt = moneyFn(whole, source.currency);
  const cents = moneyFn(exact, source.currency);
  const methodName = t(`decide.method.${inputs.method ?? 'none'}`);
  const rates = inputs.projectionRates;
  const rateSet = alts.projectionReturn !== ZERO_PERCENT;
  const [asPlanned, cheaperRow, waitRow] = alts.rows;
  const verdict = computation.verdict;
  const plannedMonthly = verdict !== null && verdict.state !== 'missing' ? verdict.mineMonthly : (asPlanned.monthly ?? 0);

  const descriptor = (row: AlternativeRow): string => {
    switch (row.code) {
      case 'as_planned':
        return t('decide.alt.descPlanned', { price: fmt(resolved.price), method: methodName });
      case 'cheaper':
        return refText(t, cheaperDescriptor(alts, check, fmt, methodName));
      case 'wait_and_save':
        return t('decide.alt.descWait', { count: alts.monthsToBuy ?? alts.waitMonths, payment: cents(plannedMonthly) });
      case 'skip':
        return t('decide.alt.descSkip');
    }
  };

  const commitRate = () => {
    const text = rateText.trim();
    if (text === '' || !isValidProjectionRateText(text) || rates.length >= MAX_RATES) return;
    if (!rates.includes(text)) update({ projectionRates: [...rates, text] });
    setRateText('');
    setAdding(false);
  };
  const rateTooHigh = rateText.trim() !== '' && !isValidProjectionRateText(rateText.trim());

  const linkStyle = { ...textRole(pairing, 'label'), color: colors.accent };
  const cheaperRatio = alts.cheaper.ratioPercent;
  const { dayDiff, monthlyDiff } = alts.cheaper;
  const spendNote =
    dayDiff > 0 && monthlyDiff > 0
      ? t('decide.alt.spendDayMonth', { day: fmt(dayDiff), month: cents(monthlyDiff) })
      : dayDiff > 0
        ? t('decide.alt.spendAllOnDay')
        : monthlyDiff > 0
          ? t('decide.alt.spendMonthOnly', { month: cents(monthlyDiff) })
          : t('decide.alt.spendNothing');

  const trade = ((): string => {
    if (inputs.cheaperRatioPercent === null) return t('decide.alt.tradeIdle');
    const c = alts.cheaper;
    const floor = computation.context?.limits.spareFloor ?? 0;
    const common = { cheaper: fmt(alts.cheaperPrice), today: fmt(c.keptOnDay), monthly: cents(c.keptMonthly), count: alts.horizonMonths };
    if (c.leftAfter <= floor || c.keptMonthly === 0) {
      return t('decide.alt.tradeThin', { cheaper: common.cheaper, from: cents(plannedMonthly), to: cents(c.monthlyPayment), left: fmt(c.leftAfter) });
    }
    if (cheaperRow.rangeCode === 'exceeds_range') return t('decide.alt.tradeKeptTooLarge', common);
    if (cheaperRow.projected === null || cheaperRow.contributed === null) {
      return t('decide.alt.tradeThin', { cheaper: common.cheaper, from: cents(plannedMonthly), to: cents(c.monthlyPayment), left: fmt(c.leftAfter) });
    }
    return t(rateSet ? 'decide.alt.tradeKeptGrowth' : 'decide.alt.tradeKept', {
      ...common,
      fv: fmt(cheaperRow.projected),
      own: fmt(cheaperRow.contributed),
      growth: fmt(cheaperRow.growth ?? 0),
    });
  })();

  const cheaperPatch =
    check.kind === 'buy' ? repriceInputs(inputs, check, resolved, alts.cheaperPrice, { cheaperRatioPercent: alts.cheaper.ratioPercent }) : null;

  const keptValue = (row: AlternativeRow): string => {
    if (row.code === 'as_planned' || row.suppression !== null || row.projected === null) return t('decide.alt.dash');
    return fmt(row.projected);
  };

  return (
    <View style={styles.column}>
      <Card>
        <Eyebrow>{t('decide.alt.heading', { count: alts.horizonMonths })}</Eyebrow>
        {rates.length === 0 ? (
          <View style={styles.subRow}>
            <Meta>{t('decide.alt.subZero')}</Meta>
          </View>
        ) : (
          <Meta>{t('decide.alt.subRate', { rate: percentText(alts.projectionReturn) })}</Meta>
        )}
        <Lock locked={readOnly}>
          <View style={styles.rateBlock}>
            {rates.length > 0 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('decide.alt.removeRateA11y')}
                onPress={() => update({ projectionRates: rates.slice(1) })}
                style={[styles.chip, { backgroundColor: colors.fill1 }]}
              >
                <Text style={{ ...textRole(pairing, 'label'), color: colors.ink }}>{t('decide.alt.rateChip', { rate: rates[0] ?? '' })}</Text>
                <CloseGlyph color={colors.inkMuted} testID="rate-chip-remove" />
              </Pressable>
            ) : null}
            {rates.length < MAX_RATES && !adding ? (
              <Pressable accessibilityRole="button" accessibilityLabel={t('decide.alt.addRate')} onPress={() => setAdding(true)} style={styles.link}>
                <Text style={linkStyle}>{t('decide.alt.addRate')}</Text>
              </Pressable>
            ) : null}
            {adding ? (
              <RateInput
                value={rateText}
                onChange={setRateText}
                onBlur={commitRate}
                label={t('decide.alt.rateA11y')}
                accessibilityLabel={t('decide.alt.rateA11y')}
                hint={rateTooHigh ? t('decide.depth.invest.rateCap') : undefined}
              />
            ) : null}
          </View>
        </Lock>

        <View>
          {alts.rows.map((row, index) => {
            const reason = suppressionReason(row, alts, fmt);
            return (
              <View
                key={row.code}
                style={[
                  styles.row,
                  index > 0 ? { borderTopWidth: 1, borderTopColor: colors.fill2 } : null,
                  row.code === 'as_planned' ? { backgroundColor: colors.fill5 } : null,
                ]}
              >
                <Text style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink }}>{t(`decide.alt.row.${row.code}`)}</Text>
                <Text
                  numberOfLines={fontScale > TWO_LINES_ABOVE ? 2 : 1}
                  style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkFaint }}
                >
                  {descriptor(row)}
                </Text>
                <FigureStrip
                  items={[
                    { caption: t('decide.alt.onDay'), value: row.dayOne === null ? t('decide.alt.dash') : fmt(row.dayOne) },
                    { caption: t('decide.alt.aMonth'), value: row.monthly === null ? t('decide.alt.dash') : cents(row.monthly) },
                    { caption: refText(t, keptHeader(alts)), value: keptValue(row) },
                  ]}
                />
                {reason !== null ? (
                  <Text numberOfLines={1} style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.warn1 }}>
                    {refText(t, reason)}
                  </Text>
                ) : null}
              </View>
            );
          })}
        </View>
      </Card>

      <Card>
        <Eyebrow>{t('decide.alt.spendTitle')}</Eyebrow>
        <Meta>{t('decide.alt.spendSub', { count: alts.horizonMonths })}</Meta>
        <View style={styles.figures}>
          <View style={styles.figure}>
            <Meta>{t('decide.alt.spendCheaper')}</Meta>
            <Text style={{ ...textRole(pairing, 'heading'), color: colors.ink }}>{fmt(alts.cheaperPrice)}</Text>
          </View>
          <View style={styles.figure}>
            <Meta>{t('decide.alt.spendNotSpent')}</Meta>
            <Text style={{ ...textRole(pairing, 'sheetTitle'), color: colors.accent }}>{fmt(alts.cheaper.notSpent)}</Text>
          </View>
        </View>
        <Meta tone="muted">{spendNote}</Meta>
        <Lock locked={readOnly}>
          <StepSlider
            value={cheaperRatio}
            min={MIN_RATIO}
            max={MAX_RATIO}
            step={1}
            onChange={(v) => update({ cheaperRatioPercent: v })}
            accessibilityLabel={t('decide.alt.spendSliderA11y')}
            valueText={t('decide.alt.spendSliderValue', { pct: cheaperRatio, price: fmt(resolved.price) })}
          />
        </Lock>
        <Meta>{t('decide.alt.spendRatio', { pct: cheaperRatio, price: fmt(resolved.price) })}</Meta>
      </Card>

      <View style={[styles.trade, { backgroundColor: colors.ink }]}>
        <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.eyebrow, color: colors.inkSoft1, textTransform: 'uppercase', letterSpacing: 1.2 }}>
          {t('decide.alt.tradeEyebrow')}
        </Text>
        <Text style={{ ...textRole(pairing, 'sheetTitle'), color: colors.surface }}>{trade}</Text>
        <Lock locked={readOnly}>
          <View style={styles.buttons}>
            {cheaperPatch !== null ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('decide.alt.tradeUseCheaper')}
                onPress={() => update(cheaperPatch)}
                style={({ pressed }) => [styles.button, { backgroundColor: colors.surface, opacity: pressed ? PRESSED_OPACITY : 1 }]}
              >
                <Text style={{ ...textRole(pairing, 'label'), color: colors.ink }}>{t('decide.alt.tradeUseCheaper')}</Text>
              </Pressable>
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('decide.alt.tradeWait')}
              onPress={() => {
                update({ outcome: 'wait' });
                goToStep(5);
              }}
              style={({ pressed }) => [styles.button, { backgroundColor: colors.inkDim, opacity: pressed ? PRESSED_OPACITY : 1 }]}
            >
              <Text style={{ ...textRole(pairing, 'label'), color: colors.surface }}>{t('decide.alt.tradeWait')}</Text>
            </Pressable>
          </View>
        </Lock>
      </View>

      <InvestingInsteadSection {...props} />

      <View style={styles.footer}>
        <Meta>{t('decide.alt.footer', { spareCash: fmt(alts.spareCash), spareMonth: fmt(alts.spareMonthly) })}</Meta>
        <Meta>{t('decide.alt.footerPlanned')}</Meta>
        {alts.cheaper.keptOnDay > 0 ? <Meta>{t('decide.alt.footerCheaper', { amount: fmt(alts.cheaper.keptOnDay) })}</Meta> : null}
        {alts.monthsToBuy !== null && waitRow.suppression === null ? (
          <Meta>{t('decide.alt.footerWait', { count: alts.monthsToBuy, payment: cents(plannedMonthly) })}</Meta>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  column: { gap: space.gapMd },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: space.gapSm },
  rateBlock: { gap: space.gapSm },
  chip: { flexDirection: 'row', alignSelf: 'flex-start', alignItems: 'center', gap: space.gapSm, minHeight: space.touchMin, paddingHorizontal: space.gapMd, borderRadius: radii.pill },
  link: { minHeight: space.touchMin, justifyContent: 'center', alignSelf: 'flex-start' },
  row: { paddingVertical: space.rowPadDense, gap: 4 },
  figures: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  figure: { gap: 2 },
  trade: { borderRadius: radii.card, padding: space.cardPadLg, gap: space.gapMd },
  buttons: { flexDirection: 'row', gap: space.gapSm, flexWrap: 'wrap' },
  button: { minHeight: space.touchMin, borderRadius: radii.pill, paddingHorizontal: space.cardPad, justifyContent: 'center' },
  footer: { gap: space.gapSm },
});
