/**
 * 05-30 (DCU-02, DCU-03, DCU-11, DCU-13, DCU-24, ANL-06, D-08, D-15, D-24, D-40, D-56): the five-step check flow.
 *
 * The screen owns the step, the rules about which steps can be entered, back handling and the engine calls. Everything shown
 * is recomputed from the typed inputs and the current snapshot and never stored (D-15): `computeCore` runs on every edit (the
 * verdict, warnings and step 2 cards never lag) and `computeDetails` on the inputs settled for 150 ms (the slow figures).
 * Committing a decision is 05-29 (`useCommitDecision`, called here). A decided check opens read-only: a bought one recalculated
 * without its own writes (05-52) beside what was decided, a waiting or passed one recomputed with 'Reopen the check'.
 * Leaving never prompts and never loses work.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { useMarkCheckSeen, useReopenCheck } from '@/data/mutations/decideChecks';
import { useSaveCardRate, useSaveCardTerms, type CardTermsInput } from '@/data/mutations/decideLinks';
import { useAccounts } from '@/data/queries/accounts';
import { useAccountBalances, useHouseholdMemberNames } from '@/data/queries/activity';
import { useCategories } from '@/data/queries/categories';
import { useDebts, useDecideSnapshot, useOtherChecks } from '@/data/queries/decide';
import { useRecurringSeries } from '@/data/queries/recurringSeries';
import { SOLE_SHARE, monthlyEquivalent, resolveShare } from '@/engine/decide';
import type { ResolvedShare, SplitRule } from '@/engine/decide';
import { minorUnits } from '@/engine/money';
import { localDateIn } from '@/engine/time';
import { setSwipeBackInterceptor } from '@/features/navigation/swipeBackGesture';
import { categoryName } from '@/features/record/categoryName';
import { useRecordContext } from '@/features/record/useRecordContext';
import { useT } from '@/i18n';
import { getAnalytics } from '@/services/analytics';
import { focusAccessibility, useScreenTitleFocus } from '@/shell/a11yFocus';
import { showToast } from '@/state/undoToast';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, space, useScreenInsets } from '@/theme/layout';
import { ConfirmSheet } from '@/ui/ConfirmSheet';
import { EmptyState } from '@/ui/EmptyState';
import { useMoneyFormatter, type MoneyFormatter } from '@/ui/money/useMoneyFormatter';
import { Pill } from '@/ui/Pill';
import { Text } from '@/ui/Text';
import { fontSize, textRole } from '@/theme/typography';
import type { DecideCheckRow } from '@/db/decideChecks';
import { basisDetailItems } from '../copy/depthVerdictCopy';
import { stateChip } from '../copy/verdictCopy';
import { checkHref } from '../home/checkHref';
import { cancelCheckReminders } from '../notifications/waitReminder';
import { StateChip, type StateChipTone } from '../ui/StateChip';
import { fromHomePatch, inHomeCurrency, sourceFor } from '../snapshot/checkCurrency';
import { computeCore, computeDetails } from '../snapshot/computeCheck';
import type { CheckCore } from '../snapshot/computeCheck';
import { EMPTY_STACK } from '../snapshot/types';
import type { CheckComputation, CheckInputs } from '../snapshot/types';
import { CheckActionBar } from './CheckActionBar';
import { CheckFlowHeader } from './CheckFlowHeader';
import { AssumptionsSection } from './sections/AssumptionsSection';
import { DayByDaySection } from './sections/DayByDaySection';
import { ExpectedIncomeSection } from './sections/ExpectedIncomeSection';
import { LedgersSection } from './sections/LedgersSection';
import { LinesSection } from './sections/LinesSection';
import { MonthSection } from './sections/MonthSection';
import { OptionsSection } from './sections/OptionsSection';
import { SetbacksSection } from './sections/SetbacksSection';
import { WhoPaysSection } from './sections/WhoPaysSection';
import { ScopeToggle } from './ScopeToggle';
import { CardMinimumSheet } from './steps/step2/CardMinimumSheet';
import { Step1Item, step1Complete } from './steps/Step1Item';
import { Step2PriceAndPay, step2Complete } from './steps/Step2PriceAndPay';
import { Step3Verdict } from './steps/Step3Verdict';
import { Step4Alternatives } from './steps/Step4Alternatives';
import { Step5Decision } from './steps/Step5Decision';
import { Meta, moneyFn } from './steps/stepUi';
import type { StepNumber, StepProps } from './stepTypes';
import type { Translate } from './refText';
import { useBoughtCheckComputation } from './useBoughtCheckComputation';
import { useCheckDraft } from './useCheckDraft';
import { useCommitDecision } from './useCommitDecision';
import { useDebouncedValue } from './useDebouncedValue';

type Outcome = NonNullable<CheckInputs['outcome']>;
type SeenBasis = 'logged_months' | 'first_read_rough_figures';
type Titles = readonly [string, string, string, string, string];
type SectionKey = 'month' | 'ledgers' | 'dayByDay' | 'whoPays' | 'lines' | 'setbacks' | 'income' | 'options' | 'assumptions';

const EMPTY_BILLS: readonly { id: string; name: string; monthly: number }[] = [];

export interface CheckFlowScreenProps {
  id: string;
  /** From the route's `step` param; null lets the screen pick (step 3 once a price and method exist, else step 1). */
  initialStep?: StepNumber | null;
  kind?: 'buy' | 'invest';
}

