/**
 * 05-127 (D-101, R18.2): the add / edit sheet for one pot, modelled on ChangeSheet. Name, Target, By (a month; stored as the
 * last day of that month), Already saved (blank is 0). The preview line is potSetAside's own answer, a polite live region
 * that settles after typing (D-56). Edit mode adds the saved-so-far note and Tag a transfer. Cancel with edits asks the
 * 03 D-26 discard question; the form mounts per opening so fields start from the row.
 */
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useAddPot, useEditPot } from '@/data/mutations/decidePots';
import { newStepId } from '@/data/mutations/undoCapture';
import { useGoalLines } from '@/data/queries/decide';
import { homeAmountFor } from '@/data/queries/homeAmount';
import type { SavingsGoalPatch, SavingsGoalRow } from '@/db/savingsGoals';
import type { TransactionRow } from '@/db/rows';
import { currencyCode, minorUnits } from '@/engine/money';
import { monthOf } from '@/engine/time';
import { useT } from '@/i18n';
import { showToast } from '@/state/undoToast';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, space } from '@/theme/layout';
import { CloseGlyph } from '@/ui/CloseGlyph';
import { ConfirmSheet } from '@/ui/ConfirmSheet';
import { Pill } from '@/ui/Pill';
import { Sheet, SheetScroll } from '@/ui/Sheet';
import { SheetHeader } from '@/ui/SheetHeader';
import { Text } from '@/ui/Text';
import { useIsDirty } from '@/ui/useIsDirty';
import { useMoneyFormatter } from '@/ui/money/useMoneyFormatter';
import { textRole } from '@/theme/typography';
import { Box, Label, Meta } from '../check/steps/stepUi';
import { useSettledLabel } from '../check/useSettledLabel';
import { monthLabel, toMonthKey } from '../home/ChangeSheet';
import { AttachLineSheet } from '../past/AttachLineSheet';
import { useGoalTagEdit } from '../past/goalTagEdit';
import { usePastContext } from '../past/usePastDecisions';
import { MAX_INPUT_MINOR } from '../snapshot/checkInputs';
import { MoneyInput } from '../ui/MoneyInput';
import { MonthField } from './MonthField';
import { checkPotMonth, lastDayOfMonth, maxPotMonth, potLineFor } from './potsModel';

const NAME_MAX = 80;
const SETTLE_MS = 150;
const DASH = '—';

export interface PotSheetProps {
  visible: boolean;
  /** null: add mode. */
  pot: SavingsGoalRow | null;
  onClose: () => void;
}

interface Fields {
  name: string;
  target: number | null;
  /** 'YYYY-MM-DD' (first of the chosen month) or null before one is picked. */
  by: string | null;
  saved: number | null;
}

export function PotSheet(props: PotSheetProps) {
  return props.visible ? <PotForm pot={props.pot} onClose={props.onClose} /> : null;
}

const firstOfMonth = (month: string): string => `${month}-01`;
const validMinor = (n: number | null): n is number => n !== null && Number.isSafeInteger(n) && n > 0 && n <= MAX_INPUT_MINOR;

