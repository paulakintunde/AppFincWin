/**
 * 06.1-26 (ARC-24, D-27, N19 / D63 / N19S): "I bought it". It lists what will be written (date, account, amount, the plan summary),
 * says plainly that no payment is made and no money moves (T-06.1-26-01), and writes ONE record on "Record purchase"
 * (useGoAheadV3, one Undo).
 * 06.1-63 (CB-4, CN-8, CB-9): both states sit in DetailScreen ("I bought it", with Back and the safe-area insets). The first account
 * is used until the user picks one, so accounts that arrive after the first render are picked; while they load a loading line shows,
 * not the no-account alert.
 * 06.1-77 (DC-3, OQ-77-2 A): the Date row shows the day that goes in the records (today by default, even when the check was planned
 * for a later day) and opens the date picker. A day after today is held at today. The date and the today it is compared with both
 * come from the shell's record context, so the row is written paid.
 * 08.1-09 (D-09..D-11, UI-SPEC section 5): Record as bought. Under the purchase, every other part the save can write is a tick row
 * (BoughtSaveRows): running costs (a fixed one becomes a bill, a varying one expected spending), the sale money in, the old loan's
 * payoff, bills that stop, and closing the goal. Only "Close the goal" starts ticked; unticked parts are not sent. One save, one Undo.
 */
