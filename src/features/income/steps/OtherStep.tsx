/**
 * Plan 05.2-22: "Any other money coming in?" Each chosen chip adds a detail card (4a). Each complete line becomes a
 * regular income series carrying income_kind and counts_as ('available' or 'kept') through the existing series path,
 * so Activity tags and Decide count it the way the user said. "It varies" has no schedule, so it writes no series.
 */
import React, { forwardRef, useImperativeHandle, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import * as Crypto from 'expo-crypto';
import { Chip } from '@/ui/Chip';
import { Text } from '@/ui/Text';
import { TextInput } from '@/ui/TextInput';
import { MoneyInput } from '@/features/decide/ui/MoneyInput';
import { SegmentedToggle } from '@/features/decide/ui/SegmentedToggle';
import { MAX_INPUT_MINOR } from '@/features/decide/snapshot/checkInputs';
import { useConfirmRegularCandidate, usePatchSeriesAttributes } from '@/data/mutations/seriesAttributes';
import { useEditSeriesFrom } from '@/data/mutations/recurringSeries';
import type { RecurringSeriesPatch } from '@/db/recurringSeries';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, space } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { hapticSelection } from '@/ui/haptics';
import type { SetupStepBodyProps, SetupStepHandle } from '@/features/decide/setup/steps/types';
import { useIncomeContext } from '../useIncomeContext';
import { liveSeriesOfKind, payableAccounts, pausedIncomeSeries } from '../seriesHelpers';
import { Caption, ChipRow, Intro, PausedSeriesList, SeriesStatusLink, Stack, Why, useReportReady, useCopy } from './shared';

export const OTHER_NAME_MAX = 40;

type Freq = 'weekly' | 'fortnightly' | 'monthly' | 'quarterly' | 'yearly' | 'varies';
type Counts = 'available' | 'kept';

export const OTHER_KINDS = [
  { kind: 'side_business', chipKey: 'income.other.chipSide' },
  { kind: 'rent', chipKey: 'income.other.chipRent' },
  { kind: 'dividends', chipKey: 'income.other.chipDividends' },
  { kind: 'interest', chipKey: 'income.other.chipInterest' },
  { kind: 'family', chipKey: 'income.other.chipFamily' },
  { kind: 'other', chipKey: 'income.other.chipOther' },
] as const;
type Kind = (typeof OTHER_KINDS)[number]['kind'];

const FREQS: readonly { value: Freq; labelKey: string }[] = [
  { value: 'weekly', labelKey: 'income.other.freqWeekly' },
  { value: 'fortnightly', labelKey: 'income.other.freqFortnightly' },
  { value: 'monthly', labelKey: 'income.other.freqMonthly' },
  { value: 'quarterly', labelKey: 'income.other.freqQuarterly' },
  { value: 'yearly', labelKey: 'income.other.freqYearly' },
  { value: 'varies', labelKey: 'income.other.freqVaries' },
];

interface Line {
  amount: number | null;
  freq: Freq | null;
  counts: Counts | null;
  name: string;
}
interface Draft {
  kinds: Kind[];
  none: boolean;
  lines: Partial<Record<Kind, Line>>;
}

const BLANK: Line = { amount: null, freq: null, counts: null, name: '' };
const isFreq = (f: string): f is Freq => FREQS.some((x) => x.value === f);

const complete = (kind: Kind, l: Line): boolean =>
  l.amount !== null && l.amount > 0 && l.freq !== null && l.counts !== null && (kind !== 'other' || l.name.trim() !== '');