function PotForm({ pot, onClose }: { pot: SavingsGoalRow | null; onClose: () => void }) {
  const t = useT() as (key: string, params?: Record<string, string | number>) => string;
  const { colors, pairing } = useTheme();
  const fmt = useMoneyFormatter(false);
  const { userId, householdId, today, ctx, whole } = usePastContext();
  const { add } = useAddPot();
  const { edit } = useEditPot();
  const tagEdit = useGoalTagEdit();
  const [asking, setAsking] = useState(false);
  const [tagging, setTagging] = useState(false);

  const [initial] = useState<Fields>(() =>
    pot === null
      ? { name: '', target: null, by: null, saved: null }
      : {
          name: pot.name,
          target: pot.target,
          by: pot.ready_by === null ? null : firstOfMonth(toMonthKey(pot.ready_by)),
          saved: pot.opening_saved === 0 ? null : pot.opening_saved,
        }
  );
  const [value, setValue] = useState<Fields>(initial);
  const dirty = useIsDirty(initial, value);
  const set = (patch: Partial<Fields>) => setValue((v) => ({ ...v, ...patch }));

  const currency = pot?.currency ?? ctx.home;
  const trimmed = value.name.trim();
  const nameOk = trimmed.length >= 1 && trimmed.length <= NAME_MAX;
  const targetOk = validMinor(value.target);
  const monthKey = value.by === null ? null : toMonthKey(value.by);
  const ownMonth = initial.by === null ? undefined : toMonthKey(initial.by);
  const monthState = monthKey === null ? null : checkPotMonth(monthKey, today, ownMonth);
  const monthOk = monthState === 'ok';
  const openingOk = value.saved === null || (Number.isSafeInteger(value.saved) && value.saved >= 0 && value.saved <= MAX_INPUT_MINOR);
  const canSave = nameOk && targetOk && monthOk && openingOk && (pot !== null || (userId !== null && householdId !== null));

  // Edit mode: transfers tagged to this pot count toward saved-so-far (home-currency pots only, as savedSoFar does).
  const goalLines = useGoalLines(householdId, pot === null ? [] : [pot.id]).data;
  const tagged = useMemo(
    () => (pot === null ? [] : (goalLines ?? []).filter((l) => l.goal_id === pot.id && l.deleted_at === null)),
    [goalLines, pot]
  );
  const taggedSum = useMemo(() => {
    let sum = 0;
    for (const l of tagged) {
      if (l.status !== 'paid') continue;
      const a = homeAmountFor(l, ctx.home, ctx.rates);
      if (a !== null) sum += Math.abs(a);
    }
    return sum;
  }, [tagged, ctx.home, ctx.rates]);

  // The preview comes from potSetAside, the engine's single answer.
  const { target: targetValue, saved: savedValue } = value;
  const preview =
    targetOk && monthOk && monthKey !== null && targetValue !== null
      ? potLineFor(
          { id: 'preview', kind: 'pot', target: targetValue, monthly_amount: null, ready_by: lastDayOfMonth(monthKey) },
          { saved: (openingOk ? (savedValue ?? 0) : 0) + taggedSum, target: targetValue },
          today
        )
      : null;

  const money = (n: number) => fmt.formatMoney({ amount: minorUnits(n), currency: currencyCode(currency) });
  let previewText = '';
  if (preview !== null) {
    if (preview.state === 'reached') previewText = t('decide.pots.sheet.previewReached');
    else if (preview.state === 'past_due') previewText = t('decide.pots.sheet.previewPast');
    else previewText = t('decide.pots.sheet.previewActive', { amount: money(preview.monthly), count: preview.months ?? 1 });
  }
  const settled = useSettledLabel(previewText, preview?.state ?? 'none', SETTLE_MS);

  const save = () => {
    if (!canSave || value.target === null || monthKey === null) return;
    const readyBy = lastDayOfMonth(monthKey);
    const opening = value.saved ?? 0;
    if (pot === null) {
      if (userId === null || householdId === null) return;
      const { stepId } = add({ householdId, ownerId: userId, pot: { name: trimmed, currency, target: value.target, ready_by: readyBy, opening_saved: opening } });
      showToast({ kind: 'destructive', text: { key: 'decide.pots.toast.saved', params: { undoLabel: 'potAdded', name: trimmed } }, stepId });
    } else {
      const patch: SavingsGoalPatch = {};
      if (trimmed !== pot.name) patch.name = trimmed;
      if (value.target !== pot.target) patch.target = value.target;
      if (readyBy !== pot.ready_by) patch.ready_by = readyBy;
      if (opening !== pot.opening_saved) patch.opening_saved = opening;
      if (Object.keys(patch).length > 0) {
        const stepId = edit(pot, patch);
        showToast({ kind: 'destructive', text: { key: 'decide.pots.toast.saved', params: { undoLabel: 'potEdited', name: trimmed } }, stepId });
      }
    }
    onClose();
  };

  // D-34: tagging a transfer is an ordinary undoable edit of goal_id, injected by the route (GoalTagEditProvider).
  const setTag = (row: TransactionRow, goalId: string | null) => {
    if (userId === null || pot === null) return;
    const stepId = newStepId();
    const recorded = tagEdit(
      { id: row.id, householdId: row.household_id, month: monthOf(row.local_date), expectedVersion: row.version, patch: { goal_id: goalId } },
      {
        stepId,
        ownerId: userId,
        labelKey: goalId === null ? 'transferUntagged' : 'transferTagged',
        labelParams: { name: row.name ?? row.note ?? '' },
        before: { goal_id: goalId === null ? pot.id : null },
      }
    );
    showToast({
      kind: 'ordinary',
      text: { key: goalId === null ? 'decide.depth.goal.untagged' : 'decide.depth.goal.tagged' },
      ...(recorded ? { stepId } : {}),
    });
  };

  const cancel = () => (dirty ? setAsking(true) : onClose());
  const title = t(pot === null ? 'decide.pots.sheet.titleNew' : 'decide.pots.sheet.titleEdit');
  // R18.2: a month choice starting no earlier than this month (an existing pot keeps its own earlier month on the list).
  const minMonth = ownMonth !== undefined && ownMonth < today.slice(0, 7) ? ownMonth : today.slice(0, 7);

  return (
    <>
      <Sheet visible onDismiss={onClose} accessibilityLabel={title} dirty={dirty}>
        <SheetHeader title={title} cancelLabel={t('decide.pots.sheet.cancel')} onCancel={cancel} />
        <SheetScroll contentContainerStyle={styles.column}>
          <Label>{t('decide.pots.sheet.name')}</Label>
          <Box
            value={value.name}
            onChangeText={(name) => set({ name })}
            accessibilityLabel={t('decide.pots.sheet.name')}
            placeholder={t('decide.pots.sheet.namePlaceholder')}
            maxLength={NAME_MAX}
          />
          <MoneyInput
            boxed
            value={value.target}
            currency={currency}
            onChange={(target) => set({ target })}
            label={t('decide.pots.sheet.target')}
            accessibilityLabel={t('decide.pots.sheet.target')}
          />
          <MonthField
            label={t('decide.pots.sheet.by')}
            value={monthKey}
            empty={DASH}
            minMonth={minMonth}
            maxMonth={maxPotMonth(today)}
            format={(m) => monthLabel(fmt.locale, m)}
            onChange={(m) => set({ by: firstOfMonth(m) })}
          />
          {monthState !== null && monthState !== 'ok' ? <Meta tone="danger">{t('decide.pots.sheet.byRange')}</Meta> : null}
          <MoneyInput
            boxed
            value={value.saved}
            currency={currency}
            onChange={(saved) => set({ saved })}
            label={t('decide.pots.sheet.alreadySaved')}
            accessibilityLabel={t('decide.pots.sheet.alreadySaved')}
          />
          {preview === null ? null : (
            <View accessible accessibilityLiveRegion="polite" accessibilityLabel={settled}>
              <Text testID="pot-preview" style={{ ...textRole(pairing, 'body'), color: colors.ink }}>
                {previewText}
              </Text>
            </View>
          )}
          {pot === null ? null : (
            <>
              <Meta tone="muted">{t('decide.pots.sheet.savedNote')}</Meta>
              {tagged.map((l) => {
                const amount = homeAmountFor(l, ctx.home, ctx.rates);
                const name = l.name ?? l.note ?? '';
                const shown = name !== '' ? name : amount !== null ? whole(Math.abs(amount)) : l.local_date;
                return (
                  <View key={l.id} style={styles.lineRow}>
                    <View style={styles.lineText}>
                      <Text style={{ ...textRole(pairing, 'body'), color: colors.ink }}>{name !== '' ? name : l.local_date}</Text>
                      <Meta>{amount !== null ? whole(Math.abs(amount)) : t('decide.depth.goal.waitingRate')}</Meta>
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t('decide.depth.goal.untagA11y', { name: shown })}
                      onPress={() => setTag(l, null)}
                      style={styles.untag}
                    >
                      <CloseGlyph color={colors.inkDim} />
                    </Pressable>
                  </View>
                );
              })}
              <Pill label={t('decide.pots.sheet.tagTransfer')} variant="secondary" onPress={() => setTagging(true)} />
            </>
          )}
          <Pill label={t('decide.pots.sheet.save')} variant="primary" disabled={!canSave} onPress={save} />
        </SheetScroll>
      </Sheet>
      {pot !== null && householdId !== null ? (
        <AttachLineSheet
          mode="transfer"
          visible={tagging}
          householdId={householdId}
          excludeIds={tagged.map((l) => l.id)}
          onPick={(row) => setTag(row, pot.id)}
          onClose={() => setTagging(false)}
        />
      ) : null}
      <ConfirmSheet
        visible={asking}
        title={t('sheet.discard.title')}
        body={t('sheet.discard.body')}
        cancelLabel={t('sheet.discard.keep')}
        confirmLabel={t('sheet.discard.confirm')}
        destructive
        onCancel={() => setAsking(false)}
        onConfirm={() => {
          setAsking(false);
          onClose();
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  column: { gap: space.gapSm, paddingBottom: space.gapMd },
  lineRow: { flexDirection: 'row', alignItems: 'center', gap: space.gapMd, minHeight: space.touchMin },
  lineText: { flex: 1 },
  untag: { width: space.touchMin, minHeight: space.touchMin, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
});
