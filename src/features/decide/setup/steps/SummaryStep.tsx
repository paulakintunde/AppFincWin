/**
 * Plan 05.2-32 (DSU-04): the Summary body. The shell draws the success circle and the title; this draws the user's own
 * numbers (read from the engine evaluation by summaryModel, never recomputed here) and the not-a-lender footer. There is
 * nothing to save. "Check a purchase" is not shown in 05.2 (the check ships in 05.3).
 */
import React, { forwardRef, useEffect, useImperativeHandle, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/ui/Text';
import { hapticSuccess } from '@/ui/haptics';
import { useMoneyFormatter } from '@/ui/money/useMoneyFormatter';
import { currencyCode, minorUnits } from '@/engine/money';
import { radii, space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { fontSize, textRole } from '@/theme/typography';
import { useDecideSettings } from '@/data/queries/decide';
import { useDecideV3 } from '@/data/queries/decideV3';
import { useRecordContext } from '@/features/record/useRecordContext';
import { LabelValueRow } from '@/features/decide/ui/LabelValueRow';
import { useCopy, useReportReady } from '@/features/income/steps/shared';
import { monthLabel } from '../../home/ChangeSheet';
import { summaryModel, type SummaryRow } from '../summaryModel';
import type { SetupStepBodyProps, SetupStepHandle } from './types';

const LABEL_KEY: Readonly<Record<SummaryRow['key'], string | null>> = {
  month: null,
  leave: 'decide.setup.summary.rowLeave',
  typical: 'decide.setup.summary.rowTypical',
  unspent: 'decide.setup.summary.rowUnspent',
  emergency: 'decide.setup.summary.rowEmergency',
  envelopes: 'decide.setup.summary.rowEnvelopes',
  income: 'decide.setup.summary.rowIncome',
};

export const SummaryStep = forwardRef<SetupStepHandle, SetupStepBodyProps>(function SummaryStep({ onReadyChange }, ref) {
  const t = useCopy();
  const { colors, pairing } = useTheme();
  const rc = useRecordContext();
  const settings = useDecideSettings(rc.userId ?? undefined).data ?? null;
  const { evaluation, inputs } = useDecideV3();
  const currency = inputs?.currency ?? rc.homeCurrency;
  const fmt = useMoneyFormatter(false, currency);

  useReportReady(onReadyChange, true, null, false);
  useImperativeHandle(ref, () => ({ save: () => ({ stepId: null }) }));
  useEffect(() => {
    hapticSuccess();
  }, []);

  const everydayOverride = inputs?.everydayOverride == null ? null : Number(inputs.everydayOverride);
  const rows = useMemo(
    () => (evaluation === null ? [] : summaryModel(evaluation, settings, everydayOverride, inputs?.asOf ?? rc.today)),
    [evaluation, settings, everydayOverride, inputs?.asOf, rc.today]
  );

  const money = (minor: number): string => fmt.formatMoney({ amount: minorUnits(minor), currency: currencyCode(currency) });
  const about = (minor: number): string => t('decide.setup.summary.valueLeave', { amount: money(minor) });

  const view = (row: SummaryRow): { label: string; value: string } => {
    switch (row.key) {
      case 'month':
        return { label: t('decide.setup.summary.rowMonth', { month: monthLabel(fmt.locale, row.month) }), value: t('decide.setup.summary.valueMonth', { income: money(row.moneyIn), spent: money(row.moneyOut) }) };
      case 'leave':
        return { label: t(LABEL_KEY.leave as string), value: about(row.amount) };
      case 'typical':
        return { label: t(LABEL_KEY.typical as string), value: t('decide.setup.summary.valueTypical', { amount: money(row.amount) }) };
      case 'unspent':
        return {
          label: t(LABEL_KEY.unspent as string),
          value:
            row.checked === null
              ? money(row.amount)
              : row.checked === 'today'
                ? t('decide.setup.summary.valueUnspent', { amount: money(row.amount) })
                : t('decide.setup.summary.valueUnspentOn', { amount: money(row.amount), date: fmt.formatDate(row.checked) }),
        };
      case 'emergency':
        return {
          label: t(LABEL_KEY.emergency as string),
          value: row.amount === null ? t('decide.setup.summary.valueEmergencyNotSet') : t('decide.setup.summary.valueEmergency', { amount: money(row.amount) }),
        };
      case 'envelopes':
        return { label: t(LABEL_KEY.envelopes as string), value: money(row.amount) };
      case 'income':
        return { label: t(LABEL_KEY.income as string), value: row.wordKeys.map((k) => t(k)).join(t('decide.setup.summary.joiner')) };
    }
  };

  return (
    <View style={{ gap: space.groupGap }}>
      {rows.length > 0 ? (
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line2 }]}>
          {rows.map((row) => {
            const v = view(row);
            return <LabelValueRow key={row.key} label={v.label} value={v.value} />;
          })}
        </View>
      ) : null}
      <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted, textAlign: 'center' }}>
        {t('decide.setup.summary.footer')}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, borderWidth: 1, paddingHorizontal: space.cardPad },
});
