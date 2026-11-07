// 06-22 (G02a, D-08): Add money / Take some out for one goal. Amount, From / To account, a date, and the plain note that this is
// a move between the user's own accounts, not spending. The primary label follows the amount ("Add $50"). Taking money out of a
// locked goal asks first and says what changes in Decide ("Decide will count $200 less as kept safe"); the answer is "Take $200
// out" (accent, not danger) or "Keep it", with a light haptic and no warning one. Exported for the safety-net screen (06-16).
import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useMoveGoalMoney } from '@/data/mutations/growGoals';
import { useAccounts } from '@/data/queries/accounts';
import { useCategoryLookup } from '@/data/queries/categories';
import { useGoalLines } from '@/data/queries/growGoals';
import type { SavingsGoalRow } from '@/db/savingsGoals';
import { currencyCode, minorUnits } from '@/engine/money';
import { useT } from '@/i18n';
import { usePastContext } from '@/features/decide/past/usePastDecisions';
import { DateField } from '@/features/record/entry/pickers/DateField';
import { AccountPicker } from '@/features/record/entry/pickers/AccountPicker';
import { space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { textRole } from '@/theme/typography';
import { Chip } from '@/ui/Chip';
import { ConfirmSheet } from '@/ui/ConfirmSheet';
import { hapticLight } from '@/ui/haptics';
import { useMoneyFormatter } from '@/ui/money/useMoneyFormatter';
import { MoneyInput } from '@/ui/MoneyInput';
import { Pill } from '@/ui/Pill';
import { Row } from '@/ui/Row';
import { Sheet, SheetScroll } from '@/ui/Sheet';
import { SheetHeader } from '@/ui/SheetHeader';
import { Text } from '@/ui/Text';
import { toHomeOf, useGoalsRead } from './useGoalsRead';

export type MoveKind = 'add' | 'take';

export interface MoneyMovedEvent {
  kind: MoveKind;
  stepId: string;
  reachedTarget: boolean;
  /** Goal-side minor units. */
  amount: number;
}

export interface MoneyMoveSheetProps {
  visible: boolean;
  goal: SavingsGoalRow | null;
  kind: MoveKind;
  onClose: () => void;
  onMoved?: (e: MoneyMovedEvent) => void;
}

export function MoneyMoveSheet(props: MoneyMoveSheetProps) {
  return props.visible && props.goal !== null ? <MoveForm {...props} goal={props.goal} /> : null;
}

function MoveForm({ goal, kind, onClose, onMoved }: Omit<MoneyMoveSheetProps, 'visible' | 'goal'> & { goal: SavingsGoalRow }) {
  const t = useT() as (key: string, params?: Record<string, string | number>) => string;
  const { colors, pairing } = useTheme();
  const { userId, householdId, today, ctx } = usePastContext();
  const fmt = useMoneyFormatter(false, ctx.home);
  const cur = currencyCode(goal.currency);
  const money = (minor: number) => fmt.formatMoney({ amount: minorUnits(minor), currency: cur });
  const accountsQ = useAccounts(householdId ?? undefined);
  const cats = useCategoryLookup(userId ?? undefined);
  const linesQ = useGoalLines(householdId, [goal.id]);
  const read = useGoalsRead();
  const { move } = useMoveGoalMoney();

  const accounts = useMemo(() => (accountsQ.data ?? []).filter((a) => a.archived_at === null && a.currency === goal.currency), [accountsQ.data, goal.currency]);
  const goalAccount = accounts.find((a) => a.id === goal.account_id) ?? null;
  const [amount, setAmount] = useState<number | null>(null);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [date, setDate] = useState(today);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [asking, setAsking] = useState(false);

  // The other account: the user's pick, else the first account that is not the goal's own.
  const other = accounts.find((a) => a.id === pickedId) ?? accounts.find((a) => a.id !== goal.account_id) ?? accounts[0] ?? null;

  const isNet = goal.is_safety_net === true;
  const point = isNet ? read.model.safetyNet : read.model.goals.find((g) => g.id === goal.id) ?? null;
  const saved = point === null ? 0 : point.saved;
  const lockedTake = kind === 'take' && (goal.locked === true || isNet);
  const valid = amount !== null && amount > 0;
  const needsGoalAccount = kind === 'take' && goal.account_id === null;
  const ready = valid && other !== null && !needsGoalAccount && (goal.account_id === null || goalAccount !== null);

  const title = t(kind === 'add' ? 'grow.goals.move.addTitle' : 'grow.goals.move.takeTitle', { name: goal.name });
  const action = !valid
    ? t(kind === 'add' ? 'grow.goals.move.addActionBlank' : 'grow.goals.move.takeActionBlank')
    : t(kind === 'add' ? 'grow.goals.move.addAction' : 'grow.goals.move.takeAction', { amount: money(amount) });
  const note = lockedTake && valid
    ? t('grow.goals.move.noteLockedTake', { amount: money(Math.max(0, saved - amount)) })
    : t('grow.goals.move.note');

  const commit = () => {
    if (!ready || other === null || amount === null) return;
    const result = move({
      householdId: goal.household_id,
      ownerId: userId as string,
      homeCurrency: ctx.home,
      kind,
      goal: { id: goal.id, name: goal.name, currency: goal.currency, target: goal.target, opening_saved: goal.opening_saved },
      goalAccount: goalAccount === null ? null : { id: goalAccount.id, currency: goalAccount.currency },
      account: { id: other.id, currency: other.currency },
      amount,
      categoryId: cats.transferCategoryId,
      lines: linesQ.data ?? [],
      toHome: toHomeOf(ctx),
      localDate: date,
    });
    hapticLight();
    onClose();
    onMoved?.({ kind, stepId: result.stepId, reachedTarget: result.reachedTarget, amount });
  };

  const onPrimary = () => {
    if (!ready || amount === null) return;
    if (lockedTake) setAsking(true);
    else commit();
  };

  return (
    <>
      <Sheet visible onDismiss={onClose} accessibilityLabel={title}>
        <SheetHeader title={title} cancelLabel={t('grow.common.cancel')} onCancel={onClose} />
        <SheetScroll>
          <View style={styles.body}>
            <MoneyInput
              value={amount}
              currency={goal.currency}
              onChange={setAmount}
              label={t('grow.goals.move.amountLabel')}
              accessibilityLabel={t('grow.goals.move.amountLabel')}
              large
              boxed
              zeroHint
            />
            <Row
              label={t(kind === 'add' ? 'grow.goals.move.from' : 'grow.goals.move.to')}
              value={other === null ? t('grow.goals.move.pickAccount') : other.name}
              dense
              chevron
              onPress={() => setPickerOpen(true)}
            />
            <View style={styles.chips}>
              <Chip label={t('grow.goals.move.today')} selected={date === today} onPress={() => setDate(today)} />
            </View>
            <DateField label={t('grow.goals.move.pickDate')} value={date} display={fmt.formatDate(date)} onChange={setDate} />
            <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{note}</Text>
            <Pill label={action} variant="primary" disabled={!ready} onPress={onPrimary} accessibilityLabel={action} />
          </View>
        </SheetScroll>
        <AccountPicker
          visible={pickerOpen}
          title={t(kind === 'add' ? 'grow.goals.move.from' : 'grow.goals.move.to')}
          accounts={accounts}
          selectedId={other?.id ?? null}
          excludeId={goal.account_id}
          onSelect={(a) => {
            setPickedId(a.id);
            setPickerOpen(false);
          }}
          onClose={() => setPickerOpen(false)}
        />
        {lockedTake && amount !== null ? (
          <ConfirmSheet
            visible={asking}
            title={t(isNet ? 'grow.goals.withdraw.title_safety' : 'grow.goals.withdraw.title_goal', { amount: money(amount), name: goal.name })}
            body={t(isNet ? 'grow.goals.withdraw.body_safety' : 'grow.goals.withdraw.body_goal', {
              amount: money(amount),
              after: money(Math.max(0, saved - amount)),
            })}
            cancelLabel={t('grow.goals.withdraw.keep')}
            confirmLabel={t('grow.goals.withdraw.confirm', { amount: money(amount) })}
            onCancel={() => setAsking(false)}
            onConfirm={() => {
              setAsking(false);
              commit();
            }}
          />
        ) : null}
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  body: { gap: space.groupGap, paddingBottom: space.groupGap },
  chips: { flexDirection: 'row', gap: space.gapSm },
});
