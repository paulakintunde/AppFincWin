/**
 * Plan 05.2-22: "Your regular pay". One card per pay. A new card creates a salary series (income_kind 'salary',
 * counts_as 'available') through useConfirmRegularCandidate; a changed existing salary series goes through the
 * existing edit-from mutation. The records' finding shows as a PrefillNote only, never as a selection.
 */
import React, { forwardRef, useImperativeHandle, useMemo, useState } from 'react';
import { View } from 'react-native';
import * as Crypto from 'expo-crypto';
import { Chip } from '@/ui/Chip';
import { DateField } from '@/features/record/entry/pickers/DateField';
import { MoneyInput } from '@/features/decide/ui/MoneyInput';
import { MAX_INPUT_MINOR } from '@/features/decide/snapshot/checkInputs';
import { useConfirmRegularCandidate } from '@/data/mutations/seriesAttributes';
import { useEditSeriesFrom } from '@/data/mutations/recurringSeries';
import type { RecurringSeriesPatch } from '@/db/recurringSeries';
import { useMoneyFormatter } from '@/ui/money/useMoneyFormatter';
import { space } from '@/theme/layout';
import { hapticSelection } from '@/ui/haptics';
import type { SetupStepBodyProps, SetupStepHandle } from '@/features/decide/setup/steps/types';
import { useIncomeContext } from '../useIncomeContext';
import { liveSeriesOfKind, payableAccounts, pausedIncomeSeries } from '../seriesHelpers';
import { PrefillNote } from '@/features/decide/setup/PrefillNote';
import { Caption, ChipRow, Meta, NEEDED_REASON_KEY, PausedSeriesList, SeriesStatusLink, Stack, TextButton, Why, useNoWrapMoney, useReportReady, useCopy } from './shared';

type Freq = 'weekly' | 'fortnightly' | 'monthly';

const FREQS: readonly { value: Freq; labelKey: string }[] = [
  { value: 'weekly', labelKey: 'income.pay.freqWeekly' },
  { value: 'fortnightly', labelKey: 'income.pay.freqFortnightly' },
  { value: 'monthly', labelKey: 'income.pay.freqMonthly' },
];

interface PayCard {
  key: string;
  seriesId: string | null;
  amount: number | null;
  freq: Freq | null;
  date: string;
}

const isPayFreq = (f: string): f is Freq => f === 'weekly' || f === 'fortnightly' || f === 'monthly';

