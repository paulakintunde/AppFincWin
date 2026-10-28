/**
 * Plan 05.2-24: "Loans and credit". One card per live debt with Balance, Minimum and APR, an Edit link, and (cards
 * only) the question "Do you usually pay the full balance each month?". The answers are saved when the step is.
 */
import React, { forwardRef, useImperativeHandle, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/ui/Text';
import { Chip } from '@/ui/Chip';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, space } from '@/theme/layout';
import { fontSize, textRole } from '@/theme/typography';
import { hapticSelection } from '@/ui/haptics';
import { useDebts } from '@/data/queries/decide';
import { useRecurringSeries } from '@/data/queries/recurringSeries';
import { useSetDebtPaysInFull, type PaysInFull } from '@/data/mutations/debts';
import type { DebtRow } from '@/db/debts';
import { useRecordContext } from '@/features/record/useRecordContext';
import { FigureStrip } from '@/features/decide/ui/FigureStrip';
import { Caption, ChipRow, TextButton, Why, useCopy, useNoWrapMoney, useReportReady } from '@/features/income/steps/shared';
import type { SetupStepBodyProps, SetupStepHandle } from './types';
import { setupSheetActions, type DebtKindChoice } from './setupSheetHost';

const ANSWERS: readonly { value: Exclude<PaysInFull, null>; labelKey: string }[] = [
  { value: 'yes', labelKey: 'decide.setup.loans.paysFullYes' },
  { value: 'sometimes', labelKey: 'decide.setup.loans.paysFullSometimes' },
  { value: 'no', labelKey: 'decide.setup.loans.paysFullNo' },
];

const KINDS: readonly { kind: DebtKindChoice; labelKey: string }[] = [
  { kind: 'card', labelKey: 'decide.setup.loans.kindCard' },
  { kind: 'car', labelKey: 'decide.setup.loans.kindCar' },
  { kind: 'student', labelKey: 'decide.setup.loans.kindStudent' },
  { kind: 'personal', labelKey: 'decide.setup.loans.kindPersonal' },
  { kind: 'mortgage', labelKey: 'decide.setup.loans.kindMortgage' },
  { kind: 'bnpl', labelKey: 'decide.setup.loans.kindBnpl' },
  { kind: 'other', labelKey: 'decide.setup.loans.kindOther' },
];

const NO_DEBTS: readonly DebtRow[] = [];

function DebtCard({
  debt,
  answer,
  dueDay,
  onAnswer,
}: {
  debt: DebtRow;
  answer: PaysInFull;
  dueDay: number | null;
  onAnswer: (value: Exclude<PaysInFull, null>) => void;
}) {
  const t = useCopy();
  const { colors, pairing } = useTheme();
  const noWrap = useNoWrapMoney(debt.currency);
  const items = [
    { caption: t('decide.setup.loans.balance'), value: noWrap(debt.balance) },
    { caption: t('decide.setup.loans.minimum'), value: noWrap(debt.minimum_payment) },
    { caption: t('decide.setup.loans.apr'), value: debt.apr !== null ? `${debt.apr}%` : t('decide.setup.loans.aprNotSet') },
  ];
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line2 }]}>
      <View style={styles.head}>
        <View style={styles.headText}>
          <Text style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink }}>{debt.name}</Text>
          {dueDay !== null ? (
            <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted }}>{t('decide.setup.loans.dueLine', { day: dueDay })}</Text>
          ) : null}
        </View>
        <TextButton label={t('decide.setup.loans.edit')} onPress={() => setupSheetActions().editDebt(debt)} />
      </View>
      <FigureStrip items={items} />
      {debt.kind === 'card' ? (
        <View style={{ gap: space.gapSm }}>
          <Caption text={t('decide.setup.loans.paysFull')} />
          <ChipRow label={t('decide.setup.loans.paysFullA11y', { name: debt.name })}>
            {ANSWERS.map((a) => (
              <Chip
                key={a.value}
                label={t(a.labelKey)}
                selected={answer === a.value}
                onPress={() => {
                  hapticSelection();
                  onAnswer(a.value);
                }}
              />
            ))}
          </ChipRow>
        </View>
      ) : null}
    </View>
  );
}

export const LoansStep = forwardRef<SetupStepHandle, SetupStepBodyProps>(function LoansStep({ onReadyChange }, ref) {
  const t = useCopy();
  const { colors, pairing } = useTheme();
  const rc = useRecordContext();
  const householdId = rc.householdId ?? undefined;
  const userId = rc.userId ?? undefined;
  const debtsQuery = useDebts(householdId);
  const seriesQuery = useRecurringSeries(householdId);
  const setter = useSetDebtPaysInFull();

  const debts = useMemo(
    () => (debtsQuery.data ?? NO_DEBTS).filter((d) => d.deleted_at === null && !d.paid_in_full),
    [debtsQuery.data]
  );
  const [draft, setDraft] = useState<Record<string, Exclude<PaysInFull, null>>>({});
  const answerOf = (d: DebtRow): PaysInFull => draft[d.id] ?? d.pays_in_full ?? null;
  const changed = debts.filter((d) => d.kind === 'card' && draft[d.id] !== undefined && draft[d.id] !== (d.pays_in_full ?? null));

  useReportReady(onReadyChange, true, null, changed.length > 0);

  useImperativeHandle(ref, () => ({
    save() {
      if (userId === undefined || changed.length === 0) return { stepId: null };
      let last: string | null = null;
      for (const d of changed) {
        last = setter.setPaysInFull(d, draft[d.id] as Exclude<PaysInFull, null>, userId, t('decide.setup.loans.title'));
      }
      return { stepId: last };
    },
  }));

  const dueDayOf = (d: DebtRow): number | null => {
    const s = d.series_id === null ? undefined : seriesQuery.data?.find((x) => x.id === d.series_id);
    return s === undefined ? null : Number(s.anchor_date.slice(8, 10));
  };

  return (
    <View style={{ gap: space.groupGap }}>
      {debts.length === 0 ? (
        <Text style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink }}>{t('decide.setup.loans.emptyTitle')}</Text>
      ) : (
        <View style={{ gap: space.gapMd }}>
          {debts.map((d) => (
            <DebtCard key={d.id} debt={d} answer={answerOf(d)} dueDay={dueDayOf(d)} onAnswer={(value) => setDraft({ ...draft, [d.id]: value })} />
          ))}
        </View>
      )}
      <View style={{ gap: space.gapSm }}>
        <Caption text={t('decide.setup.loans.addCaption')} />
        <ChipRow label={t('decide.setup.loans.addCaption')} role="none">
          {KINDS.map((k) => (
            <Chip
              key={k.kind}
              label={t(k.labelKey)}
              accessibilityLabel={t('decide.setup.loans.addA11y', { kind: t(k.labelKey) })}
              onPress={() => setupSheetActions().addDebt(k.kind)}
            />
          ))}
        </ChipRow>
      </View>
      <Why textKey="decide.setup.loans.why" />
    </View>
  );
});

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, borderWidth: 1, padding: space.cardPad, gap: space.gapMd },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: space.gapMd },
  headText: { flex: 1, flexShrink: 1, gap: 2 },
});