export const OtherStep = forwardRef<SetupStepHandle, SetupStepBodyProps>(function OtherStep({ onReadyChange }, ref) {
  const t = useCopy();
  const { colors, pairing } = useTheme();
  const ctx = useIncomeContext();
  const confirmer = useConfirmRegularCandidate(ctx.householdId ?? '', ctx.userId ?? '');
  const patcher = usePatchSeriesAttributes(ctx.householdId ?? '', ctx.userId ?? '');
  const editor = useEditSeriesFrom();

  const initial = useMemo<Draft>(() => {
    const kinds: Kind[] = [];
    const lines: Partial<Record<Kind, Line>> = {};
    for (const { kind } of OTHER_KINDS) {
      const s = liveSeriesOfKind(ctx.series, kind)[0];
      if (s === undefined) continue;
      kinds.push(kind);
      lines[kind] = { amount: s.amount, freq: isFreq(s.freq) ? s.freq : null, counts: s.counts_as ?? null, name: kind === 'other' ? s.name : '' };
    }
    return { kinds, none: false, lines };
  }, [ctx.series]);
  const paused = useMemo(() => pausedIncomeSeries(ctx.series).filter((s) => OTHER_KINDS.some((o) => o.kind === s.income_kind)), [ctx.series]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const cur = draft ?? initial;
  const account = payableAccounts(ctx.accounts)[0];

  const lineOf = (kind: Kind): Line => cur.lines[kind] ?? BLANK;
  const setLine = (kind: Kind, patch: Partial<Line>) => setDraft({ ...cur, lines: { ...cur.lines, [kind]: { ...lineOf(kind), ...patch } } });
  const toggleKind = (kind: Kind) => {
    hapticSelection();
    const has = cur.kinds.includes(kind);
    setDraft({ ...cur, none: false, kinds: has ? cur.kinds.filter((k) => k !== kind) : OTHER_KINDS.map((o) => o.kind).filter((k) => k === kind || cur.kinds.includes(k)) });
  };
  const chooseNone = () => {
    hapticSelection();
    setDraft({ ...cur, none: !cur.none, kinds: [] });
  };

  const existingOf = (kind: Kind) => liveSeriesOfKind(ctx.series, kind)[0];
  const changedOf = (kind: Kind): boolean => {
    const l = lineOf(kind);
    if (!complete(kind, l)) return false;
    const s = existingOf(kind);
    return s === undefined ? l.freq !== 'varies' : s.amount !== l.amount || s.freq !== l.freq || (s.counts_as ?? null) !== l.counts;
  };
  const dirty = cur.kinds.some(changedOf);
  // Optional step: Next is always there. A line that is not finished writes nothing.
  useReportReady(onReadyChange, true, null, dirty);

  useImperativeHandle(ref, () => ({
    save() {
      if (account === undefined || ctx.householdId === undefined || ctx.userId === undefined) return { stepId: null };
      const stepIds: string[] = [];
      for (const kind of cur.kinds) {
        if (!changedOf(kind)) continue;
        const l = lineOf(kind);
        if (l.amount === null || l.freq === null || l.freq === 'varies' || l.counts === null) continue;
        const s = existingOf(kind);
        if (s === undefined) {
          const chip = OTHER_KINDS.find((o) => o.kind === kind)!.chipKey;
          const { stepId } = confirmer.confirm({
            series: {
              id: Crypto.randomUUID(),
              household_id: ctx.householdId,
              account_id: account.id,
              name: kind === 'other' ? l.name.trim().slice(0, OTHER_NAME_MAX) : t(chip),
              amount: l.amount,
              currency: account.currency,
              category_id: null,
              payment_type: null,
              freq: l.freq,
              anchor_date: ctx.today,
              time_zone: ctx.timeZone,
              end_date: null,
              occurrence_count: null,
              is_automatic: false,
            },
            attributes: { income_kind: kind, counts_as: l.counts },
          });
          stepIds.push(stepId);
          continue;
        }
        if (s.amount !== l.amount || s.freq !== l.freq) {
          const patch: RecurringSeriesPatch = {};
          if (s.amount !== l.amount) patch.amount = l.amount;
          if (s.freq !== l.freq) patch.freq = l.freq;
          stepIds.push(editor.editFrom({ id: s.id, householdId: ctx.householdId, expectedVersion: s.version, patch, effectiveFrom: ctx.today, ownerId: ctx.userId, name: s.name }));
        }
        if ((s.counts_as ?? null) !== l.counts) {
          const r = patcher.patch([{ series: s, attributes: { counts_as: l.counts } }]);
          if (r) stepIds.push(r.stepId);
        }
      }
      return { stepId: stepIds[0] ?? null, ...(stepIds.length > 0 ? { stepIds } : {}) };
    },
  }));

  return (
    <View style={{ gap: space.groupGap }}>
      <Intro textKey="income.other.intro" />
      <ChipRow label={t('income.other.title')} role="none">
        {OTHER_KINDS.map((o) => (
          <Chip key={o.kind} label={t(o.chipKey)} selected={cur.kinds.includes(o.kind)} onPress={() => toggleKind(o.kind)} />
        ))}
        <Chip label={t('income.other.chipNone')} selected={cur.none} onPress={chooseNone} />
      </ChipRow>
      {cur.kinds.map((kind) => {
        const o = OTHER_KINDS.find((x) => x.kind === kind)!;
        const l = lineOf(kind);
        return (
          <View key={kind} style={[styles.card, { borderColor: colors.line2, backgroundColor: colors.surface }]}>
            <Text style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink }}>{t(o.chipKey)}</Text>
            {kind === 'other' ? (
              <Stack gap={space.gapSm}>
                <Caption text={t('income.other.otherName')} />
                <TextInput
                  value={l.name}
                  onChangeText={(name) => setLine(kind, { name: name.slice(0, OTHER_NAME_MAX) })}
                  maxLength={OTHER_NAME_MAX}
                  accessibilityLabel={t('income.other.otherName')}
                  placeholderTextColor={colors.inkFaint}
                  style={[styles.field, { ...textRole(pairing, 'body'), backgroundColor: colors.fill6, color: colors.ink }]}
                />
              </Stack>
            ) : null}
            <MoneyInput
              value={l.amount}
              currency={account?.currency ?? ctx.homeCurrency}
              onChange={(minor) => setLine(kind, { amount: minor !== null && minor > 0 && minor <= MAX_INPUT_MINOR ? minor : null })}
              label={t('income.other.detailAmountCaption')}
              accessibilityLabel={`${t(o.chipKey)}, ${t('income.other.detailAmountCaption')}`}
              boxed
              large
            />
            <Caption text={t('income.other.howOften')} />
            <ChipRow label={`${t(o.chipKey)}, ${t('income.other.howOften')}`}>
              {FREQS.map((f) => (
                <Chip
                  key={f.value}
                  label={t(f.labelKey)}
                  selected={l.freq === f.value}
                  onPress={() => {
                    hapticSelection();
                    setLine(kind, { freq: f.value });
                  }}
                />
              ))}
            </ChipRow>
            <Caption text={t('income.other.happens')} />
            <SegmentedToggle
              options={[
                { key: 'available', label: t('income.other.countsAvailable') },
                { key: 'kept', label: t('income.other.countsKept') },
              ]}
              value={l.counts ?? ''}
              onChange={(key) => setLine(kind, { counts: key === 'kept' ? 'kept' : 'available' })}
              accessibilityLabel={`${t(o.chipKey)}, ${t('income.other.happens')}`}
            />
            {existingOf(kind) !== undefined ? <SeriesStatusLink series={existingOf(kind)!} /> : null}
          </View>
        );
      })}
      <PausedSeriesList series={paused} />
      <Why textKey="income.other.why" />
    </View>
  );
});

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: radii.card, padding: space.cardPad, gap: space.gapMd },
  field: { minHeight: space.touchMin, borderRadius: space.cardPad, paddingHorizontal: space.cardPad },
});