import React, { useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import * as Crypto from 'expo-crypto';
import type { CheckV2, Evaluation, LocalDate, RunningCostLine, StoppedCost } from '@/engine/decide/v3';
import { useT } from '@/i18n';
import { useUndo } from '@/data/mutations/undo';
import { showToast } from '@/state/undoToast';
import { DetailScreen } from '@/shell/screen/DetailScreen';
import { radii, space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { fontSize, textRole } from '@/theme/typography';
import { hapticTap } from '@/ui/haptics';
import { Pill } from '@/ui/Pill';
import { RadioDot } from '@/ui/RadioDot';
import { Text } from '@/ui/Text';
import { DateField } from '@/features/record/entry/pickers/DateField';
import { lineNamesOf } from '../check/lineNames';
import { BoughtSaveRows, boughtRowsOf, initialTicks, type BoughtCostLine, type BoughtStopRow } from './BoughtSaveRows';

export interface BoughtAccount {
  id: string;
  name: string;
}

/** The ticked parts of the save, restated here so the feature does not import the write path. */
export interface BoughtGoAheadExtras {
  runningCosts: { line: RunningCostLine; name: string }[];
  stops: StoppedCost[];
  sale: { amount: number; name: string } | null;
  payoff: { amount: number; name: string; debtId: string; version: number } | null;
  goalId: string | null;
}

/** The shape useGoAheadV3().goAhead takes, restated here so the feature does not import the write path. */
export interface BoughtGoAheadArgs {
  checkId: string;
  ownerId: string;
  homeCurrency: string;
  check: CheckV2;
  evaluation: Evaluation;
  accountId: string;
  ctx: { householdId: string; currency: string; timeZone: string; today: string; date: string; name: string; mint: () => string };
  extras: BoughtGoAheadExtras;
}

/** The old loan the sale pays off, as the shell read it: the version is the one the payoff will name, amount is what goes to the loan. */
export interface BoughtPayoff {
  id: string;
  version: number;
  name: string;
  amount: number;
}

export interface BoughtScreenProps {
  /** useGoAheadV3's goAhead, injected from the shell (the decide feature may not import the write path). Returns the undo step id. */
  goAhead: (args: BoughtGoAheadArgs) => string;
  checkId: string;
  ownerId: string;
  householdId: string;
  homeCurrency: string;
  /** The currency of the account the purchase is recorded in. */
  currency: string;
  timeZone: string;
  /** The household's today (the record context's, in its time zone): the default bought date and the paid/pending line. */
  today: LocalDate;
  itemName: string;
  v3: CheckV2;
  evaluation: Evaluation;
  /** Everyday accounts only. */
  accounts: readonly BoughtAccount[];
  /** True while the accounts are still loading: a loading line shows instead of the no-account alert. */
  accountsLoading?: boolean;
  /** Bills the purchase stops that are recorded and will really end (the shell checks them against the recorded bills). */
  stopRows?: readonly BoughtStopRow[];
  /** The old loan the sale pays off, when one is recorded and still owed. */
  payoff?: BoughtPayoff | null;
  /** The goal this check made and has not closed (the only goal the server lets this save close), or null. */
  goal?: { id: string; name: string } | null;
  formatMoney: (minor: number) => string;
  formatDate: (date: LocalDate) => string;
  onDone: () => void;
}

/** "Loss of value" is not cash, so it is never offered as a bill. */
const NOT_CASH = 'rc:value_loss';
const STEPPER_LABEL: Readonly<Record<string, 'insurance' | 'fuel' | 'maintenance' | 'registration'>> = {
  insurance: 'insurance',
  fuel: 'fuel',
  maintenance: 'maintenance',
  registration: 'registration',
};

export function BoughtScreen(props: BoughtScreenProps) {
  const { goAhead, checkId, ownerId, householdId, homeCurrency, currency, timeZone, today, itemName, v3, evaluation, accounts, accountsLoading = false, stopRows = [], payoff = null, goal = null, formatMoney, formatDate, onDone } = props;
  const t = useT();
  const { colors, pairing } = useTheme();
  const undoer = useUndo();
  const [picked, setAccountId] = useState<string | null>(null);
  // CB-9: the user's pick while it is still listed, else the first account (so a late load still selects one).
  const accountId = picked !== null && accounts.some((a) => a.id === picked) ? picked : (accounts[0]?.id ?? null);
  const [added, setAdded] = useState<{ stepId: string } | null>(null);
  const [undone, setUndone] = useState(false);
  const busy = useRef(false);

  const label = { ...textRole(pairing, 'label'), color: colors.inkDim };
  const small = { ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted };
  const body = { ...textRole(pairing, 'body'), color: colors.ink };
  const head = { ...textRole(pairing, 'heading'), color: colors.ink };
  const purchase = evaluation.purchase;
  const [pickedDate, setDate] = useState<LocalDate>(today);
  const date: LocalDate = pickedDate > today ? today : pickedDate;

  const sale = v3.replaces?.sale ?? null;
  const costs = useMemo((): BoughtCostLine[] => {
    const names = lineNamesOf(v3);
    return (v3.runningCosts ?? [])
      .filter((l) => l.on && Number.isSafeInteger(l.amount) && l.amount > 0 && l.id !== NOT_CASH)
      .map((line) => {
        const key = line.id.startsWith('rc:') ? line.id.slice(3) : null;
        const known = key === null ? undefined : STEPPER_LABEL[key];
        return { line, name: known !== undefined ? t(`decide.screens.stepper.running.${known}`) : (names[line.id] ?? t('decide.screens.answerActions.bought.rowFallback')) };
      });
  }, [v3, t]);
  const stopsOf = v3.replaces?.stops ?? [];
  const groups = useMemo(
    () =>
      boughtRowsOf(t, {
        costs,
        stops: stopRows,
        sale: sale !== null && sale.amount > 0 ? { amount: sale.amount } : null,
        payoff: sale !== null && payoff !== null ? { name: payoff.name, amount: payoff.amount } : null,
        goal,
        formatMoney,
        formatDate,
      }),
    [t, costs, stopRows, sale, payoff, goal, formatMoney, formatDate]
  );
  const [ticks, setTicks] = useState<Record<string, boolean>>({});
  // A row the user has not touched has its own default (only the goal close starts ticked); a row the user set keeps its tick.
  const ticksNow = useMemo(() => ({ ...initialTicks(groups), ...ticks }), [groups, ticks]);
  const on = (key: string): boolean => ticksNow[key] === true;

  const add = (): void => {
    if (busy.current || accountId === null || purchase === null) return;
    busy.current = true;
    hapticTap();
    const extras: BoughtGoAheadExtras = {
      runningCosts: costs.filter((c) => on(`cost:${c.line.id}`)).map((c) => ({ line: c.line, name: c.name })),
      stops: stopsOf.filter((s) => on(`stop:${s.id}`)),
      sale: on('sale') && sale !== null ? { amount: sale.amount, name: payoff?.name ?? t('decide.screens.answerActions.bought.oldOne') } : null,
      payoff: on('payoff') && sale !== null && payoff !== null ? { amount: payoff.amount, name: payoff.name, debtId: payoff.id, version: payoff.version } : null,
      goalId: on('goal') && goal !== null ? goal.id : null,
    };
    const stepId = goAhead({
      checkId,
      ownerId,
      homeCurrency,
      check: v3,
      evaluation,
      accountId,
      ctx: { householdId, currency, timeZone, today, date, name: itemName, mint: () => Crypto.randomUUID() },
      extras,
    });
    setAdded({ stepId });
    showToast({ kind: 'ordinary', text: { key: 'decide.screens.answerActions.bought.toast', params: { item: itemName } }, stepId });
  };

  const frameTitle = t('decide.screens.answerActions.bar.bought');

  if (added !== null) {
    return (
      <DetailScreen title={frameTitle}>
        <View testID="bought-added" style={styles.content}>
          <Text accessibilityRole="header" style={head}>
            {t('decide.screens.answerActions.added.title')}
          </Text>
          <Text style={body}>{undone ? t('decide.screens.answerActions.added.undone') : t('decide.screens.answerActions.added.body', { item: itemName, date: formatDate(date) })}</Text>
          {undone ? (
            <Pill variant="secondary" label={t('decide.screens.common.backToDecide')} onPress={onDone} />
          ) : (
            <>
              <Pill
                variant="secondary"
                label={t('decide.screens.common.undo')}
                onPress={() => {
                  undoer.undo({ stepId: added.stepId, ownerId, householdId, labelKey: 'decisionWritten', labelParams: { name: itemName } });
                  setUndone(true);
                }}
              />
              <Pill variant="primary" label={t('decide.screens.common.backToDecide')} onPress={onDone} />
            </>
          )}
        </View>
      </DetailScreen>
    );
  }

  const amount = purchase === null ? 0 : v3.pay.mode === 'plan' ? purchase.dayOne : purchase.whole;
  const plan = v3.pay.mode === 'plan' && purchase !== null ? purchase.schedule : null;
  return (
    <DetailScreen title={frameTitle}>
      <View testID="bought" style={styles.content}>
        <Text accessibilityRole="header" style={head}>
          {t('decide.screens.answerActions.bought.title')}
        </Text>
        <Text testID="no-money-moves" style={label}>
          {t('decide.screens.answerActions.bought.sub')}
        </Text>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <DateField
            label={t('decide.screens.answerActions.bought.dateRow')}
            value={date}
            display={t('decide.screens.answerActions.bought.boughtOn', { date: formatDate(date) })}
            onChange={setDate}
          />
          <Text style={small}>{t('decide.screens.answerActions.bought.amountRow')}</Text>
          <Text style={body}>{formatMoney(amount)}</Text>
          {plan === null ? null : (
            <>
              <Text style={small}>{t('decide.screens.answerActions.bought.planRow')}</Text>
              <Text style={body}>{t('decide.screens.answerActions.bought.planSummary', { up: formatMoney(purchase?.dayOne ?? 0), count: plan.count })}</Text>
            </>
          )}
          <Text style={small}>{t('decide.screens.answerActions.bought.account')}</Text>
          {accounts.length === 0 && accountsLoading ? (
            <Text testID="bought-accounts-loading" accessibilityLiveRegion="polite" style={body}>
              {t('decide.screens.answerActions.bought.loadingAccounts')}
            </Text>
          ) : accounts.length === 0 ? (
            <Text accessibilityRole="alert" style={body}>
              {t('decide.screens.answerActions.bought.noAccount')}
            </Text>
          ) : (
            <View accessibilityRole="radiogroup" accessibilityLabel={t('decide.screens.answerActions.bought.account')}>
              {accounts.map((a) => (
                <Pressable key={a.id} accessibilityRole="radio" accessibilityLabel={a.name} accessibilityState={{ selected: accountId === a.id }} onPress={() => setAccountId(a.id)} style={styles.radio}>
                  <RadioDot selected={accountId === a.id} />
                  <Text numberOfLines={2} ellipsizeMode="tail" style={[body, styles.grow]}>
                    {a.name}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>
        <BoughtSaveRows
          groups={groups}
          ticks={ticksNow}
          onToggle={(key, next) => {
            hapticTap();
            setTicks({ ...ticks, [key]: next });
          }}
        />
        <Text style={small}>{t('decide.screens.answerActions.bought.lookBack')}</Text>
        <Pill variant="primary" label={t('decide.screens.answerActions.bought.save')} disabled={accountId === null || purchase === null} onPress={add} />
      </View>
    </DetailScreen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: space.groupGap, gap: space.groupGap },
  card: { borderRadius: radii.card, padding: space.cardPad, gap: space.gapSm },
  radio: { minHeight: space.touchMin, flexDirection: 'row', alignItems: 'center', gap: space.gapMd },
  grow: { flex: 1 },
});
