// 06.1-25 (D37, D37b, D-11, UX-23): setup item 6, Records. Three checks, each a row with a word status (not colour alone):
//   Last month complete  /  This month up to date (newest entry within 10 days)  /  every account says what it is for.
// "Done" is active only when all three hold; otherwise the button reads "Save and close" and the row stays open on the checklist.
// The checks come from the same facts the checklist reads (useSetupFacts), so this screen and the checklist can never disagree.
// An account's use is written through the Accounts mutation (one batch, one Undo); nothing is stored here.
// A brand-new person (no records at all) sees "No records yet" with the three ways forward instead of the checks.
// 06.1-45 (G-1, C-4, C-5): below the checks, "What's still open" lists every readiness item the engine names, with the same fix and
// answers as the answer screen (ReadinessFixList), led by an envelope summary row. Records is done only when that list is empty
// (owner GQ2), and "Save and close" with items still open says so. The writes that reach the rate-fetch door (the line skip and
// Grow's goal writer) are bound in the shell and passed in as `writes`, as on the answer screen.
// 06.1-65 (CF-8): while the facts load, "Checking your records…" sits under the disabled primary. (CN-5 a): "From quick estimates"
// passes the answer's returnTo on when Records was opened with one; with no check in view it opens quick estimates in save mode,
// which comes back here. (CC-7): rough figures in use are listed with Clear (one Undo).
// 06.1-68 (FQ7, CC-5, DC-11): "Answers you gave" lists every readiness answer and goal-to-account link, each with Remove (Undo);
// a goal link also has Change (the Which account? sheet). (DS-14): an account-use pick shows at once, before the reads catch up,
// and each choice is announced checked.
// 06.1-60 (G-10, owner decision 4, D37): one line in view, "October not complete · this month up to date"; the reason ("Why we
// ask") is behind the frame's Why?; each check row keeps its title and word badge, and its reason, the months count and the open
// note sit under one More below the card. The accounts stay one row (06.1-58). Screen readers still hear each row's reason.
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useT } from '@/i18n';
import { useSaveAccountUse } from '@/data/mutations/accountUse';
import { useRemoveDecideAnswer, useSaveDecideAnswer } from '@/data/mutations/decideAnswers';
import { useSaveSetupStep } from '@/data/mutations/decideSetup';
import { queryKeys } from '@/data/keys';
import { useAccounts } from '@/data/queries/accounts';
import { useDecideSettings } from '@/data/queries/decide';
import { useDecideAnswers } from '@/data/queries/decideAnswers';
import { DECIDE_READ_STALE_MS } from '@/data/queries/decideStale';
import { useDecideV3 } from '@/data/queries/decideV3';
import { useSavingsGoalRows } from '@/data/queries/growGoals';
import type { SavingsGoalRow } from '@/db/savingsGoals';
import type { AccountRow, TransactionRow } from '@/db/rows';
import type { LocalDate, ReadinessItem, ReadinessWaiver } from '@/engine/decide/v3';
import { AccountUseSheet } from '@/features/record/accounts/AccountUseSheet';
import { useRecordContext } from '@/features/record/useRecordContext';
import { showToast } from '@/state/undoToast';
import { PRESSED_OPACITY, radii, space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { fontSize, textRole } from '@/theme/typography';
import { Pill } from '@/ui/Pill';
import { Sheet, SheetScroll } from '@/ui/Sheet';
import { SheetHeader } from '@/ui/SheetHeader';
import { StateBadge } from '@/ui/StateBadge';
import { Text } from '@/ui/Text';
import { StateGlyph } from '@/ui/glyphs/StateGlyph';
import { hapticLight } from '@/ui/haptics';
import { ReadinessFixList } from '../../answer/ReadinessFixList';
import { monthNameOf } from '../../home/YourMonthCard';
import { readinessFixRows, type ReadinessFixRow, type WaiverChoice } from '../../logic/readinessFixes';
import { EnvelopeAccountSheet, type SetEnvelopeAccount } from '../../sheets/EnvelopeAccountSheet';
import { footerFactsOf } from '../../home/useHomeFacts';
import { MoreRow } from '../../ui/MoreRow';
import { NeedLine } from '../../ui/NeedLine';
import { QUICK_SAVE_MODE } from '../QuickEstimatesScreen';
import { DECIDE_HOME_PATH, safeReturnTo } from '../safeReturnTo';
import { useSetupFacts } from '../useSetupProgress';
import { RadioRow, useSetupFormat } from './itemFields';
import { givenLines, type GivenLine } from './answersGiven';
import { askedAccounts, choiceOfUse, previousMonthOf, recordChecks, accountUseOfChoice, USE_CHOICES, type UseChoice } from './othersLogic';
import { SetupItemFrame, useLeaveItem } from './SetupItemFrame';

const ACTIVITY = '/activity' as Href;
const IMPORT = '/import' as Href;
const QUICK_ESTIMATES = '/decide/setup/quick-estimates';
const NO_ITEMS: readonly ReadinessItem[] = [];
const CHEV = 16;

/** 06.1-45: the writes bound by the shell (features/decide may not import them; they reach the rate-fetch door). */
export interface RecordsWrites {
  /** Grow's goal writer for the envelope fix (D-54). */
  setEnvelopeAccount: SetEnvelopeAccount;
  /** Skips a pending line (useSkipOccurrence); returns the undo step id, or null when nothing was written. */
  skipLine: (row: TransactionRow, ownerId: string) => string | null;
  /** 06.1-68 (DC-11): takes a goal's account link off (Grow's goal writer, account_id null only); returns the undo step id. */
  clearEnvelopeAccount: (goal: SavingsGoalRow, ownerId: string) => string;
}

/** 06.1-68 (DS-14): a pick made here, shown until the stored use moves off the value it had when tapped. */
interface UsePick {
  readonly choice: UseChoice;
  readonly from: UseChoice | null;
}

/** The pending line a "It didn't happen" answer skips, from any cached transactions list of the household; null when not cached. */
function cachedPendingLine(qc: QueryClient, householdId: string, lineId: string): TransactionRow | null {
  for (const [, data] of qc.getQueriesData<unknown>({ queryKey: queryKeys.transactionsRoot(householdId) })) {
    if (!Array.isArray(data)) continue;
    const hit = (data as TransactionRow[]).find((r) => r !== null && typeof r === 'object' && r.id === lineId);
    if (hit !== undefined && hit.deleted_at == null && hit.status === 'pending') return hit;
  }
  return null;
}

/** With the line not cached, the same occurrence is answered by its waiver instead (the engine accepts it when no line can be skipped). */
function fallbackWaiver(item: ReadinessItem): ReadinessWaiver | null {
  if (item.seriesId === null || item.date === null) return null;
  if (item.kind === 'bill') return { kind: 'didnt_happen', seriesId: item.seriesId, date: item.date };
  if (item.kind === 'pay') return { kind: 'no_pay', seriesId: item.seriesId, date: item.date };
  return null;
}

/** 06.1-58 (A-SU-5): a check's title over its reason, with the word badge at the right (glyph plus word, never colour alone). */
/** 06.1-60 (G-10): `showWhy` false keeps the reason out of view (it opens under the card's More); a screen reader still hears it. */
function CheckRowBody({ title, why, ok, word, testID, showWhy = true }: { title: string; why: string; ok: boolean; word: string; testID?: string; showWhy?: boolean }) {
  const { colors, pairing } = useTheme();
  return (
    <View testID={testID} accessible={testID !== undefined} accessibilityLabel={`${title}, ${word}. ${why}`} style={styles.checkBody}>
      <View style={styles.checkText}>
        <Text style={{ ...textRole(pairing, 'bodyStrong'), color: colors.ink }}>{title}</Text>
        {showWhy ? <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted }}>{why}</Text> : null}
      </View>
      <StateBadge tone={ok ? 'fits' : 'notYet'} shape={ok ? 'sCheck' : 'sClock'} label={word} testID={testID === undefined ? 'check-badge' : `${testID}-badge`} />
    </View>
  );
}

