// 06.1-24 (D33, D33E, D33A): setup item 2, Regular bills. The list is the payments found in the records plus bills added by hand; every
// mark is saved at once to Activity through the existing series and dismissal mutations (one Undo each), so nothing is stored twice in
// Decide (ENG-26). Only rows marked Regular count toward "Total each month".
//
//  - Regular: confirms the payment as a bill series.   Not regular: stores a dismissal, with Undo.   Change: D33E, saved to the bill.
//  - + Add a bill it missed: D33A, makes a regular bill.
//  - These are right: sets the bills-right flag (D-23) so the item stays ticked, then returns to the checklist.
//  - Save and close: returns without setting the flag; marks already made stay.
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import * as Crypto from 'expo-crypto';
import { useT } from '@/i18n';
import type { NewRecurringSeries, RecurringSeriesPatch } from '@/db/recurringSeries';
import { useAddDismissal } from '@/data/mutations/dismissals';
import { useSetDecideAnswered } from '@/data/mutations/decideSetup';
import { useConfirmRegularCandidate } from '@/data/mutations/seriesAttributes';
import { useAccounts } from '@/data/queries/accounts';
import { useRecurringSeries } from '@/data/queries/recurringSeries';
import { useRegularCandidates } from '@/features/decide/screens/setup/items/useRegularCandidates';
import { payableAccounts } from '@/features/income/seriesHelpers';
import { undoLabelText } from '@/i18n/undoLabel';
import { showToast } from '@/state/undoToast';
import { PRESSED_OPACITY, radii, space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { ACCENT_TINT_OPACITY } from '@/theme/tokens';
import { fontSize, textRole } from '@/theme/typography';
import { hapticSelection } from '@/ui/haptics';
import { Pill } from '@/ui/Pill';
import { useShouldStack } from '@/ui/textFit';
import { Text } from '@/ui/Text';
import { BillSheet, type BillValues } from './BillSheets';
import { useFreqWord, useSetupFormat } from './itemFields';
import { anchorWithDay, buildBillRows, nextDateOnDay, regularCount, regularMonthlyTotal, type BillRow, type EditSeriesFrom } from './itemLogic';
import { SetupItemFrame, useLeaveItem } from './SetupItemFrame';

export function BillsSetup({ editSeriesFrom }: { editSeriesFrom: EditSeriesFrom }) {
  const t = useT();
  const leave = useLeaveItem();
  const { colors, pairing } = useTheme();
  const stacked = useShouldStack();
  const fmt = useSetupFormat();
  const freqWord = useFreqWord();
  const found = useRegularCandidates();
  const { householdId, userId, today, homeCurrency, timeZone } = found;
  const series = useRecurringSeries(householdId);
  const accounts = useAccounts(householdId);
  const confirmer = useConfirmRegularCandidate(householdId ?? '', userId ?? '');
  const dismisser = useAddDismissal(householdId ?? '', userId ?? '');
  const flags = useSetDecideAnswered(userId ?? '');
  const canWrite = householdId !== undefined && userId !== undefined;
  const payable = useMemo(() => payableAccounts(accounts.data ?? []), [accounts.data]);
  const fallbackAccount = payable[0] ?? null;

  const rows = useMemo(() => buildBillRows(found.rows, series.data ?? []), [found.rows, series.data]);
  const total = regularMonthlyTotal(rows);
  const [editing, setEditing] = useState<BillRow | null>(null);
  const [adding, setAdding] = useState(false);

  const newSeries = (v: { name: string; amount: number; freq: BillValues['freq']; anchor: string; accountId: string; currency: string; categoryId: string | null }): NewRecurringSeries => ({
    id: Crypto.randomUUID(),
    household_id: householdId as string,
    account_id: v.accountId,
    name: v.name,
    amount: v.amount,
    currency: v.currency,
    category_id: v.categoryId,
    payment_type: null,
    freq: v.freq,
    anchor_date: v.anchor,
    time_zone: timeZone,
    end_date: null,
    occurrence_count: null,
    is_automatic: false,
  });

  const markRegular = (row: BillRow, over?: Partial<BillValues>): void => {
    if (!canWrite || row.found === null) return;
    const accountId = row.found.accountId ?? fallbackAccount?.id ?? null;
    if (accountId === null) return;
    const name = row.name;
    const { stepId } = confirmer.confirm({
      series: newSeries({
        name,
        amount: over?.amount ?? row.amount,
        freq: over?.freq ?? row.freq,
        anchor: anchorWithDay(row.found.candidate.anchorDate, over?.day ?? row.day),
        accountId,
        currency: row.currency,
        categoryId: row.found.categoryId,
      }),
      direction: 'out',
      linkTransactionIds: row.found.candidate.rowIds,
      attributes: {},
      dismissalToClear: row.found.dismissal,
    });
    showToast({ kind: 'ordinary', text: undoLabelText('paymentMarkedRegular', { name }), stepId });
  };

  const markNotRegular = (row: BillRow): void => {
    if (!canWrite || row.found === null) return;
    const { stepId } = dismisser.dismiss({ payeeKey: row.found.candidate.key, direction: row.found.candidate.direction, name: row.name });
    showToast({ kind: 'ordinary', text: undoLabelText('paymentDismissed', { name: row.name }), stepId });
  };

  const saveEdit = (row: BillRow, v: BillValues): void => {
    setEditing(null);
    if (row.series === null) {
      markRegular(row, v);
      return;
    }
    const patch: RecurringSeriesPatch = {};
    if (row.amount !== v.amount) patch.amount = -Math.abs(v.amount);
    if (row.day !== v.day) patch.anchor_date = anchorWithDay(row.series.anchor_date, v.day);
    if (row.freq !== v.freq) patch.freq = v.freq;
    if (Object.keys(patch).length === 0 || !canWrite) return;
    const stepId = editSeriesFrom({ id: row.series.id, householdId: householdId as string, expectedVersion: row.series.version, patch, effectiveFrom: today, ownerId: userId as string, name: row.name });
    showToast({ kind: 'ordinary', text: { key: 'decide.screens.setupPayBills.billEdit.toast' }, stepId });
  };

  const addBill = (v: BillValues): void => {
    setAdding(false);
    if (!canWrite || fallbackAccount === null) return;
    const { stepId } = confirmer.confirm({
      series: newSeries({ name: v.name, amount: v.amount, freq: v.freq, anchor: nextDateOnDay(today, v.day), accountId: fallbackAccount.id, currency: fallbackAccount.currency, categoryId: null }),
      direction: 'out',
      linkTransactionIds: [],
      attributes: {},
    });
    showToast({ kind: 'ordinary', text: { key: 'decide.screens.setupPayBills.billAdd.toast' }, stepId });
  };

  // 06.1-65: every edit here is saved by its sheet at once, so nothing on the page is left unsaved and "Save and close" just
  // closes. "These are right" (the primary) is an answer, not a save of typed input.
  const right = (): boolean => {
    if (!canWrite) return false;
    const done = flags.set({ flag: 'bills_right', on: true });
    showToast({
      kind: 'ordinary',
      text: { key: 'decide.screens.setupPayBills.bills.toast', params: { count: regularCount(rows) } },
      stepId: done?.stepId ?? null,
    });
    return true;
  };

  const label = { ...textRole(pairing, 'label'), fontSize: fontSize.meta };

  return (
    <SetupItemFrame
      title={t('decide.screens.setupPayBills.bills.title')}
      why={t('decide.screens.setupPayBills.bills.why')}
      primaryLabel={t('decide.screens.setupPayBills.bills.right')}
      primaryDisabled={!canWrite}
      onSave={right}
      onLeave={leave}
    >
      {rows.length > 0 ? (
        <Text style={{ ...textRole(pairing, 'body'), color: colors.inkDim }}>{t('decide.screens.setupPayBills.bills.lead')}</Text>
      ) : (
        <Text testID="bills-empty" style={{ ...textRole(pairing, 'body'), color: colors.inkDim }}>{t('decide.screens.setupPayBills.bills.empty')}</Text>
      )}
      <View style={styles.list}>
        {rows.map((row) => {
          const amount = fmt.money(row.amount, row.currency);
          const stateWord = row.state === 'regular' ? t('decide.screens.setupPayBills.bills.regular') : row.state === 'notRegular' ? t('decide.screens.setupPayBills.bills.notRegular') : t('decide.screens.setupPayBills.bills.notMarked');
          const sub = row.freq === 'monthly' ? t('decide.screens.setupPayBills.bills.rowSub', { ordinal: fmt.ordinal(row.day) }) : freqWord(row.freq);
          return (
            <View
              key={row.id}
              testID={`bill-${row.id}`}
              style={[
                styles.card,
                row.state === 'notRegular'
                  ? { backgroundColor: colors.fill2, borderColor: colors.fill2 }
                  : { backgroundColor: colors.surface, borderColor: row.state === 'unmarked' ? colors.inkSoft1 : colors.line2 },
              ]}
            >
              <View accessible accessibilityLabel={t('decide.screens.setupPayBills.bills.rowA11y', { name: row.name, amount, state: stateWord })} style={styles.head}>
                <View style={styles.headText}>
                  <Text style={{ ...textRole(pairing, 'bodyStrong'), color: colors.ink }}>{row.name}</Text>
                  <Text style={{ ...label, color: colors.inkMuted }}>{sub}</Text>
                  {row.state === 'unmarked' ? <Text style={{ ...label, color: colors.warn1 }}>{stateWord}</Text> : null}
                </View>
                <Text style={{ ...textRole(pairing, 'body'), color: colors.ink, flexShrink: 0 }}>{amount}</Text>
              </View>
              <View style={stacked ? styles.chipsStacked : styles.chipsRow}>
                <MarkChip
                  testID={`regular-${row.id}`}
                  label={t('decide.screens.setupPayBills.bills.regular')}
                  a11y={t('decide.screens.setupPayBills.bills.markRegularA11y', { name: row.name })}
                  selected={row.state === 'regular'}
                  disabled={!canWrite || row.state === 'regular' || row.found === null}
                  fill={!stacked}
                  onPress={() => markRegular(row)}
                />
                <MarkChip
                  testID={`not-regular-${row.id}`}
                  label={t('decide.screens.setupPayBills.bills.notRegular')}
                  a11y={t('decide.screens.setupPayBills.bills.markNotRegularA11y', { name: row.name })}
                  selected={row.state === 'notRegular'}
                  // A payment that is already a series is ended where series are edited, not by a dismissal here.
                  disabled={!canWrite || row.state !== 'unmarked'}
                  fill={!stacked}
                  onPress={() => markNotRegular(row)}
                />
                <MarkChip
                  testID={`change-${row.id}`}
                  label={t('decide.screens.common.change')}
                  a11y={t('decide.screens.setupPayBills.bills.changeA11y', { name: row.name })}
                  selected={false}
                  disabled={!canWrite}
                  fill={!stacked}
                  onPress={() => setEditing(row)}
                />
              </View>
            </View>
          );
        })}
      </View>
      <View style={styles.totalRow}>
        <Text style={{ ...textRole(pairing, 'bodyStrong'), color: colors.ink, flexShrink: 1 }}>{t('decide.screens.setupPayBills.bills.total')}</Text>
        <Text testID="bills-total" style={{ ...textRole(pairing, 'bodyStrong'), color: colors.ink, flexShrink: 0 }}>{fmt.money(total, homeCurrency)}</Text>
      </View>
      <Pill
        variant="secondary"
        label={t('decide.screens.setupPayBills.bills.addMissed')}
        disabled={!canWrite || fallbackAccount === null}
        onPress={() => setAdding(true)}
      />
      {canWrite && fallbackAccount === null ? <Text style={{ ...label, color: colors.warn1 }}>{t('decide.screens.setupPayBills.bills.noAccount')}</Text> : null}

      <BillSheet
        visible={editing !== null}
        mode="edit"
        currency={editing?.currency ?? homeCurrency}
        initial={editing === null ? undefined : { name: editing.name, amount: editing.amount, day: editing.day, freq: editing.freq }}
        onSave={(v) => editing !== null && saveEdit(editing, v)}
        onDismiss={() => setEditing(null)}
      />
      <BillSheet visible={adding} mode="add" currency={fallbackAccount?.currency ?? homeCurrency} onSave={addBill} onDismiss={() => setAdding(false)} />
    </SetupItemFrame>
  );
}

interface MarkChipProps {
  testID: string;
  label: string;
  a11y: string;
  selected: boolean;
  disabled: boolean;
  fill: boolean;
  onPress: () => void;
}

function MarkChip({ testID, label, a11y, selected, disabled, fill, onPress }: MarkChipProps) {
  const { colors, pairing } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={() => {
        hapticSelection();
        onPress();
      }}
      style={({ pressed }) => [styles.mark, fill ? styles.markFill : styles.markFull, { backgroundColor: colors.fill1, opacity: pressed ? PRESSED_OPACITY : 1 }]}
    >
      {selected ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: colors.accent, opacity: ACCENT_TINT_OPACITY, borderRadius: radii.pill }]} /> : null}
      <Text style={{ ...textRole(pairing, 'label'), color: selected ? colors.accent : colors.ink, textAlign: 'center' }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: { gap: space.gapMd },
  card: { borderRadius: radii.card, borderWidth: 1.5, padding: space.cardPad, gap: space.gapSm },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: space.gapMd },
  headText: { flex: 1, flexShrink: 1, gap: 2 },
  chipsRow: { flexDirection: 'row', gap: space.gapSm },
  chipsStacked: { gap: space.gapSm },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: space.gapMd },
  mark: { minHeight: space.touchMin, borderRadius: radii.pill, justifyContent: 'center', alignItems: 'center', paddingHorizontal: space.gapMd, overflow: 'hidden' },
  markFill: { flex: 1 },
  markFull: { alignSelf: 'stretch' },
});
