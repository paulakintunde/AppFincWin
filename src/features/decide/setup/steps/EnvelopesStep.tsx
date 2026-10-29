/**
 * Plan 05.2-29: "Your envelopes". Chips for the usual envelopes (and an exclusive "None right now"); a chip that is not
 * yet an envelope opens PotSheet with the name and the next unused swatch filled in, because an ordinary pot needs a
 * target and a date before it can be stored. Every envelope (including the saving buckets from the saving step, tagged
 * "saving bucket") is a row that opens PotSheet. The step itself writes nothing, so save() returns no step.
 */
import React, { forwardRef, useImperativeHandle, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/Text';
import { Chip } from '@/ui/Chip';
import { useTheme } from '@/theme/ThemeProvider';
import { PRESSED_OPACITY, space } from '@/theme/layout';
import { categorySwatch, type CategorySwatchKey } from '@/theme/tokens';
import { fontSize, textRole } from '@/theme/typography';
import { hapticSelection } from '@/ui/haptics';
import { usePots } from '@/data/queries/decide';
import type { SavingsGoalRow } from '@/db/savingsGoals';
import { useRecordContext } from '@/features/record/useRecordContext';
import { PotSheet } from '@/features/decide/pots/PotSheet';
import { potLineFor } from '@/features/decide/pots/potsModel';
import { ChipRow, Intro, Why, useCopy, useNoWrapMoney, useReportReady, type Copy } from '@/features/income/steps/shared';
import type { SetupStepBodyProps, SetupStepHandle } from './types';

const CHIPS: readonly { key: string; labelKey: string }[] = [
  { key: 'holiday', labelKey: 'decide.setup.envelopes.chipHoliday' },
  { key: 'carRepairs', labelKey: 'decide.setup.envelopes.chipCarRepairs' },
  { key: 'gifts', labelKey: 'decide.setup.envelopes.chipGifts' },
  { key: 'home', labelKey: 'decide.setup.envelopes.chipHome' },
  { key: 'education', labelKey: 'decide.setup.envelopes.chipEducation' },
  { key: 'other', labelKey: 'decide.setup.envelopes.chipOther' },
];

const SWATCH_ORDER = Object.keys(categorySwatch) as CategorySwatchKey[];
const NO_POTS: readonly SavingsGoalRow[] = [];

const sameName = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();

/** The next swatch no live envelope uses, or the first one when all are taken. */
function nextSwatch(pots: readonly SavingsGoalRow[]): CategorySwatchKey {
  const used = new Set(pots.map((p) => p.color_key));
  return SWATCH_ORDER.find((k) => !used.has(k)) ?? SWATCH_ORDER[0]!;
}

function monthlyOf(pot: SavingsGoalRow, today: string): number {
  if (pot.bucket != null) return pot.monthly_amount ?? 0;
  if (pot.target === null) return 0;
  const line = potLineFor(pot, { saved: pot.opening_saved, target: pot.target }, today);
  return line.state === 'active' ? Number(line.monthly) : 0;
}

function EnvelopeRow({ pot, index, today, onPress, t }: { pot: SavingsGoalRow; index: number; today: string; onPress: () => void; t: Copy }) {
  const { colors, pairing } = useTheme();
  const noWrap = useNoWrapMoney(pot.currency);
  const swatch = (pot.color_key ?? SWATCH_ORDER[index % SWATCH_ORDER.length]) as CategorySwatchKey;
  const monthly = monthlyOf(pot, today);
  const sub = monthly > 0 ? t('decide.setup.envelopes.rowMonthly', { amount: noWrap(monthly) }) : t('decide.setup.envelopes.rowAddAmount');
  const amount = noWrap(pot.opening_saved);
  const tag = pot.bucket != null ? t('decide.setup.envelopes.bucketTag') : null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[pot.name, tag, amount, sub].filter(Boolean).join(', ')}
      onPress={onPress}
      style={({ pressed }) => [styles.row, { backgroundColor: colors.surface, borderColor: colors.line2, opacity: pressed ? PRESSED_OPACITY : 1 }]}
    >
      <View style={[styles.dot, { backgroundColor: categorySwatch[swatch].color }]} />
      <View style={styles.name}>
        <Text style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink }}>{pot.name}</Text>
        {tag ? <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted }}>{tag}</Text> : null}
      </View>
      <View style={styles.amounts}>
        <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink }}>
          {amount}
        </Text>
        <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted, textAlign: 'right' }}>{sub}</Text>
      </View>
    </Pressable>
  );
}

export const EnvelopesStep = forwardRef<SetupStepHandle, SetupStepBodyProps>(function EnvelopesStep({ onReadyChange }, ref) {
  const t = useCopy();
  const rc = useRecordContext();
  const potsQuery = usePots(rc.userId ?? undefined, rc.householdId ?? undefined);
  const pots = potsQuery.data?.plain ?? NO_POTS;
  const [none, setNone] = useState(false);
  const [editing, setEditing] = useState<SavingsGoalRow | null>(null);
  const [adding, setAdding] = useState<{ name: string; colorKey: CategorySwatchKey } | null>(null);

  // Optional step: nothing here is required, and the sheets write on their own, so the step is never dirty.
  useReportReady(onReadyChange, true, null, false);
  useImperativeHandle(ref, () => ({ save: () => ({ stepId: null }) }));

  const live = useMemo(() => pots.filter((p) => p.deleted_at == null), [pots]);

  const onChip = (name: string): void => {
    hapticSelection();
    setNone(false);
    const existing = live.find((p) => p.bucket == null && sameName(p.name, name));
    if (existing) setEditing(existing);
    else setAdding({ name, colorKey: nextSwatch(live) });
  };

  return (
    <View style={{ gap: space.groupGap }}>
      <Intro textKey="decide.setup.envelopes.intro" />
      <ChipRow label={t('decide.setup.envelopes.title')} role="none">
        {CHIPS.map((c) => {
          const name = t(c.labelKey);
          const on = !none && live.some((p) => p.bucket == null && sameName(p.name, name));
          return <Chip key={c.key} label={name} selected={on} onPress={() => onChip(name)} />;
        })}
        <Chip
          label={t('decide.setup.envelopes.chipNone')}
          selected={none}
          onPress={() => {
            hapticSelection();
            setNone(!none);
          }}
        />
      </ChipRow>

      {live.length > 0 ? (
        <View style={{ gap: space.gapSm }}>
          {live.map((p, i) => (
            <EnvelopeRow key={p.id} pot={p} index={i} today={rc.today} onPress={() => setEditing(p)} t={t} />
          ))}
        </View>
      ) : null}

      <Why textKey="decide.setup.envelopes.why" />

      <PotSheet visible={editing !== null} pot={editing} onClose={() => setEditing(null)} />
      <PotSheet visible={adding !== null} pot={null} prefill={adding ?? undefined} onClose={() => setAdding(null)} />
    </View>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.gapMd, borderRadius: 16, borderWidth: 1, padding: space.cardPad, minHeight: space.touchMin },
  dot: { width: 12, height: 12, borderRadius: 6 },
  name: { flex: 1, flexShrink: 1, gap: 2 },
  amounts: { alignItems: 'flex-end', flexShrink: 0, gap: 2 },
});
