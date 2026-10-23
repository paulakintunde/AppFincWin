/**
 * 05-43 credit terms in step 2 (D-30, D-42, D-53): the promotional rate row, the variable-rate stress card and the late fee.
 * Nothing is pre-filled and nothing defaults on: every field starts empty, the deferred-interest toggle exists only while the
 * typed promotional rate is 0 and is cleared at any other rate, and the stress lines sit beside the verdict, never in it.
 * Figures are the engine's (plan.promo, plan.lateFees, decision.stress) passed through the 05-37 copy layer.
 */
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { Plan, StressOutcome } from '@/engine/decide';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { PRESSED_OPACITY, space } from '@/theme/layout';
import { fontSize, textRole } from '@/theme/typography';
import { Text } from '@/ui/Text';
import { ToggleRow } from '@/ui/ToggleRow';
import { useReadOnlyScope } from '@/ui/ReadOnlyScope';
import { lateFeeCopy, promoCopy, stressCopy } from '../../../copy/depthInputsCopy';
import type { CopyRef } from '../../../copy/types';
import { MAX_INPUT_MINOR } from '../../../snapshot/checkInputs';
import type { PromoInput } from '../../../snapshot/types';
import { CustomValueField } from '../../../ui/CustomValueChips';
import { MoneyInput } from '../../../ui/MoneyInput';
import { RateInput } from '../../../ui/RateInput';
import { StateChip, type StateChipTone } from '../../../ui/StateChip';
import { useInfoSheet } from '../../../ui/useInfoSheet';
import { refText } from '../../refText';
import { Label, Meta, moneyFn } from '../stepUi';
import type { Step2Props } from './types';

const MAX_MONTHS = 120; // D-71: the promotion is no longer than 120 months, nor than the term it sits in
const MAX_RATE_TYPED = '999.99'; // the RateInput bound (R4): a keystroke above it is refused and the range line shows
type Translate = Parameters<typeof refText>[0];

function Lines({ lines, t }: { lines: readonly CopyRef[]; t: Translate }) {
  const { colors, pairing } = useTheme();
  return (
    <>
      {lines.map((line) => (
        <Text key={line.key} style={{ ...textRole(pairing, 'label'), fontSize: fontSize.s13_5, color: colors.ink }}>
          {refText(t, line)}
        </Text>
      ))}
    </>
  );
}

export interface PromoRowProps extends Pick<Step2Props, 'computation' | 'source' | 'whole' | 'exact'> {
  method: 'loan' | 'card';
  promo: PromoInput | null;
  onChange: (promo: PromoInput | null) => void;
  /** The method's own rate, shown after the promotion. For a loan it is edited here; for a card it is read-only. */
  thenRateText: string;
  onThenRateChange?: (text: string) => void;
  /** D-71: the term the promotion sits in; the promotion length cannot exceed it. Null when there is none to compare. */
  termMonths?: number | null;
}

/** The collapsed '+ Promotional rate' row and, once opened, its three fields and the engine's results. */
export function PromoRow(props: PromoRowProps) {
  const { method, promo, onChange, thenRateText, onThenRateChange, termMonths = null, computation, source, whole, exact } = props;
  const t = useT() as Translate;
  const { colors, pairing } = useTheme();
  const promoInfo = useInfoSheet('promoRate');
  const deferredInfo = useInfoSheet('deferredInterest');
  const thenInfo = useInfoSheet('apr');
  const readOnly = useReadOnlyScope();
  const [open, setOpen] = useState(promo !== null);
  const wholeFmt = moneyFn(whole, source.currency);
  const exactFmt = moneyFn(exact, source.currency);

  const result = computation.methodPlans[method];
  const plan: Plan | null = computation.status !== 'incomplete' && result?.status === 'resolved' ? result.plan : null;
  const outcome = plan?.promo ?? null;
  const balanceAtEnd = computation.promoBalanceAtEnd[method] ?? null;
  const copy = promoCopy(promo, thenRateText, outcome, balanceAtEnd, wholeFmt, exactFmt);

  const edit = (patch: Partial<PromoInput>) => {
    const next: PromoInput = { aprText: '', months: null, deferredInterest: false, ...(promo ?? {}), ...patch };
    // D-42: the charge-back flag only means something at 0%; any other rate clears it
    const zero = promoCopy(next, '', null, null, wholeFmt, exactFmt).showDeferredToggle;
    if (!zero) next.deferredInterest = false;
    onChange(next.aprText === '' && next.months === null ? null : next);
  };

  const monthsMax = termMonths !== null && termMonths >= 1 ? Math.min(MAX_MONTHS, termMonths) : MAX_MONTHS;

  if (!open) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('decide.depth.credit.promoAdd')}
        accessibilityState={{ disabled: readOnly }}
        disabled={readOnly}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.add, { opacity: pressed ? PRESSED_OPACITY : 1 }]}
      >
        <Text style={{ ...textRole(pairing, 'label'), color: colors.accent }}>{t('decide.depth.credit.promoAdd')}</Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.block}>
      <RateInput
        value={promo?.aprText ?? ''}
        onChange={(text) => edit({ aprText: text })}
        label={t('decide.depth.credit.promoRate')}
        accessibilityLabel={t('decide.depth.credit.promoRate')}
        max={MAX_RATE_TYPED}
        rangeText={t('decide.custom.range.apr')}
        labelAccessory={promoInfo.button()}
      />
      {promoInfo.sheet}
      {copy.showDeferredToggle ? (
        <View>
          <View style={styles.toggleWithInfo}>
            <View style={styles.toggleMain}>
              <ToggleRow
                label={t('decide.depth.credit.deferredToggle')}
                value={promo?.deferredInterest === true}
                onChange={(on) => edit({ deferredInterest: on })}
              />
            </View>
            {deferredInfo.button()}
          </View>
          {deferredInfo.sheet}
          <Meta>{t('decide.depth.credit.deferredSub')}</Meta>
        </View>
      ) : null}
      <Label>{t('decide.depth.credit.promoFor')}</Label>
      <CustomValueField
        value={promo?.months ?? null}
        min={1}
        max={monthsMax}
        rangeText={monthsMax === MAX_MONTHS ? t('decide.custom.range.months') : t('decide.custom.range.from', { min: 1, max: monthsMax })}
        unitWord={t('decide.depth.credit.promoMonths')}
        groupLabel={t('decide.depth.credit.promoFor')}
        onChange={(n) => edit({ months: n })}
      />
      {onThenRateChange ? (
        <RateInput
          value={thenRateText}
          onChange={onThenRateChange}
          label={t('decide.depth.credit.promoThen')}
          accessibilityLabel={t('decide.depth.credit.promoThen')}
          max={MAX_RATE_TYPED}
          rangeText={t('decide.custom.range.apr')}
          labelAccessory={thenInfo.button()}
        />
      ) : (
        <View>
          <Label>{t('decide.depth.credit.promoThen')}</Label>
          <Text style={{ ...textRole(pairing, 'body'), color: colors.ink }}>{thenRateText === '' ? '' : t('decide.section.ratePercent', { rate: thenRateText })}</Text>
          <Meta>{t('decide.depth.credit.promoThenAbove')}</Meta>
        </View>
      )}
      {onThenRateChange ? thenInfo.sheet : null}
      {copy.summary ? <Meta tone="muted">{refText(t, copy.summary)}</Meta> : null}
      {copy.results.length > 0 ? (
        <View style={[styles.results, { backgroundColor: colors.fill1 }]}>
          <Lines lines={copy.results} t={t} />
        </View>
      ) : null}
    </View>
  );
}

