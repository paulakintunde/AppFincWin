// 06.1-25 (D35, D-14, ENG-26 Grow half): setup item 4, Safety net. The net is Grow's flagged goal; its size is set in Grow and its
// account is saved on that goal through Grow's goal writer (injected, see SetupItemRoutes). This screen never locks or unlocks the net
// (T-06.1-25-01): the lock row only shows the word and links to the safety-net settings screen (/decide/safety-net, D51).
//
//  - With a net: what is in it, its size from Grow, "Which account holds it?", the lock row, the size line.
//  - Without one: "Set an amount" or "Not set yet", written through the first-answer net write (useSafetyNetAnswer, plan 12), which
//    the route binds and hands in as `answer`; "Not set yet" stamps the D-23 flag and keeps the item ticked.
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useT } from '@/i18n';
import type { SavingsGoalRow } from '@/db/savingsGoals';
import { useAccounts } from '@/data/queries/accounts';
import { useDecideV3 } from '@/data/queries/decideV3';
import { useSavingsGoalRows } from '@/data/queries/growGoals';
import { essentialMonthOf } from '@/features/grow/safetyNet/netPreview';
import { useGoalsRead } from '@/features/grow/goals/useGoalsRead';
import { goalPercent } from '@/features/grow/home/GoalRow';
import { holdsMoney } from '@/features/record/accounts/accountUseSuggest';
import { useRecordContext } from '@/features/record/useRecordContext';
import { showToast } from '@/state/undoToast';
import { PRESSED_OPACITY, space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { fontSize, textRole } from '@/theme/typography';
import { MoneyInput } from '@/ui/MoneyInput';
import { ProgressBar } from '@/ui/ProgressBar';
import { Text } from '@/ui/Text';
import type { NetAnswerPort } from '../../safetyNet/ports';
import { RadioRow, useSetupFormat } from './itemFields';
import { SETUP_HOME, SetupItemFrame } from './SetupItemFrame';

/** Saves the account that holds the net on its Grow goal and returns the undo step id. Bound in SetupItemRoutes (useEditGoal). */
export type SetNetAccount = (goal: SavingsGoalRow, accountId: string, ownerId: string) => string;

const SAFETY_NET_SETTINGS = '/decide/safety-net' as Href;
const GROW_NET = '/grow/safety-net' as Href;

export function NetSetup({ answer, setAccount }: { answer: NetAnswerPort; setAccount: SetNetAccount }) {
  const t = useT();
  const router = useRouter();
  const { colors, pairing } = useTheme();
  const fmt = useSetupFormat();
  const rc = useRecordContext();
  const userId = rc.userId ?? undefined;
  const householdId = rc.householdId ?? undefined;
  const currency = rc.homeCurrency;
  const read = useGoalsRead();
  const goalsQ = useSavingsGoalRows(userId, householdId);
  const accountsQ = useAccounts(householdId);
  const v3 = useDecideV3();

  const net = goalsQ.data?.find((g) => g.is_safety_net === true && g.deleted_at === null) ?? null;
  const point = read.model.safetyNet;
  const size = point !== null && point.size !== null && point.size > 0 ? Number(point.size) : null;
  const saved = point === null ? 0 : Number(point.saved);
  const locked = net?.decide_may_use !== true;
  const holders = useMemo(() => (accountsQ.data ?? []).filter((a) => a.deleted_at === null && a.archived_at === null && holdsMoney(a.kind)), [accountsQ.data]);

  const [picked, setPicked] = useState<string | null>(null);
  const [amount, setAmount] = useState<number | null>(null);
  const [notSet, setNotSet] = useState(false);
  const [otherCurrency, setOtherCurrency] = useState(false);
  const accountId = picked ?? net?.account_id ?? null;
  const canWrite = userId !== undefined && householdId !== undefined;
  const label = { ...textRole(pairing, 'label'), fontSize: fontSize.meta };

  let starter: number | null = null;
  if (v3.source != null) {
    try {
      starter = essentialMonthOf(v3.source, v3.v3 ?? null);
    } catch {
      starter = null;
    }
  }

  const leave = (): void => router.replace(SETUP_HOME);
  const done = (stepId: string | null): void => {
    showToast({ kind: 'ordinary', text: { key: 'decide.screens.setupOthers.net.toast' }, stepId });
    router.replace(SETUP_HOME);
  };

  const save = (): void => {
    if (!canWrite || userId === undefined) return;
    if (net !== null) {
      const changed = picked !== null && picked !== (net.account_id ?? null);
      done(changed ? setAccount(net, picked, userId) : null);
      return;
    }
    if (notSet) {
      const outcome = answer({ kind: 'not_set' });
      done(outcome.status === 'not_set' ? outcome.stepId : null);
      return;
    }
    if (amount === null || amount <= 0) return;
    const outcome = answer({ kind: 'amount', amount, currency, name: t('decide.screens.setupOthers.net.title') });
    if (outcome.status === 'other_currency') setOtherCurrency(true);
    else done('stepId' in outcome ? outcome.stepId : null);
  };

  const ready = canWrite && (net !== null || notSet || (amount !== null && amount > 0));
  const lockWord = locked ? t('decide.screens.safetyNet.settings.locked') : t('decide.screens.safetyNet.settings.unlocked');

  return (
    <SetupItemFrame
      title={t('decide.screens.setupOthers.net.title')}
      why={t('decide.screens.setupOthers.net.why')}
      primaryLabel={t('decide.screens.setupOthers.net.save')}
      primaryDisabled={!ready}
      onPrimary={save}
      onBack={leave}
      onSaveAndClose={leave}
    >
      {net !== null ? (
        <>
          <View style={styles.block}>
            <Text testID="net-in-now" style={{ ...textRole(pairing, 'bodyStrong'), color: colors.ink }}>
              {t('decide.screens.setupOthers.net.inNow', { amount: fmt.money(saved, currency) })}
              {size !== null ? ` · ${t('decide.screens.setupOthers.net.goal', { size: fmt.money(size, currency) })}` : ''}
            </Text>
            {size !== null ? <ProgressBar percent={goalPercent(saved, size)} variant="thick" tone="blue" accessibilityLabel={`${goalPercent(saved, size)}%`} /> : null}
          </View>
          <View style={styles.block}>
            <Text style={{ ...textRole(pairing, 'bodyStrong'), color: colors.ink }}>{t('decide.screens.setupOthers.net.whichAccount')}</Text>
            {holders.length === 0 ? <Text style={{ ...label, color: colors.warn1 }}>{t('decide.screens.setupOthers.net.noAccounts')}</Text> : null}
            <View accessibilityRole="radiogroup" accessibilityLabel={t('decide.screens.setupOthers.net.whichAccount')}>
              {holders.map((a) => (
                <RadioRow key={a.id} label={a.name} selected={accountId === a.id} onPress={() => setPicked(a.id)} />
              ))}
            </View>
          </View>
          <View testID="net-lock-row" style={styles.block}>
            <Text style={{ ...textRole(pairing, 'bodyStrong'), color: colors.ink }}>
              {t('decide.screens.setupOthers.net.lockedSwitch')}: {lockWord}
            </Text>
            <Text style={{ ...label, color: colors.inkMuted }}>{t('decide.screens.setupOthers.net.lockedSub')}</Text>
            <Pressable
              testID="net-settings-link"
              accessibilityRole="link"
              accessibilityLabel={t('decide.screens.setupOthers.net.changeInSettings')}
              onPress={() => router.push(SAFETY_NET_SETTINGS)}
              style={({ pressed }) => [styles.link, { opacity: pressed ? PRESSED_OPACITY : 1 }]}
            >
              <Text style={{ ...textRole(pairing, 'label'), color: colors.ink, textDecorationLine: 'underline' }}>{t('decide.screens.setupOthers.net.changeInSettings')}</Text>
            </Pressable>
          </View>
          {starter !== null && starter > 0 ? (
            <Text style={{ ...label, color: colors.inkMuted }}>{t('decide.screens.setupOthers.net.starter', { size: fmt.money(starter, currency) })}</Text>
          ) : null}
          <Pressable accessibilityRole="link" accessibilityLabel={t('decide.screens.setupOthers.net.changeSize')} onPress={() => router.push(GROW_NET)} style={styles.link}>
            <Text style={{ ...textRole(pairing, 'label'), color: colors.ink, textDecorationLine: 'underline' }}>{t('decide.screens.setupOthers.net.changeSize')}</Text>
          </Pressable>
        </>
      ) : (
        <>
          {starter !== null && starter > 0 ? (
            <Text style={{ ...label, color: colors.inkMuted }}>{t('decide.screens.setupOthers.net.starter', { size: fmt.money(starter, currency) })}</Text>
          ) : null}
          <MoneyInput
            value={amount}
            currency={currency}
            onChange={(minor) => {
              setAmount(minor);
              if (minor !== null) setNotSet(false);
            }}
            label={t('decide.screens.setupOthers.net.setAmount')}
            accessibilityLabel={t('decide.screens.setupOthers.net.setAmount')}
          />
          <View accessibilityRole="radiogroup">
            <RadioRow label={t('decide.screens.setupOthers.net.notSet')} selected={notSet} onPress={() => setNotSet(!notSet)} />
          </View>
          <Text style={{ ...label, color: colors.inkMuted }}>{t('decide.screens.setupOthers.net.notSetNote')}</Text>
          {otherCurrency ? <Text style={{ ...label, color: colors.warn1 }}>{t('decide.screens.setupOthers.net.otherCurrency')}</Text> : null}
        </>
      )}
    </SetupItemFrame>
  );
}

const styles = StyleSheet.create({
  block: { gap: space.gapSm },
  link: { minHeight: space.touchMin, justifyContent: 'center' },
});