export function RecordsSetup({ writes }: { writes: RecordsWrites }) {
  const t = useT();
  const router = useRouter();
  const leave = useLeaveItem();
  const { colors, pairing } = useTheme();
  const fmt = useSetupFormat();
  const rc = useRecordContext();
  const { facts, today, currency, retry } = useSetupFacts();
  const params = useLocalSearchParams<{ returnTo?: string }>();
  const settings = useDecideSettings(rc.userId ?? undefined).data ?? null;
  const setupSaver = useSaveSetupStep(rc.userId ?? '');
  const v3 = useDecideV3();
  const accountsQ = useAccounts(rc.householdId ?? undefined);
  const saver = useSaveAccountUse(rc.userId ?? '');
  const [sheetFor, setSheetFor] = useState<AccountRow | null>(null);
  const [accountsOpen, setAccountsOpen] = useState(false);
  const qc = useQueryClient();
  const answers = useSaveDecideAnswer(rc.userId ?? '', rc.householdId ?? '');
  const [envelopeId, setEnvelopeId] = useState<string | null>(null);
  const readinessItems = v3.evaluation?.result.readiness?.items ?? NO_ITEMS;
  const fixRows = useMemo(() => (today === '' ? [] : readinessFixRows(readinessItems, today as LocalDate)), [readinessItems, today]);
  const envelopesOpen = fixRows.filter((r) => r.item.kind === 'envelopes').length;

  const asked = useMemo(() => (v3.inputs === null ? [] : askedAccounts(v3.inputs.accounts ?? [])), [v3.inputs]);
  // DS-14: a pick is drawn at once. It is dropped once the stored use moves off the value it had at the tap (the write landed, or
  // something else changed it), so a later Undo shows the stored value again. Kept in step during render, no effect.
  const [picks, setPicks] = useState<ReadonlyMap<string, UsePick>>(() => new Map());
  let livePicks: Map<string, UsePick> | null = null;
  for (const [id, p] of picks) {
    const stored = asked.find((a) => a.id === id);
    if (stored !== undefined && choiceOfUse(stored.use) === p.from) continue;
    livePicks ??= new Map(picks);
    livePicks.delete(id);
  }
  if (livePicks !== null) setPicks(livePicks);
  const pickOf = (id: string): UseChoice | undefined => (livePicks ?? picks).get(id)?.choice;

  // FQ7 (CC-5), DC-11: the answers given, from the live answers and the goals linked to an account.
  const answersQ = useDecideAnswers(rc.userId ?? undefined, rc.householdId ?? undefined);
  const goalsQ = useSavingsGoalRows(rc.userId ?? undefined, rc.householdId ?? undefined, { staleTime: DECIDE_READ_STALE_MS });
  const remover = useRemoveDecideAnswer(rc.userId ?? '', rc.householdId ?? '');
  const rowOf = (id: string): AccountRow | undefined => (accountsQ.data ?? []).find((a) => a.id === id);
  const footer = footerFactsOf(v3.inputs);

  const small = { ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted };
  // C-5: "Save and close" with items still open says what is open, then leaves; with none open it leaves silently as before.
  // 06.1-65: every write here is made at once (account use, answers), so nothing is left unsaved; the primary and "Save and close"
  // both say what is still open, then leave.
  const sayStillOpen = (): void => {
    if (fixRows.length > 0) showToast({ kind: 'ordinary', text: { key: 'decide.screens.setupOthers.records.stillOpen', params: { count: fixRows.length } } });
  };
  const saveAndClose = (): void => {
    sayStillOpen();
    leave();
  };

  const saveWaiver = (waiver: ReadinessWaiver): void => {
    const saved = answers.save({ kind: 'readiness_waiver', waiver, at: today as LocalDate });
    if (saved === null) return;
    hapticLight();
    showToast({ kind: 'ordinary', text: { key: 'decide.screens.answer.notReady.saved' }, stepId: saved.stepId });
  };
  const onReadinessChoice = (fixRow: ReadinessFixRow, choice: WaiverChoice): void => {
    if (choice.waiver !== null) {
      saveWaiver(choice.waiver);
      return;
    }
    // markSkipped: skip the pending line itself when it is cached; otherwise answer the occurrence by its waiver.
    const line = choice.lineId === null || rc.householdId === null ? null : cachedPendingLine(qc, rc.householdId, choice.lineId);
    if (line !== null && rc.userId !== null) {
      const stepId = writes.skipLine(line, rc.userId);
      if (stepId === null) return;
      hapticLight();
      showToast({ kind: 'ordinary', text: { key: 'decide.screens.answer.notReady.saved' }, stepId });
      return;
    }
    const fallback = fallbackWaiver(fixRow.item);
    if (fallback !== null) saveWaiver(fallback);
  };
  const onReadinessFix = (fixRow: ReadinessFixRow): void => {
    if (fixRow.fix.kind === 'linkEnvelope') {
      if (fixRow.fix.envelopeId !== null) setEnvelopeId(fixRow.fix.envelopeId);
      return;
    }
    router.push(ACTIVITY);
  };

  // CN-5 (a): from an answer (a safe returnTo), quick estimates go back to it; with no check in view they save and come back here.
  const answerReturn = safeReturnTo(params.returnTo);
  const openQuickEstimates = (): void => {
    router.push(
      (answerReturn !== DECIDE_HOME_PATH
        ? { pathname: QUICK_ESTIMATES, params: { returnTo: answerReturn } }
        : { pathname: QUICK_ESTIMATES, params: { mode: QUICK_SAVE_MODE } }) as Href,
    );
  };

  // CC-7: the rough figures in use, with Clear (one Undo puts them back).
  const roughIn = settings?.rough_income ?? null;
  const roughOut = settings?.rough_spending ?? null;
  const roughCurrency = settings?.currency ?? currency;
  const clearRough = (): void => {
    const saved = setupSaver.save({ stepTitle: t('decide.screens.setup.quick.stepName'), patch: { rough_income: null, rough_spending: null, rough_as_of: null } });
    if (saved === null) return;
    hapticLight();
    showToast({ kind: 'ordinary', text: { key: 'decide.screens.setupOthers.records.roughCleared' }, stepId: saved.stepId });
  };
  const roughRow =
    roughIn === null && roughOut === null ? null : (
      <View testID="records-rough" style={styles.row2}>
        <Text style={{ ...textRole(pairing, 'body'), color: colors.ink, flexShrink: 1 }}>
          {t('decide.screens.setupOthers.records.roughInUse', { income: fmt.money(roughIn ?? 0, roughCurrency), spending: fmt.money(roughOut ?? 0, roughCurrency) })}
        </Text>
        <Pressable
          testID="records-rough-clear"
          accessibilityRole="button"
          accessibilityLabel={`${t('decide.screens.setupOthers.records.roughClear')}, ${t('decide.screens.setup.quick.stepName')}`}
          onPress={clearRough}
          style={({ pressed }) => [styles.link, { opacity: pressed ? PRESSED_OPACITY : 1 }]}
        >
          <Text style={{ ...textRole(pairing, 'label'), color: colors.accent }}>{t('decide.screens.setupOthers.records.roughClear')}</Text>
        </Pressable>
      </View>
    );

  // CF-8: not loaded yet: the frame with the primary off and the reason under it, so nothing flickers between the two variants.
  if (facts === null) {
    return (
      <SetupItemFrame
        title={t('decide.screens.setupOthers.records.title')}
        why={t('decide.screens.setupOthers.records.why')}
        primaryLabel={t('decide.screens.common.saveAndClose')}
        primaryDisabled
        onSave={() => undefined}
        onLeave={leave}
        footer={<NeedLine testID="records-loading" text={t('decide.screens.setupOthers.records.loading')} />}
      >
        <View />
      </SetupItemFrame>
    );
  }

  const checks = recordChecks(facts, today);
  const brandNew = footer.months === 0 && footer.entries === 0 && facts.newestEntryThisMonth === null && !facts.lastMonthComplete;
  const word = (ok: boolean): string => (ok ? t('decide.screens.setupOthers.records.complete') : t('decide.screens.setupOthers.records.notComplete'));
  const monthName = monthNameOf(previousMonthOf(today), fmt.locale);
  const sayCount = asked.filter((a) => a.use !== null).length;

  const chooseUse = (accountId: string, choice: UseChoice): void => {
    const row = rowOf(accountId);
    if (row === undefined) return;
    const use = accountUseOfChoice(choice);
    // "Savings or goals" also says which goal the money is kept for, so the account's own sheet picks it.
    if (use === null) {
      setAccountsOpen(false);
      setSheetFor(row);
      return;
    }
    const result = saver.save({ account: row, use });
    if (result === null) return;
    const from = choiceOfUse(asked.find((a) => a.id === accountId)?.use ?? null);
    if (from !== choice) setPicks((prev) => new Map(prev).set(accountId, { choice, from }));
    showToast({ kind: 'ordinary', text: { key: 'decide.accountUse.toastSaved' }, stepId: result.stepId });
  };

  const seriesNames = new Map((v3.inputs?.series ?? []).map((x) => [x.id, x.name ?? '']));
  const accountNames = new Map((accountsQ.data ?? []).filter((a) => a.deleted_at == null).map((a) => [a.id, a.name]));
  const given = givenLines(
    answersQ.data ?? [],
    goalsQ.data ?? [],
    {
      date: (d) => fmt.date(d),
      monthName: (ym) => monthNameOf(ym, fmt.locale),
      seriesName: (id) => seriesNames.get(id) ?? '',
      accountName: (id) => accountNames.get(id) ?? '',
    },
    t as unknown as (key: string, params?: Record<string, string | number>) => string,
  );
  const removeGiven = (line: GivenLine): void => {
    if (rc.userId === null) return;
    const stepId = line.kind === 'waiver' ? remover.remove(line.row).stepId : writes.clearEnvelopeAccount(line.goal, rc.userId);
    hapticLight();
    showToast({ kind: 'ordinary', text: { key: 'decide.screens.setupOthers.records.answerRemoved' }, stepId });
  };
  const changeLabel = t('decide.screens.common.change');
  const removeLabel = t('decide.screens.setupOthers.records.answerRemove');
  const answersGiven =
    given.length === 0 ? null : (
      <View testID="records-given" style={styles.block}>
        <Text accessibilityRole="header" style={{ ...textRole(pairing, 'bodyStrong'), color: colors.ink }}>{t('decide.screens.setupOthers.records.answersGiven')}</Text>
        {given.map((line) => (
          <View key={`${line.kind}-${line.id}`} testID={`given-${line.id}`} style={styles.row2}>
            <Text style={{ ...textRole(pairing, 'body'), color: colors.ink, flexShrink: 1 }}>{line.text}</Text>
            <View style={styles.givenActions}>
              {line.kind === 'goal' ? (
                <Pressable
                  testID={`given-change-${line.id}`}
                  accessibilityRole="button"
                  accessibilityLabel={`${changeLabel}, ${line.text}`}
                  onPress={() => setEnvelopeId(line.goal.id)}
                  style={({ pressed }) => [styles.link, { opacity: pressed ? PRESSED_OPACITY : 1 }]}
                >
                  <Text style={{ ...textRole(pairing, 'label'), color: colors.accent }}>{changeLabel}</Text>
                </Pressable>
              ) : null}
              <Pressable
                testID={`given-remove-${line.id}`}
                accessibilityRole="button"
                accessibilityLabel={`${removeLabel}, ${line.text}`}
                onPress={() => removeGiven(line)}
                style={({ pressed }) => [styles.link, { opacity: pressed ? PRESSED_OPACITY : 1 }]}
              >
                <Text style={{ ...textRole(pairing, 'label'), color: colors.accent }}>{removeLabel}</Text>
              </Pressable>
            </View>
          </View>
        ))}
      </View>
    );

  const choiceLabel = (c: UseChoice): string => t(`decide.screens.setupOthers.records.accountUse.${c}`);

  if (brandNew) {
    return (
      <SetupItemFrame title={t('decide.screens.setupOthers.records.title')} why={t('decide.screens.setupOthers.records.why')} primaryLabel={t('decide.screens.common.saveAndClose')} onSave={() => undefined} onLeave={leave}>
        <View testID="records-empty" style={styles.block}>
          <Text accessibilityRole="header" style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink }}>{t('decide.screens.setupOthers.records.emptyTitle')}</Text>
          <Text style={{ ...textRole(pairing, 'body'), color: colors.inkDim }}>{t('decide.screens.setupOthers.records.emptyBody')}</Text>
        </View>
        <Pill variant="primary" label={t('decide.screens.setupOthers.records.importStatement')} onPress={() => router.push(IMPORT)} />
        <Pill variant="secondary" label={t('decide.screens.setupOthers.records.addAsYouGo')} onPress={() => router.push(ACTIVITY)} />
        <Pill variant="secondary" label={t('decide.screens.setupOthers.records.fromEstimates')} onPress={openQuickEstimates} />
        {roughRow}
      </SetupItemFrame>
    );
  }

  const upTo = fmt.date(facts.recordsUpTo ?? today);
  // GQ2: done only when the three D-11 checks hold and the engine names nothing still open.
  const allDone = checks.allDone && fixRows.length === 0;
  const openAccounts = asked.filter((a) => a.use === null).length;
  // A-SU-5 (DS-16): every check says why, beside a word badge; an open one carries its fix.
  const lastWhy = checks.lastMonth
    ? t('decide.screens.setupOthers.records.lastMonthDoneWhy', { month: monthName })
    : t('decide.screens.setupOthers.records.lastMonthOpenWhy', { month: monthName });
  const thisWhy = checks.thisMonth
    ? t('decide.screens.setupOthers.records.thisMonthDoneWhy', { date: upTo })
    : facts.newestEntryThisMonth === null
      ? t('decide.screens.setupOthers.records.thisMonthNone')
      : t('decide.screens.setupOthers.records.thisMonthOpenWhy', { date: fmt.date(facts.newestEntryThisMonth) });
  const accountsWhy = checks.accounts
    ? t('decide.screens.setupOthers.records.accountsSay', { count: sayCount })
    : t('decide.screens.setupOthers.records.accountsRow', { count: asked.length, n: openAccounts });
  const accountsWord = checks.accounts ? t('decide.screens.setupOthers.records.complete') : t('decide.screens.setupOthers.records.toFinish');
  const ruleColor = { borderTopColor: colors.line2 };
  return (
    <SetupItemFrame
      title={t('decide.screens.setupOthers.records.title')}
      why={t('decide.screens.setupOthers.records.why')}
      primaryLabel={allDone ? t('decide.screens.common.done') : t('decide.screens.common.saveAndClose')}
      onSave={sayStillOpen}
      onLeave={leave}
      onSaveAndClose={saveAndClose}
    >
      {/* 06.1-60 (G-10, owner decision 4): the one line in view; each check's reason and the months count open under More. */}
      <Text testID="records-summary" style={{ ...textRole(pairing, 'body'), color: colors.ink }}>
        {t('decide.screens.setupOthers.records.keepLine', {
          monthName,
          status: t(checks.lastMonth ? 'decide.screens.setupOthers.records.keepStatus.complete' : 'decide.screens.setupOthers.records.keepStatus.notComplete'),
          state: t(checks.thisMonth ? 'decide.screens.setupOthers.records.keepState.upToDate' : 'decide.screens.setupOthers.records.keepState.notUpToDate'),
        })}
      </Text>
      <View testID="records-checks" style={[styles.group, { backgroundColor: colors.surface, borderColor: colors.line2 }]}>
        <View style={styles.groupRow}>
          <CheckRowBody
            testID="check-last"
            title={t('decide.screens.setupOthers.records.lastMonth', { month: monthName })}
            why={lastWhy}
            ok={checks.lastMonth}
            word={word(checks.lastMonth)}
            showWhy={false}
          />
          {!checks.lastMonth ? (
            <Pressable
              testID="last-fix"
              accessibilityRole="link"
              accessibilityLabel={t('decide.screens.setupOthers.records.lastMonthFix', { month: monthName })}
              onPress={() => router.push(ACTIVITY)}
              style={({ pressed }) => [styles.link, { opacity: pressed ? PRESSED_OPACITY : 1 }]}
            >
              <Text style={{ ...textRole(pairing, 'label'), color: colors.accent }}>{t('decide.screens.setupOthers.records.lastMonthFix', { month: monthName })}</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={[styles.groupRow, styles.ruled, ruleColor]}>
          <CheckRowBody testID="check-this" title={t('decide.screens.setupOthers.records.thisMonth')} why={thisWhy} ok={checks.thisMonth} word={word(checks.thisMonth)} showWhy={false} />
          {!checks.thisMonth ? (
            <Pressable
              testID="add-since"
              accessibilityRole="link"
              accessibilityLabel={t('decide.screens.setupOthers.records.addSince')}
              onPress={() => router.push(ACTIVITY)}
              style={({ pressed }) => [styles.link, { opacity: pressed ? PRESSED_OPACITY : 1 }]}
            >
              <Text style={{ ...textRole(pairing, 'label'), color: colors.accent }}>{t('decide.screens.setupOthers.records.addSince')}</Text>
            </Pressable>
          ) : null}
        </View>

        <Pressable
          testID="check-accounts"
          accessibilityRole="button"
          accessibilityLabel={`${t('decide.screens.setupOthers.records.accounts')}, ${accountsWord}. ${accountsWhy}`}
          onPress={() => setAccountsOpen(true)}
          style={({ pressed }) => [styles.groupRow, styles.ruled, styles.chevRow, ruleColor, { opacity: pressed ? PRESSED_OPACITY : 1 }]}
        >
          <CheckRowBody title={t('decide.screens.setupOthers.records.accounts')} why={accountsWhy} ok={checks.accounts} word={accountsWord} />
          <StateGlyph name="chev" color={colors.inkFaint} size={CHEV} />
        </Pressable>
      </View>
      <MoreRow testID="records-more">
        <Text testID="records-last-why" style={small}>{lastWhy}</Text>
        <Text testID="records-this-why" style={small}>{thisWhy}</Text>
        <Text testID="months-so-far" style={small}>
          {footer.months >= 3 ? t('decide.screens.setupOthers.records.progressDone') : t('decide.screens.setupOthers.records.progress', { count: footer.months })}
        </Text>
        {!allDone ? <Text style={small}>{t('decide.screens.setupOthers.records.openNote')}</Text> : null}
      </MoreRow>

      {!allDone ? (
        <Pill
          variant="secondary"
          label={t('decide.screens.setupOthers.records.checkAgain')}
          onPress={() => {
            hapticLight();
            retry();
          }}
        />
      ) : null}

      {fixRows.length > 0 ? (
        <View testID="records-open" style={styles.block}>
          <Text accessibilityRole="header" style={{ ...textRole(pairing, 'bodyStrong'), color: colors.ink }}>{t('decide.screens.setupOthers.records.openTitle')}</Text>
          {envelopesOpen > 0 ? (
            <Text testID="records-envelopes" style={{ ...textRole(pairing, 'body'), color: colors.warn1 }}>
              {t('decide.screens.setupOthers.records.envelopesRow', { count: envelopesOpen })}
            </Text>
          ) : null}
          <ReadinessFixList
            rows={fixRows}
            asOf={today as LocalDate}
            money={(minor) => fmt.money(minor, currency)}
            date={(d) => fmt.date(d)}
            monthName={(ym) => monthNameOf(ym, fmt.locale)}
            onFix={onReadinessFix}
            onChoice={onReadinessChoice}
          />
        </View>
      ) : null}

      {answersGiven}

      {roughRow}

      <View style={styles.block}>
        <Text style={{ ...textRole(pairing, 'body'), color: colors.ink }}>{t('decide.screens.setupOthers.records.moreMonthsQ')}</Text>
        <Pill variant="secondary" label={t('decide.screens.setupOthers.records.importStatement')} onPress={() => router.push(IMPORT)} />
      </View>

      {accountsOpen ? (
        <Sheet visible onDismiss={() => setAccountsOpen(false)} accessibilityLabel={t('decide.screens.setupOthers.records.accounts')}>
          <SheetHeader title={t('decide.screens.setupOthers.records.accounts')} cancelLabel={t('decide.screens.common.close')} onCancel={() => setAccountsOpen(false)} />
          <SheetScroll contentContainerStyle={styles.sheetBody}>
            {asked.map((a) => {
              const row = rowOf(a.id);
              const current = pickOf(a.id) ?? choiceOfUse(a.use);
              const name = row?.name ?? '';
              return (
                <View key={a.id} testID={`account-${a.id}`} style={styles.block}>
                  <Text style={{ ...textRole(pairing, 'bodyStrong'), color: colors.ink }}>{t('decide.screens.setupOthers.records.accountFor', { name })}</Text>
                  <View accessibilityRole="radiogroup" accessibilityLabel={t('decide.screens.setupOthers.records.accountFor', { name })}>
                    {USE_CHOICES.map((c) => (
                      <RadioRow key={c} label={choiceLabel(c)} selected={current === c} onPress={() => chooseUse(a.id, c)} />
                    ))}
                  </View>
                </View>
              );
            })}
          </SheetScroll>
        </Sheet>
      ) : null}
      {sheetFor === null ? null : <AccountUseSheet visible account={sheetFor} balance={null} onClose={() => setSheetFor(null)} />}
      {envelopeId === null ? null : (
        <EnvelopeAccountSheet goalId={envelopeId} visible onClose={() => setEnvelopeId(null)} setAccount={writes.setEnvelopeAccount} />
      )}
    </SetupItemFrame>
  );
}

const styles = StyleSheet.create({
  block: { gap: space.gapSm },
  row2: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: space.gapMd },
  link: { minHeight: space.touchMin, justifyContent: 'center' },
  // A-SU-5: one grouped card, rows split by a hairline rule (D37).
  group: { borderRadius: radii.card, borderWidth: 1.5, overflow: 'hidden' },
  groupRow: { paddingHorizontal: space.cardPad, paddingVertical: space.gapMd, gap: space.gapSm, minHeight: space.touchMin },
  ruled: { borderTopWidth: StyleSheet.hairlineWidth },
  chevRow: { flexDirection: 'row', alignItems: 'center' },
  checkBody: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: space.gapMd },
  checkText: { flex: 1, gap: space.gapSm / 2 },
  sheetBody: { gap: space.gapMd, paddingBottom: space.gapMd },
  givenActions: { flexDirection: 'row', gap: space.gapMd },
});