export interface VariableRateCardProps extends Pick<Step2Props, 'computation' | 'source' | 'exact'> {
  value: boolean;
  onChange: (on: boolean) => void;
}

/** 'The rate can change': what +2 and +4 points would do, beside the verdict (04 D-49). */
export function VariableRateCard(props: VariableRateCardProps) {
  const { value, onChange, computation, source, exact } = props;
  const t = useT() as Translate;
  const { colors, pairing } = useTheme();
  const exactFmt = moneyFn(exact, source.currency);
  const info = useInfoSheet('variableRate');
  const stress: readonly StressOutcome[] = computation.status === 'incomplete' ? [] : (computation.decision?.stress ?? []);
  const lines = value ? stressCopy(stress, exactFmt, exactFmt) : [];
  return (
    <View>
      <View style={styles.toggleWithInfo}>
        <View style={styles.toggleMain}>
          <ToggleRow label={t('decide.depth.credit.variable')} value={value} onChange={onChange} />
        </View>
        {info.button()}
      </View>
      {info.sheet}
      {value ? (
        <View style={[styles.results, { backgroundColor: colors.fill1 }]}>
          {lines.map(({ line, stateKey }) => (
            <View key={line.key} style={styles.stressLine}>
              <Text style={{ ...textRole(pairing, 'label'), color: colors.ink, flexShrink: 1 }}>{refText(t, line)}</Text>
              <StateChip tone={chipTone(stateKey)} label={t(stateKey)} />
            </View>
          ))}
          <Meta tone="muted">{t('decide.depth.credit.stressNote')}</Meta>
        </View>
      ) : null}
    </View>
  );
}

function chipTone(stateKey: string): StateChipTone {
  if (stateKey.endsWith('.fits')) return 'fits';
  if (stateKey.endsWith('.adjust')) return 'adjust';
  return 'no';
}

export interface LateFeeFieldProps extends Pick<Step2Props, 'computation' | 'source' | 'exact'> {
  value: number | null;
  currency: string;
  onChange: (minor: number | null) => void;
}

/** The optional late fee on an instalment plan. The two lines are cost, never part of the verdict (04 D-50). */
export function LateFeeField(props: LateFeeFieldProps) {
  const { value, currency, onChange, computation, source, exact } = props;
  const t = useT() as Translate;
  const { colors } = useTheme();
  const exactFmt = moneyFn(exact, source.currency);
  const result = computation.methodPlans.instalment;
  const lateFees = computation.status !== 'incomplete' && result?.status === 'resolved' ? result.plan.lateFees : null;
  const lines = value !== null && value > 0 ? lateFeeCopy(lateFees, exactFmt, exactFmt) : [];
  return (
    <View style={styles.block}>
      <MoneyInput
        value={value}
        currency={currency}
        onChange={(minor) => onChange(minor !== null && minor > 0 && minor <= MAX_INPUT_MINOR ? minor : null)}
        label={t('decide.depth.credit.lateFee')}
        accessibilityLabel={t('decide.depth.credit.lateFee')}
      />
      {lines.length > 0 ? (
        <View style={[styles.results, { backgroundColor: colors.fill1 }]}>
          <Lines lines={lines} t={t} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: space.gapMd },
  add: { minHeight: space.touchMin, justifyContent: 'center' },
  toggleWithInfo: { flexDirection: 'row', alignItems: 'center', gap: space.gapSm },
  toggleMain: { flex: 1 },
  results: { borderRadius: space.cardPad, padding: space.cardPad, gap: space.gapSm },
  stressLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.gapMd },
});