function leaveFlow(): void {
  if (router.canGoBack()) router.back();
  else router.replace('/decide' as Href);
}

/** The shown figures: the slow details from the settled inputs, with every core field from the live inputs on top. */
function withCore(details: CheckComputation, core: CheckCore): CheckComputation {
  return {
    ...details,
    status: core.status,
    missingInput: core.missingInput,
    check: core.check,
    resolvedPrice: core.resolvedPrice,
    running: core.running,
    methodPlans: core.methodPlans,
    decision: core.decision,
    verdict: core.verdict,
    firstRead: core.firstRead,
    context: core.context,
    unconverted: core.unconverted,
    runningCostPrompts: core.runningCostPrompts,
    promoBalanceAtEnd: core.promoBalanceAtEnd,
  };
}

/** The purchase share the household sections show (D-18). Personal scope, one member or unusable figures give the whole. */
function shareFor(inputs: CheckInputs, memberCount: number, myIndex: number): ResolvedShare {
  if (inputs.scope !== 'household' || memberCount <= 1) return SOLE_SHARE;
  const split = inputs.split;
  let rule: SplitRule = { kind: 'even' };
  if (split?.kind === 'mine') rule = { kind: 'mine' };
  else if (split?.kind === 'weight') rule = { kind: 'weight', weights: split.weights };
  else if (split?.kind === 'amount') rule = { kind: 'amount', amounts: split.amounts.map((a) => minorUnits(a)) };
  try {
    const r = resolveShare({ kind: 'household', memberCount, myIndex, rule });
    return r.ok ? r.share : SOLE_SHARE;
  } catch {
    return SOLE_SHARE;
  }
}

function sharePercent(share: ResolvedShare): string {
  const total = share.weights.reduce((a, b) => a + b, 0);
  const mine = share.weights[share.myIndex] ?? 0;
  return `${total === 0 ? 0 : Math.round((mine * 100) / total)}%`;
}

