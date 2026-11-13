// 06.1-25 (D34, ENG-26 Grow half): setup item 3, Debts. The list is Grow's own debts; the due day is saved on the Grow debt through
// Grow's writer, so nothing is stored twice (T-06.1-25-02) and no Decide link is written. The writer is handed in as a prop because
// the Decide feature may not import Grow's write hooks (they reach the rate-fetch door); src/shell/decide/SetupItemRoutes.tsx supplies it.
//
//  - "No other debts" sets the D-23 flag, which keeps the item ticked when Grow holds no debt.
//  - "+ Add a debt" goes to Grow's Debts segment, where the add sheet lives.
//  - Save debts writes each changed due day (one Undo each), sets or clears the flag, and returns to the checklist.
import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useT } from '@/i18n';
import type { DebtRow } from '@/db/debts';
import { useSetDecideAnswered } from '@/data/mutations/decideSetup';
import { useDebts, useDecideSettings } from '@/data/queries/decide';
import { useDecideV3 } from '@/data/queries/decideV3';
import { useRecordContext } from '@/features/record/useRecordContext';
import { showToast } from '@/state/undoToast';
import { radii, space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { fontSize, textRole } from '@/theme/typography';
import { Pill } from '@/ui/Pill';
import { Text } from '@/ui/Text';
import { DayField, RadioRow, useSetupFormat } from './itemFields';
import { dueDayEdits, hasBadDueDay } from './othersLogic';
import { SetupItemFrame, useLeaveToChecklist } from './SetupItemFrame';

/** Saves a due day on a Grow debt and returns the undo step id. Bound in src/shell/decide/SetupItemRoutes.tsx (useSaveGrowDebt). */
export type SaveDueDay = (debt: DebtRow, day: number, ownerId: string) => string;

const GROW_DEBTS = '/grow?segment=debts' as Href;

export function DebtsSetup({ saveDueDay }: { saveDueDay: SaveDueDay }) {
  const t = useT();
  const router = useRouter();
  const leave = useLeaveToChecklist();
  const { colors, pairing } = useTheme();
  const fmt = useSetupFormat();
  const rc = useRecordContext();
  const userId = rc.userId ?? undefined;
  const householdId = rc.householdId ?? undefined;
  const debtsQ = useDebts(householdId);
  const v3 = useDecideV3();
  const settings = useDecideSettings(userId).data ?? null;
  const flags = useSetDecideAnswered(userId ?? '');
  const canWrite = userId !== undefined && householdId !== undefined;

  // The debts the engine counts (a card paid in full each month is left out), named from Grow's rows.
  const rows = useMemo(() => {
    const live = (debtsQ.data ?? []).filter((d) => d.deleted_at === null && d.paid_off_on == null);
    const counted = v3.inputs === null ? null : new Set(v3.inputs.debts.map((d) => d.id));
    return counted === null ? live : live.filter((d) => counted.has(d.id));
  }, [debtsQ.data, v3.inputs]);

  const [typed, setTyped] = useState<Record<string, string>>({});
  const [noOther, setNoOther] = useState<boolean | null>(null);
  const noOtherOn = noOther ?? (settings?.answered_no_debts_at ?? null) !== null;
  const bad = hasBadDueDay(typed);
  const label = { ...textRole(pairing, 'label'), fontSize: fontSize.meta };

  const save = (): void => {
    if (!canWrite || userId === undefined) return;
    let lastStep: string | null = null;
    for (const edit of dueDayEdits(rows, typed)) {
      const debt = rows.find((d) => d.id === edit.id);
      if (debt !== undefined) lastStep = saveDueDay(debt, edit.day, userId);
    }
    const flagStep = flags.set({ flag: 'no_debts', on: noOtherOn });
    showToast({ kind: 'ordinary', text: { key: 'decide.screens.setupOthers.debts.toast' }, stepId: lastStep ?? flagStep?.stepId ?? null });
    leave();
  };

  return (
    <SetupItemFrame
      title={t('decide.screens.setupOthers.debts.title')}
      why={t('decide.screens.setupOthers.debts.why')}
      primaryLabel={t('decide.screens.setupOthers.debts.save')}
      primaryDisabled={!canWrite || bad}
      onPrimary={save}
      onBack={leave}
      onSaveAndClose={leave}
    >
      <Text style={{ ...textRole(pairing, 'bodyStrong'), color: colors.ink }}>{t('decide.screens.setupOthers.debts.fromGrow')}</Text>
      {rows.length === 0 ? <Text testID="debts-empty" style={{ ...textRole(pairing, 'body'), color: colors.inkDim }}>{t('decide.screens.setupOthers.debts.empty')}</Text> : null}
      <View style={styles.list}>
        {rows.map((row) => {
          const balance = fmt.money(row.balance, row.currency);
          const minimum = fmt.money(row.minimum_payment, row.currency);
          const sub =
            row.apr == null
              ? t('decide.screens.setupOthers.debts.rowSubNoRate', { balance, amount: minimum })
              : t('decide.screens.setupOthers.debts.rowSub', { balance, rate: String(Number(row.apr)), amount: minimum });
          const due = row.due_day == null ? t('decide.screens.setupOthers.debts.dueNotSet') : t('decide.screens.setupOthers.debts.dueDaySet', { ordinal: fmt.ordinal(row.due_day) });
          return (
            <View key={row.id} testID={`debt-${row.id}`} style={[styles.card, { backgroundColor: colors.surface, borderColor: row.due_day == null ? colors.inkSoft1 : colors.line2 }]}>
              <View accessible accessibilityLabel={t('decide.screens.setupOthers.debts.rowA11y', { name: row.name, status: `${sub}, ${due}` })} style={styles.head}>
                <Text style={{ ...textRole(pairing, 'bodyStrong'), color: colors.ink }}>{row.name}</Text>
                <Text style={{ ...label, color: colors.inkMuted }}>{sub}</Text>
                <Text style={{ ...label, color: row.due_day == null ? colors.warn1 : colors.inkMuted }}>{due}</Text>
              </View>
              <DayField
                label={t('decide.screens.setupOthers.debts.dueDay')}
                text={typed[row.id] ?? (row.due_day == null ? '' : String(row.due_day))}
                onChange={(text) => setTyped((prev) => ({ ...prev, [row.id]: text }))}
              />
            </View>
          );
        })}
      </View>
      <Pill variant="secondary" label={t('decide.screens.setupOthers.debts.addDebt')} onPress={() => router.push(GROW_DEBTS)} />
      <View accessibilityRole="radiogroup">
        <RadioRow label={t('decide.screens.setupOthers.debts.noOther')} selected={noOtherOn} onPress={() => setNoOther(!noOtherOn)} />
      </View>
      <Text style={{ ...label, color: colors.inkMuted }}>{t('decide.screens.setupOthers.debts.note')}</Text>
    </SetupItemFrame>
  );
}

const styles = StyleSheet.create({
  list: { gap: space.gapMd },
  card: { borderRadius: radii.card, borderWidth: 1.5, padding: space.cardPad, gap: space.gapSm },
  head: { gap: 2 },
});
