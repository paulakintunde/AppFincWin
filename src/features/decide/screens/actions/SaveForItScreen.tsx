/**
 * 06.1-26 (D-22, D-27, N18 / N18S): Save for it. A goal card (the whole price, or only the up-front part of a plan), the monthly
 * amount and the ready month from the engine (saveForItReadyDate through useCheckEngine().readyDate). "Make the goal" makes ONE
 * locked Grow goal linked to the check and moves the check to waiting, with one Undo for both (useSaveForIt, the server step).
 * Nothing here moves money.
 */
import React, { useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import type { CheckV2, Evaluation, LocalDate } from '@/engine/decide/v3';
import { useT } from '@/i18n';
import { saveForItTarget, useSaveForIt } from '@/data/mutations/decideOutcome';
import { useUndo } from '@/data/mutations/undo';
import type { DecideCheckRow } from '@/db/decideChecks';
import { showToast } from '@/state/undoToast';
import { radii, space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { textRole } from '@/theme/typography';
import { hapticLight } from '@/ui/haptics';
import { Pill } from '@/ui/Pill';
import { Text } from '@/ui/Text';
import { addMonthsTo, daysBetweenDays } from '../sheets/dateMath';
import { SaveAmountSheet, type SaveAmountOption } from './SaveAmountSheet';

type CheckRef = Pick<DecideCheckRow, 'id' | 'created_by' | 'household_id' | 'name' | 'inputs'> & { version?: number };

export interface SaveForItScreenProps {
  check: CheckRef;
  v3: CheckV2;
  evaluation: Evaluation;
  /** From useCheckEngine: the day it is ready when saving for it, given what is already saved. */
  readyDate: (saved: number) => LocalDate | null;
  currency: string;
  today: LocalDate;
  /** What the user calls the purchase. */
  itemName: string;
  formatMoney: (minor: number) => string;
  formatDate: (date: LocalDate) => string;
  onSeeInGrow: (goalId: string) => void;
  onBackToDecide: () => void;
}

/** The monthly amount that saves the target by the ready date: at least one month, never zero. */
export function defaultMonthly(target: number, today: LocalDate, ready: LocalDate | null): number {
  const months = ready === null ? 12 : Math.max(1, Math.ceil(daysBetweenDays(today, ready) / 30));
  return Math.max(1, Math.ceil(target / months));
}

export function SaveForItScreen({ check, v3, evaluation, readyDate, currency, today, itemName, formatMoney, formatDate, onSeeInGrow, onBackToDecide }: SaveForItScreenProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const saver = useSaveForIt();
  const undoer = useUndo();
  const target = saveForItTarget(v3, evaluation);
  const ready = useMemo(() => readyDate(0), [readyDate]);
  const initial = target === null ? 0 : defaultMonthly(target, today, ready);
  const [monthly, setMonthly] = useState<number | null>(null);
  const [sheet, setSheet] = useState(false);
  const [made, setMade] = useState<{ goalId: string | null; stepId: string } | null>(null);
  const [undone, setUndone] = useState(false);
  const busy = useRef(false);
  const amount = monthly ?? initial;

  const label = { ...textRole(pairing, 'label'), color: colors.inkDim };
  const body = { ...textRole(pairing, 'body'), color: colors.ink };
  const head = { ...textRole(pairing, 'heading'), color: colors.ink };

  if (target === null) {
    return (
      <View testID="save-for-it" style={[styles.frame, { backgroundColor: colors.canvas }]}>
        <View style={styles.content}>
          <Text style={body}>{t('decide.screens.answerActions.goal.noReadyDate')}</Text>
          <Pill variant="secondary" label={t('decide.screens.common.backToAnswer')} onPress={onBackToDecide} />
        </View>
      </View>
    );
  }

  const readyOf = (months: number): string => formatDate(addMonthsTo(today, months));
  const reachedBy = (m: number): string => readyOf(Math.max(1, Math.ceil(target / m)));
  const alt = [Math.ceil(initial / 2), initial, Math.ceil(initial * 1.5), initial * 2];
  const options: SaveAmountOption[] = [...new Set(alt)]
    .filter((m) => m > 0)
    .map((m) => ({ monthly: m, readyText: m === initial && ready !== null ? formatDate(ready) : reachedBy(m) }));
  if (!options.some((o) => o.monthly === amount)) options.push({ monthly: amount, readyText: reachedBy(amount) });
  options.sort((a, b) => a.monthly - b.monthly);

  const readyText = amount === initial ? (ready === null ? null : formatDate(ready)) : reachedBy(amount);

  const make = async (): Promise<void> => {
    if (busy.current) return;
    busy.current = true;
    hapticLight();
    try {
      const r = await saver.save({ check, v3, evaluation, monthly: amount, currency, today });
      setMade({ goalId: r.goalId, stepId: r.stepId });
      showToast({ kind: 'ordinary', text: { key: 'decide.screens.answerActions.goalMade.toast', params: { item: itemName } }, stepId: r.stepId });
    } finally {
      busy.current = false;
    }
  };

  if (made !== null) {
    return (
      <View testID="goal-made" style={[styles.frame, { backgroundColor: colors.canvas }]}>
        <View style={styles.content}>
          <Text accessibilityRole="header" style={head}>
            {t('decide.screens.answerActions.goalMade.title')}
          </Text>
          <Text style={body}>{undone ? t('decide.screens.answerActions.added.undone') : t('decide.screens.answerActions.goalMade.body', { item: itemName })}</Text>
          {undone ? null : (
            <>
              {made.goalId === null ? null : <Pill variant="primary" label={t('decide.screens.answerActions.goalMade.seeInGrow')} onPress={() => onSeeInGrow(made.goalId as string)} />}
              <Pill
                variant="secondary"
                label={t('decide.screens.common.undo')}
                onPress={() => {
                  undoer.undo({ stepId: made.stepId, ownerId: check.created_by, householdId: check.household_id, labelKey: 'planSaved', labelParams: { name: itemName } });
                  setUndone(true);
                }}
              />
            </>
          )}
          <Pill variant="secondary" label={t('decide.screens.common.backToDecide')} onPress={onBackToDecide} />
        </View>
      </View>
    );
  }

  return (
    <View testID="save-for-it" style={[styles.frame, { backgroundColor: colors.canvas }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Text accessibilityRole="header" style={head}>
            {t('decide.screens.answerActions.goal.title', { item: itemName })}
          </Text>
          <Text style={label}>{t('decide.screens.answerActions.goal.sub')}</Text>
          <Text style={body}>{t('decide.screens.answerActions.goal.toGo', { amount: formatMoney(target) })}</Text>
          <Text style={body}>{t('decide.screens.answerActions.goal.monthly', { monthly: formatMoney(amount) })}</Text>
          <Text style={body}>{readyText === null ? t('decide.screens.answerActions.goal.noReadyDate') : t('decide.screens.answerActions.goal.readyBy', { readyMonth: readyText })}</Text>
          {v3.pay.mode === 'plan' ? <Text style={label}>{t('decide.screens.answerActions.goal.upFrontOnly')}</Text> : null}
        </View>
        <Pill variant="primary" label={t('decide.screens.answerActions.goal.make')} onPress={() => void make()} />
        <Pill variant="secondary" label={t('decide.screens.answerActions.goal.changeAmount')} onPress={() => setSheet(true)} />
      </ScrollView>
      <SaveAmountSheet
        visible={sheet}
        options={options}
        current={amount}
        formatMoney={formatMoney}
        onUse={(m) => {
          setMonthly(m);
          setSheet(false);
        }}
        onDismiss={() => setSheet(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { flex: 1 },
  content: { padding: space.screenH, gap: space.groupGap },
  card: { borderRadius: radii.card, padding: space.cardPad, gap: space.gapSm },
});