/** 'This check isn't here': a deleted, foreign or invalid id. */
export function CheckNotFound(): React.JSX.Element {
  const t = useT();
  const { colors } = useTheme();
  const insets = useScreenInsets();
  return (
    <View style={[styles.notFound, { backgroundColor: colors.canvas, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <EmptyState heading={t('decide.flow.notFound.heading')} body={t('decide.flow.notFound.body')} />
      <Pill variant="secondary" label={t('decide.flow.notFound.back')} onPress={leaveFlow} />
    </View>
  );
}

/** D-12: what was decided (the stored verdict and estimates), shown above the recalculation on a bought check. */
function DecidedHeader({ row, whole, currency, timeZone }: { row: DecideCheckRow; whole: MoneyFormatter; currency: string; timeZone: string }): React.JSX.Element | null {
  const t = useT() as Translate;
  const { colors, pairing } = useTheme();
  const state = row.verdict_at_decision;
  const chip = state === null ? null : stateChip(state, 'full');
  const money = moneyFn(whole, currency as never);
  const decidedOn = row.decided_at === null ? null : whole.formatDate(localDateIn(new Date(row.decided_at), timeZone));
  const line = (label: string, value: number | null): React.JSX.Element => (
    <View style={styles.decidedRow}>
      <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted }}>{label}</Text>
      <Text style={{ ...textRole(pairing, 'body'), color: colors.ink }}>{value === null ? '—' : money(value)}</Text>
    </View>
  );
  return (
    <View style={[styles.decided, { backgroundColor: colors.surface }]}>
      <View style={styles.decidedRow}>
        {chip === null ? null : <StateChip tone={chip.tone as StateChipTone} label={t(chip.key)} />}
        {decidedOn === null ? null : <Text style={{ ...textRole(pairing, 'body'), color: colors.ink }}>{t('decide.past.decided', { date: decidedOn })}</Text>}
      </View>
      {line(t('decide.past.estDay'), row.estimate_day_one)}
      {line(t('decide.past.estMonth'), row.estimate_monthly)}
    </View>
  );
}

export function CheckFlowScreen({ id, initialStep = null, kind = 'buy' }: CheckFlowScreenProps): React.JSX.Element {
  const t = useT() as Translate;
  const { colors } = useTheme();
  const insets = useScreenInsets();
  const rc = useRecordContext();
  const today = rc.today;
  const draft = useCheckDraft(id, kind, today);
  const { row } = draft;
  const snapshot = useDecideSnapshot();
  // D-67 (CR-C06, CR-B02): a check typed in another currency is shown, edited and judged in the snapshot currency at the
  // latest stored rate; edits are converted back before they are saved, so the stored stamp never changes.
  const isSample = row?.is_sample === true;
  const typedIn = useMemo(
    () => (snapshot.result === null ? null : inHomeCurrency(draft.inputs, snapshot.result, { isSample })),
    [draft.inputs, snapshot.result, isSample]
  );
  const inputs = typedIn === null ? draft.inputs : typedIn.inputs;
  const source = useMemo(() => (snapshot.result === null || typedIn === null ? snapshot.result : sourceFor(snapshot.result, typedIn)), [snapshot.result, typedIn]);
  const conversion = useRef({ stored: draft.inputs, result: snapshot.result, isSample });
  useEffect(() => {
    conversion.current = { stored: draft.inputs, result: snapshot.result, isSample };
  });
  const draftUpdate = draft.update;
  const update = useCallback<typeof draft.update>(
    (patch, opts) => {
      const c = conversion.current;
      draftUpdate(c.result === null ? patch : fromHomePatch(patch, c.stored, c.result, { isSample: c.isSample }), opts);
    },
    [draftUpdate]
  );
  const stack = useOtherChecks(id);
  const whole = useMoneyFormatter(false);
  const exact = useMoneyFormatter(true);

  const householdId = rc.householdId;
  const accountsQuery = useAccounts(householdId ?? undefined);
  const accountRows = useMemo(() => accountsQuery.data ?? [], [accountsQuery.data]);
  const { balances } = useAccountBalances(householdId, accountRows);
  const debts = useDebts(householdId ?? undefined).data;
  const series = useRecurringSeries(householdId ?? undefined).data;
  const categories = useCategories(rc.userId ?? undefined).data;
  const memberNames = useHouseholdMemberNames(householdId);
  const { markSeen } = useMarkCheckSeen();
  const cardRate = useSaveCardRate();
  const cardTerms = useSaveCardTerms();
  const { reopen } = useReopenCheck();
  const reopening = useRef(false);
  const [reopened, setReopened] = useState(false);

  const readOnly = row !== null && row.status !== 'open';
  const bought = row !== null && row.status === 'bought';
  const boughtState = useBoughtCheckComputation(row, row === null ? null : draft.inputs);

  // ── D-56: the verdict is live, the slow details follow the inputs 150 ms after they stop changing ──
  const core = useMemo(() => (source === null || bought ? null : computeCore(source, inputs, stack.otherChecks)), [source, inputs, stack, bought]);
  const settled = useDebouncedValue(inputs);
  const settledCore = useMemo(() => (source === null || bought ? null : computeCore(source, settled, stack.otherChecks)), [settled, source, stack, bought]);
  const details = useMemo(() => (settledCore === null ? null : computeDetails(settledCore, settled)), [settledCore, settled]);
  const live = useMemo(() => (core === null || details === null ? null : withCore(details, core)), [core, details]);
  // 05-52: a bought check is recomputed without its own Go-ahead writes, so the purchase is never counted twice.
  const computation: CheckComputation | null = bought ? boughtState.computation : live;
  const busy = !bought && settled !== inputs;

  // ── the step ──
  const complete1 = step1Complete(inputs, today);
  const complete2 = step2Complete(inputs);
  const canEnter = useCallback((s: StepNumber): boolean => s <= 2 || (complete1 && complete2), [complete1, complete2]);
  const [step, setStep] = useState<StepNumber | null>(null);
  const [reached, setReached] = useState<StepNumber>(1);
  const [blocked, setBlocked] = useState(false);
  if (step === null && draft.status === 'ready') {
    const wanted: StepNumber = initialStep ?? (complete2 ? 3 : 1);
    const first: StepNumber = wanted <= 2 || (complete1 && complete2) ? wanted : complete1 ? 2 : 1;
    setStep(first);
    setReached(first);
  }
  const furthest = Math.min(5, Math.max(row?.furthest_step ?? 1, reached)) as StepNumber;

  const go = useCallback(
    (n: StepNumber): void => {
      setBlocked(false);
      setStep(n);
      setReached((r) => (n > r ? n : r));
      if (n > furthest) update({}, { step: n });
    },
    [furthest, update]
  );
  const onBlocked = useCallback((): void => {
    setStep(complete1 ? 2 : 1);
    setBlocked(true);
  }, [complete1]);

  // Back steps back before it leaves (A5, A8). The edge swipe and the Android button are claimed only past step 1, and
  // released on every change of step and on unmount: the interceptor is a module-level singleton.
  useEffect(() => {
    if (step === null || step <= 1) return undefined;
    const previous = (step - 1) as StepNumber;
    const stepBack = (): boolean => {
      setBlocked(false);
      setStep(previous);
      return true;
    };
    // WR-C08: release only this screen's own claim
    const release = setSwipeBackInterceptor(stepBack);
    const sub = BackHandler.addEventListener('hardwareBackPress', stepBack);
    return () => {
      sub.remove();
      release();
    };
  }, [step]);
  const back = useCallback((): void => {
    if (step !== null && step > 1) {
      setBlocked(false);
      setStep((step - 1) as StepNumber);
    } else leaveFlow();
  }, [step]);
  const saveClose = useCallback(async (): Promise<void> => {
    // WR-C09: "Saved" only when there is a check and every edit is written or queued. A first edit held until the account
    // loads keeps the screen open (leaving would drop it); a new check never edited leaves without a toast.
    const result = await draft.saveNow();
    if (result === 'waiting') {
      showToast({ kind: 'ordinary', text: { key: 'decide.flow.saveWaiting' } });
      return;
    }
    if (!readOnly && result === 'saved') showToast({ kind: 'ordinary', text: { key: 'decide.flow.saved' } });
    leaveFlow();
  }, [draft, readOnly]);

  // Focus moves to the title on each step change (not on the first render, which the push focus covers).
  const titleRef = useRef<React.ComponentRef<typeof Text>>(null);
  useScreenTitleFocus(titleRef as never);
  const focused = useRef<StepNumber | null>(null);
  useEffect(() => {
    if (step === null) return;
    if (focused.current !== null && focused.current !== step) focusAccessibility(titleRef.current as never);
    focused.current = step;
  }, [step]);

  // ── analytics: enums only, and no review prompt is ever requested (ANL-06, D-20) ──
  const viewed = useRef(new Set<StepNumber>());
  useEffect(() => {
    if (step === null || viewed.current.has(step)) return;
    viewed.current.add(step);
    getAnalytics().track('check_step_viewed', { step: String(step) as '1' | '2' | '3' | '4' | '5' });
  }, [step]);

  const seenState = computation === null ? null : computation.status === 'logged' && computation.verdict ? computation.verdict.state : computation.status === 'first_read' && computation.firstRead ? computation.firstRead.state : null;
  const seenBasis: SeenBasis = computation !== null && computation.status === 'first_read' ? 'first_read_rough_figures' : 'logged_months';
  const completed = useRef(false);
  // WR-C03: every step-3 visit records what was seen when it differs from what this screen last recorded (markSeen itself
  // skips a call that changes nothing), so going back, changing the price and returning is recorded too.
  const marked = useRef<string | null>(null);
  const hasRow = row !== null;
  const rowRef = useRef(row);
  useEffect(() => {
    rowRef.current = row;
  });
  useEffect(() => {
    if (step !== 3 || seenState === null || readOnly) return;
    if (!completed.current) {
      completed.current = true;
      getAnalytics().track('check_completed', { state: seenState });
    }
    const current = rowRef.current;
    const key = `${seenState}|${seenBasis}`;
    if (marked.current !== key && current !== null) {
      marked.current = key;
      markSeen(current, seenState, seenBasis);
    }
  }, [step, seenState, seenBasis, readOnly, hasRow, markSeen]);

  // The basis the user saw last time, read once before this visit marks it (D-15 'Changed since you looked').
  const [lastSeenBasis, setLastSeenBasis] = useState<SeenBasis | null | undefined>(undefined);
  if (lastSeenBasis === undefined && draft.status === 'ready') setLastSeenBasis(row?.last_seen_basis ?? null);

  // ── card terms (D-40) ──
  const [cardSheetFor, setCardSheetFor] = useState<string | null>(null);
  const saveCardRate = useCallback(
    (accountId: string, aprText: string): void => {
      if (readOnly || rc.userId === null || householdId === null) return; // WR-C04: a decided check never writes the card record
      const account = accountRows.find((a) => a.id === accountId);
      if (!account) return;
      const debtId = source?.cards.find((c) => c.accountId === accountId)?.terms.debtId ?? null;
      const existing = debtId === null ? null : (debts?.find((d) => d.id === debtId) ?? null);
      cardRate.save({ userId: rc.userId, householdId, accountId, existing, currency: account.currency, accountName: account.name, aprText });
    },
    [readOnly, rc.userId, householdId, accountRows, source, debts, cardRate]
  );
  const saveCardTerms = useCallback(
    (accountId: string, terms: CardTermsInput): void => {
      if (readOnly || rc.userId === null || householdId === null) return;
      const account = accountRows.find((a) => a.id === accountId);
      if (!account) return;
      const debtId = source?.cards.find((c) => c.accountId === accountId)?.terms.debtId ?? null;
      const existing = debtId === null ? null : (debts?.find((d) => d.id === debtId) ?? null);
      cardTerms.save({ userId: rc.userId, householdId, accountId, existing, currency: account.currency, accountName: account.name, terms });
    },
    [readOnly, rc.userId, householdId, accountRows, source, debts, cardTerms]
  );
  const missingCard = source === null ? null : (source.cards.find((c) => c.accountId === source.meta.cardsWithoutMinimumIds[0]) ?? null);
  const onEditCardMinimum = !readOnly && missingCard !== null ? () => setCardSheetFor(missingCard.accountId) : undefined;
  const sheetCard = cardSheetFor === null || source === null ? null : (source.cards.find((c) => c.accountId === cardSheetFor) ?? null);

  // ── lists the steps read ──
  const liveAccounts = useMemo(() => accountRows.filter((a) => a.archived_at === null && a.deleted_at === null), [accountRows]);
  // CR-C05: Go ahead writes in the home currency, so only live cash accounts in that currency can pay (and their balances
  // compare like for like).
  const payCurrency = source?.currency ?? rc.homeCurrency;
  const cashAccounts = useMemo(
    () =>
      liveAccounts
        .filter((a) => (a.kind === 'cash' || a.kind === 'checking') && a.currency === payCurrency)
        .map((a) => ({ id: a.id, name: a.name, balance: balances.get(a.id)?.balance ?? 0 })),
    [liveAccounts, balances, payCurrency]
  );
  const investAccounts = useMemo(
    () => liveAccounts.filter((a) => a.kind === 'investment').map((a) => ({ id: a.id, name: a.name, currency: a.currency })),
    [liveAccounts]
  );
  const saveDraftNow = draft.saveNow;
  const flushDraft = useCallback((): void => {
    void saveDraftNow();
  }, [saveDraftNow]);
  const commit = useCommitDecision({ row, inputs, computation, source, whole, exact, cashAccounts, investAccounts, onDone: leaveFlow, flush: flushDraft });
  const recurringBills = useMemo(() => {
    if (source === null || source.kind !== 'logged' || series === undefined) return EMPTY_BILLS;
    const names = new Map(series.map((s) => [s.id, s.name] as const));
    return source.snapshot.bills.flatMap((b) => {
      const name = names.get(b.seriesId);
      return name === undefined ? [] : [{ id: b.seriesId, name, monthly: monthlyEquivalent(b.latestAmount, b.freq) }];
    });
  }, [source, series]);
  const lineName = useCallback(
    (lineId: string): string => {
      const category = categories?.find((c) => c.id === lineId);
      return category ? categoryName(category, t as never) : t('record.sheet.uncategorised');
    },
    [categories, t]
  );

  // ── household (D-18) ──
  const memberCount = memberNames.size;
  const memberList = useMemo(() => [...memberNames.values()], [memberNames]);
  const myIndex = Math.max(0, [...memberNames.keys()].indexOf(rc.userId ?? ''));
  const share = useMemo(() => shareFor(inputs, memberCount, myIndex), [inputs, memberCount, myIndex]);

  // ── step 3 sections: collapsed by default, expanded state kept while the flow is open ──
  const [open, setOpen] = useState<Partial<Record<SectionKey, boolean>>>({});
  const section = (key: SectionKey) => ({ expanded: open[key] === true, onToggle: () => setOpen((o) => ({ ...o, [key]: o[key] !== true })) });

  const titles: Titles = useMemo(
    () =>
      inputs.kind === 'invest'
        ? [t('decide.flow.title.investItem'), t('decide.flow.title.investPrice'), t('decide.flow.title.impact'), t('decide.flow.title.alternatives'), t('decide.flow.title.decision')]
        : [t('decide.flow.title.item'), t('decide.flow.title.price'), t('decide.flow.title.impact'), t('decide.flow.title.alternatives'), t('decide.flow.title.decision')],
    [inputs.kind, t]
  );

  if (draft.status === 'not_found') return <CheckNotFound />;
  if (draft.status === 'loading' || step === null) return <View style={[styles.fill, { backgroundColor: colors.canvas }]} accessibilityState={{ busy: true }} />;

  const stepProps = (c: CheckComputation, src: NonNullable<typeof source>): StepProps => ({
    inputs,
    update,
    computation: c,
    source: src,
    goToStep: go,
    whole,
    exact,
    today,
    readOnly,
    stack: inputs.combine === false ? EMPTY_STACK : stack,
    busy,
  });

  const verdict = computation?.verdict ?? null;
  const resolved = verdict !== null && verdict.state !== 'missing' ? verdict : null;
  let hint: string | null = null;
  if (blocked) hint = t('decide.flow.hint.needsSteps');
  else if (step === 1 && !(inputs.advertised !== null && inputs.advertised > 0)) hint = t('decide.flow.hint.noPrice');
  else if (step === 2 && !complete2 && !readOnly) hint = t('decide.flow.hint.needsSteps');
  else if (step === 3) hint = t('decide.flow.hint.impact');
  else if (step === 5 && !readOnly && commit.blockedKey !== null) hint = t(commit.blockedKey);
  else if (step === 5 && inputs.outcome === 'go' && resolved !== null && resolved.state !== 'fits') hint = t('decide.flow.hint.breaks');
  else if (step === 5 && (inputs.outcome === 'wait' || inputs.outcome === 'pass')) hint = t('decide.flow.hint.waitPass');
  const nextDisabled = readOnly ? false : step === 1 ? !complete1 : step === 2 ? !complete2 : step === 5 ? inputs.outcome === null || commit.blockedKey !== null || commit.committing || busy : false;

  // 05-29: a bought check goes back to Decide (a reopened copy would be judged against a snapshot that holds the purchase);
  // a waiting or passed one reopens as a new check at step 3. CR-C07: once per screen, so a double tap opens one copy.
  const reopenCheck = (): void => {
    if (row === null || reopening.current) return;
    reopening.current = true;
    setReopened(true);
    void cancelCheckReminders(row.id).catch(() => undefined);
    const newId = reopen(row, today);
    showToast({ kind: 'ordinary', text: { key: 'decide.toast.reopened' } });
    // WR-C08: the reopened check replaces the decided one, so finishing it returns to Decide, not to the old view
    router.replace(checkHref(newId, { step: '3' }));
  };
  const decidedAction = row === null || !readOnly ? null : bought ? { label: t('decide.flow.notFound.back'), onPress: leaveFlow } : { label: t('decide.flow.reopen'), onPress: reopenCheck, disabled: reopened };

  const combine = !readOnly && stack.openCount >= 1 ? { value: inputs.combine, onChange: (v: boolean) => update({ combine: v }) } : null;

  const body = (): React.ReactNode => {
    if (source === null || computation === null) {
      if (snapshot.status === 'error' || boughtState.status === 'error') {
        return (
          <View style={styles.centered}>
            <EmptyState heading={t('decide.flow.loadFailed')} body="" />
            <Pill variant="secondary" label={t('decide.flow.retry')} onPress={snapshot.retry} />
          </View>
        );
      }
      return <View accessibilityState={{ busy: true }} style={styles.fill} />;
    }
    const p = stepProps(computation, source);
    const currency = source.currency;
    const common = { computation, inputs, update, whole, exact, currency, readOnly, busy };
    switch (step) {
      case 1:
        return <Step1Item {...p} recurringBills={recurringBills} />;
      case 2:
        return <Step2PriceAndPay {...p} onSaveCardRate={saveCardRate} onSaveCardTerms={saveCardTerms} />;
      case 3: {
        const decision = computation.status === 'logged' ? computation.decision : null;
        const monthName = (month: string): string => {
          const [y, m] = month.split('-') as [string, string];
          return new Intl.DateTimeFormat(whole.locale, { month: 'long', timeZone: 'UTC' }).format(Date.UTC(Number(y), Number(m) - 1, 1));
        };
        const basisItems = decision
          ? basisDetailItems({
              decision,
              conversions: source.conversions,
              cardsWithoutMinimum: source.meta.cardsWithoutMinimum,
              fmt: (n: number) => whole.formatMoney({ amount: minorUnits(n), currency }),
              monthName,
              formatDate: (d: string) => whole.formatDate(d),
            })
          : [];
        const a = resolved;
        const dayOneTotal: number = a === null ? 0 : a.plan.dayOne;
        const monthlyTotal: number = a === null ? 0 : a.plan.monthly;
        return (
          <View style={styles.sections}>
            {bought && row !== null ? <DecidedHeader row={row} whole={whole} currency={currency} timeZone={rc.timeZone} /> : null}
            <Step3Verdict {...p} lastSeenBasis={lastSeenBasis ?? null} revealKey={id} onEditCardMinimum={onEditCardMinimum} />
            <View accessibilityState={{ busy }} style={styles.sections}>
              <MonthSection {...common} {...section('month')} />
              <LedgersSection {...common} {...section('ledgers')} />
              <DayByDaySection {...common} {...section('dayByDay')} stack={p.stack} formatDate={(d) => whole.formatDate(d)} />
              <WhoPaysSection
                {...common}
                {...section('whoPays')}
                memberCount={memberCount}
                memberNames={memberList}
                share={share}
                dayOneTotal={dayOneTotal}
                monthlyTotal={monthlyTotal}
              />
              <LinesSection {...common} {...section('lines')} />
              <SetbacksSection {...common} {...section('setbacks')} resultIds={(bought ? inputs : settled).setbacks.map((s) => s.id)} />
              <ExpectedIncomeSection {...common} {...section('income')} />
              <OptionsSection
                {...common}
                {...section('options')}
                lineName={lineName}
                onSwitchToWait={() => {
                  update({ outcome: 'wait' });
                  go(5);
                }}
                onOpenActivity={() => router.navigate('/activity' as Href)}
              />
              <AssumptionsSection
                {...common}
                {...section('assumptions')}
                meta={source.meta}
                onEditCardMinimum={onEditCardMinimum}
                stack={p.stack}
                conversions={source.conversions}
                basisItems={basisItems}
                formatDate={(d) => whole.formatDate(d)}
              />
            </View>
          </View>
        );
      }
      case 4:
        return (
          <View accessibilityState={{ busy }}>
            <Step4Alternatives {...p} />
          </View>
        );
      default:
        return <Step5Decision {...p} cashAccounts={cashAccounts} investAccounts={investAccounts} checkId={row?.id ?? null} checkStatus={row?.status ?? null} written={commit.written} />;
    }
  };

  return (
    <View style={[styles.fill, { backgroundColor: colors.canvas }]}>
      <CheckFlowHeader
        step={step}
        furthest={furthest}
        title={titles[step - 1] ?? ''}
        titles={titles}
        canEnter={canEnter}
        onJump={go}
        onBlocked={onBlocked}
        onBack={back}
        titleRef={titleRef}
        combine={combine}
      />
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          style={styles.fill}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: space.screenH, paddingTop: space.groupGap, paddingBottom: insets.bottom + space.groupGap, gap: space.groupGap }}
        >
          <ScopeToggle
            memberCount={memberCount}
            householdName={t('decide.scope.household')}
            inputs={inputs}
            update={update}
            sharePct={sharePercent(share)}
            currency={source?.currency ?? rc.homeCurrency}
            memberNames={memberList}
            readOnly={readOnly}
          />
          {typedIn?.kind === 'converted' ? <Meta>{t('decide.flow.typedIn', { from: typedIn.note.from, to: typedIn.note.to })}</Meta> : null}
          {body()}
        </ScrollView>
        <CheckActionBar
          step={step}
          hint={hint}
          nextDisabled={nextDisabled}
          outcome={inputs.outcome}
          readOnly={readOnly}
          onNext={() => go(Math.min(5, step + 1) as StepNumber)}
          onSaveClose={() => void saveClose()}
          onCommit={commit.requestCommit}
          decidedAction={decidedAction}
        />
      </KeyboardAvoidingView>
      <ConfirmSheet
        visible={commit.confirm.visible}
        title={t('decide.decision.confirmTitle')}
        body={commit.confirm.lines.join('\n')}
        cancelLabel={t('decide.decision.confirmNotYet')}
        confirmLabel={t('decide.decision.confirmGo')}
        onConfirm={commit.confirm.onConfirm}
        onCancel={commit.confirm.onCancel}
      />
      {sheetCard ? (
        <CardMinimumSheet
          visible
          terms={sheetCard.terms}
          onSave={(terms) => {
            saveCardTerms(sheetCard.accountId, terms);
            setCardSheetFor(null);
          }}
          onClose={() => setCardSheetFor(null)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  notFound: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.groupGap, paddingHorizontal: space.screenH },
  centered: { alignItems: 'center', gap: space.groupGap, paddingTop: space.groupGap },
  sections: { gap: space.gapMd },
  decided: { borderRadius: radii.card, padding: space.cardPadLg, gap: space.gapSm },
  decidedRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.gapSm },
});
