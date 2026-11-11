/**
 * 06.1-26 (ARC-24, D-27, N19 / D63 / N19S): "I bought it". It lists what will be written (date, account, amount, the plan summary),
 * says plainly that no payment is made and no money moves (T-06.1-26-01), and writes ONE record on "Add to records"
 * (useGoAheadV3, one Undo). Running costs are then offered one by one (RunningCostOffers), each by its own tap.
 */
import React, { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import * as Crypto from 'expo-crypto';
import type { CheckV2, Evaluation, LocalDate } from '@/engine/decide/v3';
import { useT } from '@/i18n';
import { useUndo } from '@/data/mutations/undo';
import { showToast } from '@/state/undoToast';
import { radii, space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { fontSize, textRole } from '@/theme/typography';
import { hapticLight } from '@/ui/haptics';
import { Pill } from '@/ui/Pill';
import { RadioDot } from '@/ui/RadioDot';
import { Text } from '@/ui/Text';
import { RunningCostOffers, type AddRunningCostBill } from './RunningCostOffers';

export interface BoughtAccount {
  id: string;
  name: string;
}

/** The shape useGoAheadV3().goAhead takes, restated here so the feature does not import the write path. */
export interface BoughtGoAheadArgs {
  checkId: string;
  ownerId: string;
  homeCurrency: string;
  check: CheckV2;
  evaluation: Evaluation;
  accountId: string;
  ctx: { householdId: string; currency: string; timeZone: string; today: string; name: string; mint: () => string };
}

export interface BoughtScreenProps {
  /** useGoAheadV3's goAhead, injected from the shell (the decide feature may not import the write path). Returns the undo step id. */
  goAhead: (args: BoughtGoAheadArgs) => string;
  /** The running-cost bill writer, injected from the shell. */
  addBill: AddRunningCostBill;
  checkId: string;
  ownerId: string;
  householdId: string;
  homeCurrency: string;
  /** The currency of the account the purchase is recorded in. */
  currency: string;
  timeZone: string;
  today: LocalDate;
  itemName: string;
  v3: CheckV2;
  evaluation: Evaluation;
  /** Everyday accounts only. */
  accounts: readonly BoughtAccount[];
  formatMoney: (minor: number) => string;
  formatDate: (date: LocalDate) => string;
  onDone: () => void;
}

export function BoughtScreen(props: BoughtScreenProps) {
  const { goAhead, addBill, checkId, ownerId, householdId, homeCurrency, currency, timeZone, today, itemName, v3, evaluation, accounts, formatMoney, formatDate, onDone } = props;
  const t = useT();
  const { colors, pairing } = useTheme();
  const undoer = useUndo();
  const [accountId, setAccountId] = useState<string | null>(accounts[0]?.id ?? null);
  const [added, setAdded] = useState<{ stepId: string; accountId: string } | null>(null);
  const [undone, setUndone] = useState(false);
  const busy = useRef(false);

  const label = { ...textRole(pairing, 'label'), color: colors.inkDim };
  const small = { ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted };
  const body = { ...textRole(pairing, 'body'), color: colors.ink };
  const head = { ...textRole(pairing, 'heading'), color: colors.ink };
  const purchase = evaluation.purchase;
  const date = evaluation.result.purchaseDate ?? today;

  const add = (): void => {
    if (busy.current || accountId === null || purchase === null) return;
    busy.current = true;
    hapticLight();
    const stepId = goAhead({
      checkId,
      ownerId,
      homeCurrency,
      check: v3,
      evaluation,
      accountId,
      ctx: { householdId, currency, timeZone, today, name: itemName, mint: () => Crypto.randomUUID() },
    });
    setAdded({ stepId, accountId });
    showToast({ kind: 'ordinary', text: { key: 'decide.screens.answerActions.added.toast', params: { item: itemName } }, stepId });
  };

  if (added !== null) {
    return (
      <View testID="bought-added" style={[styles.frame, { backgroundColor: colors.canvas }]}>
        <ScrollView contentContainerStyle={styles.content}>
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
              <RunningCostOffers
                addBill={addBill}
                lines={v3.runningCosts ?? []}
                itemName={itemName}
                categoryId={v3.categoryId}
                ownerId={ownerId}
                householdId={householdId}
                accountId={added.accountId}
                currency={currency}
                timeZone={timeZone}
                formatMoney={formatMoney}
                onDone={onDone}
              />
              <Pill variant="primary" label={t('decide.screens.common.backToDecide')} onPress={onDone} />
            </>
          )}
        </ScrollView>
      </View>
    );
  }

  const amount = purchase === null ? 0 : v3.pay.mode === 'plan' ? purchase.dayOne : purchase.whole;
  const plan = v3.pay.mode === 'plan' && purchase !== null ? purchase.schedule : null;
  return (
    <View testID="bought" style={[styles.frame, { backgroundColor: colors.canvas }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text accessibilityRole="header" style={head}>
          {t('decide.screens.answerActions.bought.title')}
        </Text>
        <Text testID="no-money-moves" style={label}>
          {t('decide.screens.answerActions.bought.sub')}
        </Text>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Text style={small}>{t('decide.screens.answerActions.bought.dateRow')}</Text>
          <Text style={body}>{formatDate(date)}</Text>
          <Text style={small}>{t('decide.screens.answerActions.bought.amountRow')}</Text>
          <Text style={body}>{formatMoney(amount)}</Text>
          {plan === null ? null : (
            <>
              <Text style={small}>{t('decide.screens.answerActions.bought.planRow')}</Text>
              <Text style={body}>{t('decide.screens.answerActions.bought.planSummary', { up: formatMoney(purchase?.dayOne ?? 0), count: plan.count })}</Text>
            </>
          )}
          <Text style={small}>{t('decide.screens.answerActions.bought.account')}</Text>
          {accounts.length === 0 ? (
            <Text accessibilityRole="alert" style={body}>
              {t('decide.screens.answerActions.bought.noAccount')}
            </Text>
          ) : (
            <View accessibilityRole="radiogroup" accessibilityLabel={t('decide.screens.answerActions.bought.account')}>
              {accounts.map((a) => (
                <Pressable key={a.id} accessibilityRole="radio" accessibilityLabel={a.name} accessibilityState={{ selected: accountId === a.id }} onPress={() => setAccountId(a.id)} style={styles.radio}>
                  <RadioDot selected={accountId === a.id} />
                  <Text ellipsizeMode="tail" style={[body, styles.grow]}>
                    {a.name}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>
        <Text style={small}>{t('decide.screens.answerActions.bought.lookBack')}</Text>
        <Pill variant="primary" label={t('decide.screens.answerActions.bought.add')} disabled={accountId === null || purchase === null} onPress={add} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { flex: 1 },
  content: { padding: space.screenH, gap: space.groupGap },
  card: { borderRadius: radii.card, padding: space.cardPad, gap: space.gapSm },
  radio: { minHeight: space.touchMin, flexDirection: 'row', alignItems: 'center', gap: space.gapMd },
  grow: { flex: 1 },
});
