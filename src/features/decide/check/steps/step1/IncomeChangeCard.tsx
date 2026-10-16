/**
 * 05-43 Step 1 "Does this change your income?" (D-32, DCU-08). Optional and off by default. A raise is never counted in the
 * verdict (04 D-53); the note says so. Every edit is one `update({ incomeChange })` of JSON values; the flow shell autosaves.
 * The start date can never be in the past (DateField minDate plus its own guard).
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useT } from '@/i18n';
import { space } from '@/theme/layout';
import { DateField } from '@/features/record/entry/pickers/DateField';
import { ToggleRow } from '@/ui/ToggleRow';
import { MAX_INPUT_MINOR } from '../../../snapshot/checkInputs';
import type { CheckInputs, SnapshotResult } from '../../../snapshot/types';
import { MoneyInput } from '../../../ui/MoneyInput';
import { SegmentedToggle } from '../../../ui/SegmentedToggle';
import { Card, Label, Lock, Meta } from '../stepUi';
import type { MoneyFormatter } from '@/ui/money/useMoneyFormatter';

type IncomeChange = NonNullable<CheckInputs['incomeChange']>;

export interface IncomeChangeCardProps {
  inputs: CheckInputs;
  update: (patch: Partial<CheckInputs>) => void;
  today: string;
  readOnly: boolean;
  source: SnapshotResult;
  exact: MoneyFormatter;
}

const OFF_DEFAULT: IncomeChange = { direction: 'raises', amount: null, startDate: null, likelihood: 'likely' };

export function IncomeChangeCard(props: IncomeChangeCardProps) {
  const { inputs, update, readOnly, source, exact } = props;
  const t = useT();
  const change = inputs.incomeChange;
  const currency = inputs.currency ?? source.currency;
  const set = (patch: Partial<IncomeChange>) => update({ incomeChange: { ...(change ?? OFF_DEFAULT), ...patch } });

  return (
    <Lock locked={readOnly}>
      <Card>
        <Label>{t('decide.depth.income.card')}</Label>
        <ToggleRow
          label={t('decide.depth.income.toggle')}
          value={change !== null}
          onChange={(on) => update({ incomeChange: on ? { ...OFF_DEFAULT } : null })}
        />
        {change === null ? null : (
          <View style={styles.fields}>
            <SegmentedToggle
              accessibilityLabel={t('decide.depth.income.card')}
              value={change.direction}
              onChange={(key) => set({ direction: key === 'lowers' ? 'lowers' : 'raises' })}
              options={[
                { key: 'raises', label: t('decide.depth.income.raises') },
                { key: 'lowers', label: t('decide.depth.income.lowers') },
              ]}
            />
            <Meta tone="muted">{change.direction === 'lowers' ? t('decide.depth.income.noteLowers') : t('decide.depth.income.noteRaises')}</Meta>
            <MoneyInput
              value={change.amount}
              currency={currency}
              onChange={(minor) => set({ amount: minor !== null && minor > 0 && minor <= MAX_INPUT_MINOR ? minor : null })}
              label={t('decide.depth.income.amount')}
              accessibilityLabel={t('decide.depth.income.amount')}
            />
            <DateField
              label={t('decide.depth.income.starts')}
              value={change.startDate ?? props.today}
              display={change.startDate === null ? '' : exact.formatDate(change.startDate, 'long')}
              minDate={props.today}
              onChange={(startDate) => set({ startDate })}
            />
            <Label>{t('decide.depth.income.howSure')}</Label>
            <SegmentedToggle
              accessibilityLabel={t('decide.depth.income.howSure')}
              value={change.likelihood}
              onChange={(key) => set({ likelihood: key === 'uncertain' ? 'uncertain' : 'likely' })}
              options={[
                { key: 'likely', label: t('decide.depth.income.likely') },
                { key: 'uncertain', label: t('decide.depth.income.uncertain') },
              ]}
            />
          </View>
        )}
      </Card>
    </Lock>
  );
}

const styles = StyleSheet.create({
  fields: { gap: space.gapMd },
});