export const PayStep = forwardRef<SetupStepHandle, SetupStepBodyProps>(function PayStep({ onReadyChange }, ref) {
  const t = useCopy();
  const ctx = useIncomeContext();
  const money = useMoneyFormatter(false, ctx.homeCurrency);
  const noWrap = useNoWrapMoney(ctx.found?.currency ?? ctx.homeCurrency);
  const confirmer = useConfirmRegularCandidate(ctx.householdId ?? '', ctx.userId ?? '');
  const editor = useEditSeriesFrom();

  const existing = useMemo(() => liveSeriesOfKind(ctx.series, 'salary'), [ctx.series]);
  const paused = useMemo(() => pausedIncomeSeries(ctx.series, 'salary'), [ctx.series]);
  const initial = useMemo<PayCard[]>(() => {
    if (existing.length === 0) return [{ key: 'new-0', seriesId: null, amount: null, freq: null, date: ctx.today }];
    return existing.map((s) => ({ key: s.id, seriesId: s.id, amount: s.amount, freq: isPayFreq(s.freq) ? s.freq : null, date: s.anchor_date }));
  }, [existing, ctx.today]);
  const [draft, setDraft] = useState<PayCard[] | null>(null);
  const cards = draft ?? initial;
  const [nextKey, setNextKey] = useState(1);

  const update = (key: string, patch: Partial<PayCard>) => setDraft(cards.map((c) => (c.key === key ? { ...c, ...patch } : c)));
  const account = payableAccounts(ctx.accounts)[0];

  const complete = cards.every((c) => c.amount !== null && c.amount > 0 && c.freq !== null && c.date !== '');
  const canContinue = complete && account !== undefined;
  const changedOf = (c: PayCard): boolean => {
    if (c.seriesId === null) return c.amount !== null;
    const s = existing.find((e) => e.id === c.seriesId);
    return s !== undefined && (s.amount !== c.amount || s.freq !== c.freq || s.anchor_date !== c.date);
  };
  useReportReady(onReadyChange, canContinue, canContinue ? null : NEEDED_REASON_KEY, cards.some(changedOf));

  useImperativeHandle(ref, () => ({
    save() {
      if (!canContinue || account === undefined || ctx.householdId === undefined || ctx.userId === undefined) return { stepId: null };
      const stepIds: string[] = [];
      for (const c of cards) {
        if (!changedOf(c) || c.amount === null || c.freq === null) continue;
        if (c.seriesId === null) {
          const { stepId } = confirmer.confirm({
            series: {
              id: Crypto.randomUUID(),
              household_id: ctx.householdId,
              account_id: account.id,
              name: ctx.found?.payer ?? t('activity.incomeTag.kindSalary'),
              amount: c.amount,
              currency: account.currency,
              category_id: null,
              payment_type: null,
              freq: c.freq,
              anchor_date: c.date,
              time_zone: ctx.timeZone,
              end_date: null,
              occurrence_count: null,
              is_automatic: false,
            },
            attributes: { income_kind: 'salary', counts_as: 'available' },
          });
          stepIds.push(stepId);
        } else {
          const s = existing.find((e) => e.id === c.seriesId);
          if (s === undefined) continue;
          const patch: RecurringSeriesPatch = {};
          if (s.amount !== c.amount) patch.amount = c.amount;
          if (s.freq !== c.freq) patch.freq = c.freq;
          if (s.anchor_date !== c.date) patch.anchor_date = c.date;
          stepIds.push(editor.editFrom({ id: s.id, householdId: ctx.householdId, expectedVersion: s.version, patch, effectiveFrom: ctx.today, ownerId: ctx.userId, name: s.name }));
        }
      }
      // One user action, one Undo: the toast carries every series write of this save (05.2-40).
      return { stepId: stepIds[0] ?? null, ...(stepIds.length > 0 ? { stepIds } : {}) };
    },
  }));

  const found = ctx.found;
  return (
    <View style={{ gap: space.groupGap }}>
      {found ? <PrefillNote text={t('income.pay.prefill', { payer: found.payer, amount: noWrap(found.amount), day: found.day })} /> : null}
      {cards.map((c, i) => (
        <Stack key={c.key}>
          <MoneyInput
            value={c.amount}
            currency={account?.currency ?? ctx.homeCurrency}
            onChange={(minor) => update(c.key, { amount: minor !== null && minor > 0 && minor <= MAX_INPUT_MINOR ? minor : null })}
            label={t('income.pay.amountCaption')}
            accessibilityLabel={t('income.pay.amountCaption')}
            boxed
            large
          />
          <Caption text={t('income.pay.frequencyCaption')} />
          <ChipRow label={t('income.pay.frequencyCaption')}>
            {FREQS.map((f) => (
              <Chip
                key={f.value}
                label={t(f.labelKey)}
                selected={c.freq === f.value}
                onPress={() => {
                  hapticSelection();
                  update(c.key, { freq: f.value });
                }}
              />
            ))}
          </ChipRow>
          <Meta text={t('income.pay.frequencyHint')} />
          <DateField label={t('income.pay.nextDate')} value={c.date} display={money.formatDate(c.date)} onChange={(date) => update(c.key, { date })} />
          {existing.filter((e) => e.id === c.seriesId).map((e) => (
            <SeriesStatusLink key={e.id} series={e} />
          ))}
          {i > 0 && c.seriesId === null ? <TextButton danger label={t('income.pay.remove')} onPress={() => setDraft(cards.filter((x) => x.key !== c.key))} /> : null}
        </Stack>
      ))}
      <PausedSeriesList series={paused} />
      <TextButton
        label={t('income.pay.addAnother')}
        onPress={() => {
          setDraft([...cards, { key: `new-${nextKey}`, seriesId: null, amount: null, freq: null, date: ctx.today }]);
          setNextKey(nextKey + 1);
        }}
      />
      <Why textKey="income.pay.why" />
    </View>
  );
});
