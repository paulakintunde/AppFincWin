/**
 * Plan 05.2-22 (D-16): "How should Decide count it?" Four methods, none pre-selected; the follow-up for the chosen
 * method sits directly under its card (a sibling of the card, so a screen reader can reach the chips).
 */
import React, { forwardRef, useImperativeHandle, useMemo, useState } from 'react';
import { View } from 'react-native';
import { Chip } from '@/ui/Chip';
import { Text } from '@/ui/Text';
import { ChoiceCard } from '@/features/decide/ui/ChoiceCard';
import { MoneyInput } from '@/features/decide/ui/MoneyInput';
import { MAX_INPUT_MINOR } from '@/features/decide/snapshot/checkInputs';
import { useDecideV3 } from '@/data/queries/decideV3';
import { useSaveSetupStep } from '@/data/mutations/decideSetup';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';
import { fontSize, textRole } from '@/theme/typography';
import { hapticSelection } from '@/ui/haptics';
import type { SetupStepBodyProps, SetupStepHandle } from '@/features/decide/setup/steps/types';
import { useIncomeContext } from '../useIncomeContext';
import { Caption, ChipRow, Intro, Meta, NEEDED_REASON_KEY, Why, useNoWrapMoney, useReportReady, useCopy } from './shared';

type Method = 'match' | 'spread' | 'steady' | 'balance';
type Hold = 1 | 2 | 3;

const SPREAD_CHOICES = [1, 2, 3, 6, 12, 0] as const; // 0 = "It varies, ask me each time" (decide_settings.spread_months)
const HOLD_CHOICES: readonly Hold[] = [1, 2, 3];
const SIX = 6;

interface Draft {
  method: Method | null;
  spread: number | null;
  steady: number | null;
  hold: Hold | null;
}

const METHODS = [
  { value: 'match', key: 'Match' },
  { value: 'spread', key: 'Spread' },
  { value: 'steady', key: 'Steady' },
  { value: 'balance', key: 'Balance' },
] as const;

export const MethodStep = forwardRef<SetupStepHandle, SetupStepBodyProps>(function MethodStep({ onReadyChange }, ref) {
  const t = useCopy();
  const { colors, pairing } = useTheme();
  const ctx = useIncomeContext();
  const v3 = useDecideV3();
  const saver = useSaveSetupStep(ctx.userId ?? '');
  const noWrap = useNoWrapMoney(ctx.homeCurrency);

  const s = ctx.settings;
  const stored: Draft = {
    method: s?.variable_method ?? null,
    spread: s?.spread_months ?? null,
    steady: s?.steady_amount ?? null,
    hold: s?.hold_months ?? null,
  };
  const [draft, setDraft] = useState<Draft | null>(null);
  const cur = draft ?? stored;
  const set = (patch: Partial<Draft>) => setDraft({ ...cur, ...patch });

  const followUp = (() => {
    switch (cur.method) {
      case 'match':
        return true;
      case 'spread':
        return cur.spread !== null;
      case 'steady':
        return cur.steady !== null && cur.steady > 0;
      case 'balance':
        return cur.hold !== null;
      default:
        return false;
    }
  })();
  const dirty = cur.method !== stored.method || (cur.method === 'spread' && cur.spread !== stored.spread) || (cur.method === 'steady' && cur.steady !== stored.steady) || (cur.method === 'balance' && cur.hold !== stored.hold);
  useReportReady(onReadyChange, followUp, followUp ? null : NEEDED_REASON_KEY, dirty);

  useImperativeHandle(ref, () => ({
    save() {
      if (!followUp || cur.method === null || ctx.userId === undefined) return { stepId: null };
      const patch: Record<string, unknown> = { variable_method: cur.method };
      if (cur.method === 'spread') patch.spread_months = cur.spread;
      if (cur.method === 'steady') patch.steady_amount = cur.steady;
      if (cur.method === 'balance') patch.hold_months = cur.hold;
      const result = saver.save({ stepTitle: t('income.method.title'), patch });
      return { stepId: result?.stepId ?? null };
    },
  }));

  // "Your last 6 months averaged X; your lowest month was Y": only when 6 full months of records exist.
  const meta = useMemo(() => {
    const months = (v3.inputs?.months ?? []).filter((m) => m.full);
    if (months.length < SIX) return null;
    const totals = months.slice(-SIX).map((m) =>
      m.lines.reduce((sum, l) => (l.role === 'income' && l.status === 'paid' && l.countsAs === 'available' ? sum + Number(l.amount) : sum), 0)
    );
    return { average: Math.round(totals.reduce((a, b) => a + b, 0) / SIX), lowest: Math.min(...totals) };
  }, [v3.inputs]);

  const radioChip = (label: string, selected: boolean, onPress: () => void, key: string) => (
    <Chip
      key={key}
      label={label}
      selected={selected}
      onPress={() => {
        hapticSelection();
        onPress();
      }}
    />
  );

  const renderFollowUp = (method: Method) => {
    if (cur.method !== method) return null;
    if (method === 'spread') {
      const q = t('income.method.spreadQuestion');
      return (
        <View style={{ gap: space.gapSm }}>
          <Caption text={q} />
          <ChipRow label={q}>
            {SPREAD_CHOICES.map((n) => radioChip(n === 0 ? t('income.method.spreadVaries') : t('income.method.months', { count: n }), cur.spread === n, () => set({ spread: n }), String(n)))}
          </ChipRow>
        </View>
      );
    }
    if (method === 'steady') {
      return (
        <View style={{ gap: space.gapSm }}>
          <MoneyInput
            value={cur.steady}
            currency={ctx.homeCurrency}
            onChange={(minor) => set({ steady: minor !== null && minor > 0 && minor <= MAX_INPUT_MINOR ? minor : null })}
            label={t('income.method.steadyCaption')}
            accessibilityLabel={t('income.method.steadyCaption')}
            boxed
            large
          />
          {meta ? <Meta text={t('income.method.steadyMeta', { average: noWrap(meta.average), lowest: noWrap(meta.lowest) })} /> : null}
        </View>
      );
    }
    if (method === 'balance') {
      const q = t('income.method.balanceQuestion');
      return (
        <View style={{ gap: space.gapSm }}>
          <Caption text={q} />
          <ChipRow label={q}>{HOLD_CHOICES.map((n) => radioChip(t('income.method.months', { count: n }), cur.hold === n, () => set({ hold: n }), String(n)))}</ChipRow>
        </View>
      );
    }
    return null;
  };

  return (
    <View style={{ gap: space.gapMd }}>
      <Intro textKey="income.method.intro" />
      {METHODS.map((m) => {
        const selected = cur.method === m.value;
        const title = t(`income.method.option${m.key}`);
        const desc = t(`income.method.option${m.key}Desc`);
        const example = t(`income.method.example${m.key}`);
        const soft = selected ? colors.inkSoft1 : colors.inkMuted;
        return (
          <View key={m.value} style={{ gap: space.gapMd }}>
            <ChoiceCard selected={selected} onPress={() => set({ method: m.value })} title={title} accessibilityLabel={`${title} ${desc} ${example}`}>
              <Text style={{ ...textRole(pairing, 'label'), color: selected ? colors.surface : colors.inkDim }}>{desc}</Text>
              <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.s13_5, color: soft }}>{example}</Text>
            </ChoiceCard>
            {renderFollowUp(m.value)}
          </View>
        );
      })}
      <Why textKey="income.method.why" />
    </View>
  );
});
