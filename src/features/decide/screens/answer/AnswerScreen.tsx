// 06.1-23 (UX-03, UX-06, UX-07, UX-16, UX-23, FIN-29, APP-01, CMP-F03, CO-D-38, CO-D-43, CO-D-124, UX-33, CO-D-35): the one answer
// route body behind every answer board. It loads the stored check, waits for the first-answer gate (FirstAnswerGateBound, passed in
// by the shell because the gate's write may not be imported from features/decide), judges through useCheckEngine and renders the
// AnswerFrame with the More-detail rows, "What you told Decide", the fact action buttons and every detail and info sheet. Pay mode
// and date change in place on the stored draft; nothing navigates. Offline it answers from the cached records with "Records up to";
// an error shows no figure.
// 06.1-44 (G-1, C-1, C-2): a not-ready answer names each item with its fix and one-tap answers. An answer is saved as a readiness
// waiver (or the pending line is skipped) with one Undo; the screen re-judges from the answers cache and stays put.
// 06.1-66 (H-5): the same parts every time. "What you told Decide" shows on every loaded answer (home path and stepper path) with the
// rows that apply; Not ready (readiness or "More needed", OQ-66-2) keeps it with "I'm not buying it" and "Delete this check" (FQ6);
// pay and When only with a verdict; the payday chip is a short date or absent; a decided check shows its outcome line (FQ8); the
// first-answer gate sits over the frame's loading state (FQ5), and an unanswered safety-net question is one line that opens it.
// 06.1-68 (H-7): a readiness answer changes its row at once ("Saved, updating…", choices off) until the engine agrees
// (useAnsweredRows); the verdict dims with "Updating…" while it is worked out again; "None" and "Change answer" toast with Undo; a
// plan named in the plan sheet is stored with its pay change in one write (L0.plan_name, 06.1-57).
// 06.1-67 (H-6): the missing-figures line opens Give it more to go on, whose row count reads the sheet's own list (CS-5); the More
// detail rows hold still and take no tap while the answer updates (DN-4); "Full cost, with tax" opens the Full cost sheet.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { router, type Href } from 'expo-router';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useCreateCheck, useMarkCheckSeen, useRemoveDecision, useSaveCheckAnswer } from '@/data/mutations/decideChecks';
import { useRecordCheckHistory } from '@/data/mutations/decideHistory';
import { useSaveDecideAnswer } from '@/data/mutations/decideAnswers';
import { useSetDecideAnswered } from '@/data/mutations/decideSetup';
import { queryKeys } from '@/data/keys';
import { useAccounts } from '@/data/queries/accounts';
import { useDecideChecks } from '@/data/queries/decide';
import { useDecideV3 } from '@/data/queries/decideV3';
import { DECIDE_READ_STALE_MS } from '@/data/queries/decideStale';
import { useIsOnline } from '@/data/sync/useIsOnline';
import type { DecideCheckRow } from '@/db/decideChecks';
import type { TransactionRow } from '@/db/rows';
import { freeHelpFor, type CheckV2, type Evaluation, type LocalDate, type PayV2, type ReadinessItem, type ReadinessWaiver } from '@/engine/decide/v3';
import { money as makeMoney } from '@/engine/money';
import { CheckNotFound } from '@/features/decide/screens/ui/CheckNotFound';
import { openNewCheck } from '@/features/decide/screens/logic/checkHref';
import { checkInputsKey } from '@/features/decide/screens/logic/checkInputsKey';
import { goDecideHome, withFromAnswer } from '@/features/decide/screens/logic/decideNav';
import { useRecordContext } from '@/features/record/useRecordContext';
import { useT } from '@/i18n';
import { pushOnce } from '@/shell/navigation/pushOnce';
import { showToast } from '@/state/undoToast';
import { hapticLight } from '@/ui/haptics';
import { Row } from '@/ui/Row';
import { useMoneyFormatter } from '@/ui/money/useMoneyFormatter';
import { waiverAnswerKey } from '@/features/decide/snapshot/v3/waiverKeys';
import { useCheckEngine } from '../engine/useCheckEngine';
import { useMonthPicture } from '../engine/useMonthPicture';
import { DatePickerSheet } from '../sheets/DatePickerSheet';
import { EnvelopeAccountSheet, type SetEnvelopeAccount } from '../sheets/EnvelopeAccountSheet';
import { InstallmentPlanSheet } from '../sheets/InstallmentPlanSheet';
import { giveMoreCount as countGiveMore } from '../logic/answerLines';
import { estimatesCanAnswer, readinessFixRows, type ReadinessFixRow, type WaiverChoice } from '../logic/readinessFixes';
import { useNetUnanswered } from '../firstAnswer/useFirstAnswerGate';
import { withPlanName } from '../check/planName';
import { KEY_SKIPPED, countsLikeOf, kindOf, lineNamesOf, ownKindsOf, stepHref, useStepCheck, useStepData, type BuiltInKind } from '../check/useStepCheck';
import { AnswerFrame, isNotReady, type AnswerAction, type AnswerCheckView } from './AnswerFrame';
import { AnswerLoading } from './AnswerLoading';
import type { PayMode, WhenChoice } from './AnswerTopBar';
import { FactActions, type FactActionChoice } from './FactActions';
import { MoreDetailRows, type DetailRow } from './MoreDetailRows';
import type { OptionKey } from './OptionChips';
import { useAnswerEffects } from './useAnswerEffects';
import { useAnsweredRows, type AnsweredBy } from './useAnsweredRows';
import { useSaid, type UseSaidOptions } from './useSaid';
import { WhatYouToldCard, type ToldStep } from './WhatYouToldCard';
import { BuyLaterSheet } from './detail/BuyLaterSheet';
import { CheaperSheet } from './detail/CheaperSheet';
import { CostsThatStopSheet } from './detail/CostsThatStopSheet';
import { EveryDateSheet } from './detail/EveryDateSheet';
import { FullCostSheet, fullCostFigures } from './detail/FullCostSheet';
import { MonthAfterSheet } from './detail/MonthAfterSheet';
import { MonthByMonthSheet, aheadMonths } from './detail/MonthByMonthSheet';
import { AboutSheet } from './info/AboutSheet';
import { FreeHelpSheet } from './info/FreeHelpSheet';
import { GiveMoreSheet } from './info/GiveMoreSheet';
import { HowWorkedOutSheet } from './info/HowWorkedOutSheet';

/** Where each missing figure is put right. Anything not listed goes to the setup checklist. */
const FIX_ROUTE: Readonly<Record<string, string>> = {
  no_income_figures: '/decide/setup/pay',
  income_pattern_unconfirmed: '/decide/setup/pay',
  expected_income_needed: '/decide/setup/pay',
  pay_arrival_question: '/decide/setup/pay',
  everyday_unknown: '/decide/setup/bills',
  records_look_behind: '/decide/setup/records',
  unspent_not_confirmed: '/decide/setup/records',
};
/** Missing figures that belong to the price and payment steps of this check. */
const PRICE_STEP_FIXES: ReadonlySet<string> = new Set(['no_price', 'price_too_large', 'plan_count_missing', 'first_payment_not_chosen', 'pause_interest_not_answered', 'plan_rate_missing', 'first_payment_passed']);

type SheetKey = 'later' | 'cheaper' | 'fullCost' | 'monthAfter' | 'stops' | 'everyDate' | 'monthByMonth' | 'worked' | 'giveMore' | 'help' | 'about' | 'plan';

/** The writes the shell binds (useNotBuying reaches the rate-fetch door, which features/decide may not import). */
export interface AnswerWrites {
  notBuying: (a: { row: DecideCheckRow; evaluation: Evaluation }) => string | null;
  /** 06.1-44 (D-54): Grow's goal writer for the envelope fix (features/decide may not import Grow's goal writes). */
  setEnvelopeAccount: SetEnvelopeAccount;
  /** 06.1-44: skips a pending line (the shell binds useSkipOccurrence, whose write path reaches the rate-fetch door). Returns the undo step id. */
  skipLine: (row: TransactionRow, ownerId: string) => string | null;
}

export interface AnswerScreenProps {
  id: string;
  /** A side picked on the compare screen: 'cash' judges as paid once, 'installments' opens the plan. */
  side?: 'cash' | 'installments' | null;
  /** The first-answer gate (shell/decide/FirstAnswerGateBound); it calls onDone at once when nothing is left to ask. */
  renderGate: (onDone: () => void) => React.ReactNode;
  /** 06.1-66 (FQ5): the safety-net question opened from the answer's net line, bound in the shell; onClose(true) once answered. */
  renderNetQuestion: (onClose: (answered: boolean) => void) => React.ReactNode;
  writes: AnswerWrites;
}

const NO_ROWS: readonly DecideCheckRow[] = [];
const NO_ITEMS: readonly ReadinessItem[] = [];
const asHref = (path: string): Href => path as Href;

/** 06.1-66 (CB-7, FQ8): "Nov 15" for a stored day, in the device locale. */
function shortDayFormat(locale: string): (d: string) => string {
  const f = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', timeZone: 'UTC' });
  return (d) => f.format(new Date(`${d.slice(0, 10)}T00:00:00Z`));
}
/** 06.1-66 (FQ8): "Nov 12" for a stored moment, on the device's own calendar. */
function shortMomentFormat(locale: string): (iso: string) => string {
  const f = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' });
  return (iso) => f.format(new Date(iso));
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

/** The decide_answers key a waiver is stored under; '' when it cannot be built (then only the engine's list clears the row). */
function safeWaiverKey(w: ReadinessWaiver): string {
  try {
    return waiverAnswerKey(w);
  } catch {
    return '';
  }
}

const NO_KEYS: ReadonlySet<string> = new Set();

/** With the line not cached, the same occurrence is answered by its waiver instead (the engine accepts it when no line can be skipped). */
function fallbackWaiver(item: ReadinessItem): ReadinessWaiver | null {
  if (item.seriesId === null || item.date === null) return null;
  if (item.kind === 'bill') return { kind: 'didnt_happen', seriesId: item.seriesId, date: item.date };
  if (item.kind === 'pay') return { kind: 'no_pay', seriesId: item.seriesId, date: item.date };
  return null;
}

// 06.1-64 (CN-4): with nothing below, the Decide home already in the stack (dismissTo), never a second copy. Steps opened from
// the answer carry from=answer (withFromAnswer), so their Back and "See the answer" return here (H-3, FQ2).
function leave(): void {
  if (router.canGoBack()) router.back();
  else goDecideHome(router);
}

/** 06.1-66 (FQ8, CC-2): what happened to a decided check, dated; null while it is open. */
function outcomeOf(row: DecideCheckRow, t: ReturnType<typeof useT>, shortMoment: (iso: string) => string): string | null {
  if (row.status !== 'bought' && row.status !== 'waiting' && row.status !== 'passed') return null;
  const date = shortMoment(row.decided_at ?? row.updated_at);
  return String(t(`decide.screens.answer.outcome.${row.status}` as never, { date } as never));
}

export function AnswerScreen({ id, side = null, renderGate, renderNetQuestion, writes }: AnswerScreenProps) {
  const t = useT();
  const rc = useRecordContext();
  const data = useStepData();
  const fmt = useMoneyFormatter(rc.showCents, data.currency);
  const checks = useDecideChecks(rc.userId ?? undefined, rc.householdId ?? undefined);
  // A check just made by "New check" may exist only optimistically (pending write, works offline): use it until the list has it.
  const { pendingRows = NO_ROWS } = useCreateCheck();
  const row = useMemo(
    () => (checks.data ?? []).find((c) => c.id === id && c.deleted_at == null) ?? pendingRows.find((c) => c.id === id && c.deleted_at == null) ?? null,
    [checks.data, pendingRows, id]
  );
  const step = useStepCheck(id, row);
  const { check } = step;
  const engine = useCheckEngine(check, { checkId: id });
  const { picture, bars } = useMonthPicture();
  const v3 = useDecideV3();
  const isOnline = useIsOnline(); // 06.1-72: the online flag only, not the per-fetch last-synced time
  const accounts = useAccounts(rc.householdId ?? undefined, { staleTime: DECIDE_READ_STALE_MS }); // 06.1-72: no refetch on the answer's mount
  const { markSeen } = useMarkCheckSeen();
  const { save: saveAnswer } = useSaveCheckAnswer(); // 06.1-78: stores the shown answer, so the open-checks row leaves Draft
  const history = useRecordCheckHistory(rc.userId ?? '');
  const answered = useSetDecideAnswered(rc.userId ?? '');
  const qc = useQueryClient();
  const answers = useSaveDecideAnswer(rc.userId ?? '', rc.householdId ?? '');
  const [envelopeId, setEnvelopeId] = useState<string | null>(null);
  const { remove } = useRemoveDecision();
  const netUnanswered = useNetUnanswered();
  const [netOpen, setNetOpen] = useState(false);
  // Answered from the line: hidden at once, before the reads catch up. A swipe leaves it.
  const [netAnsweredHere, setNetAnsweredHere] = useState(false);
  const shortDay = useMemo(() => shortDayFormat(fmt.locale), [fmt.locale]);
  const shortMoment = useMemo(() => shortMomentFormat(fmt.locale), [fmt.locale]);

  const [gated, setGated] = useState(false);
  // An installments side from the compare screen opens the plan sheet on arrival.
  const [sheet, setSheet] = useState<SheetKey | null>(side === 'installments' ? 'plan' : null);
  const [datePick, setDatePick] = useState<{ current: LocalDate | null; set: (d: LocalDate) => void } | null>(null);
  const evaluation = engine.evaluation;
  const result = engine.status === 'ready' && evaluation !== null ? evaluation.result : null;
  const currency = data.currency;
  const today = data.today as LocalDate;
  const money = useCallback((minor: number): string => fmt.formatMoney(makeMoney(minor, currency)), [fmt, currency]);

  // 06.1-81 (RV-3): the inputs the shown answer was judged on; null while the deferred judge still shows older inputs.
  const inputsKey = useMemo(() => (check === null || engine.updating ? null : checkInputsKey(check)), [check, engine.updating]);
  // D-14: the safety-net question and intro come before any verdict. Hooks above run either way; the verdict mounts after.
  useAnswerEffects({
    row,
    result: gated ? result : null,
    writes: { markSeen, recordHistory: (a) => history.mutate(a), saveAnswer },
    inputsKey,
  });

  // A side picked on the compare screen, applied once per pick. 06.1-63 (CN-13): Compare now returns to this same answer with a new
  // `side` (dismissTo), so a changed cash side applies again: cash judges as paid once.
  const sideDone = useRef<'cash' | 'installments' | null>(null);
  useEffect(() => {
    if (side === null || sideDone.current === side || check === null || !gated) return;
    sideDone.current = side;
    if (side === 'cash' && check.pay.mode === 'plan') {
      step.update((c) => ({ ...c, pay: { mode: 'once' } }));
      step.flush();
    }
  }, [side, check, gated, step]);
  // 06.1-63 (CN-13): a later installments side opens the plan sheet (on arrival the initial sheet state already does). Adjusted
  // during render when the prop changes, not in an effect.
  const [sideSeen, setSideSeen] = useState(side);
  if (side !== sideSeen) {
    setSideSeen(side);
    if (side === 'installments') setSheet('plan');
  }

  const names = useMemo<NonNullable<UseSaidOptions['names']>>(() => {
    const category = new Map(data.categories.map((c) => [c.id, c.name]));
    const series = new Map(data.billChoices.map((b) => [b.id, b.name]));
    const debts = new Map(data.debts.map((d) => [d.id, d.name]));
    const acct = new Map((accounts.data ?? []).map((a) => [a.id, a.name ?? '']));
    return {
      category: (x) => category.get(x) ?? '',
      series: (x) => series.get(x) ?? '',
      debt: (x) => debts.get(x) ?? '',
      account: (x) => acct.get(x) ?? '',
      figure: (code) => String(t(`decide.screens.answer.figureName.${code}` as never)),
    };
  }, [data.categories, data.billChoices, data.debts, accounts.data, t]);
  const said = useMemo<UseSaidOptions>(
    () => ({ currency, today, showCents: rc.showCents, names, monthly: evaluation?.purchase?.monthly ?? null }),
    [currency, today, rc.showCents, names, evaluation]
  );
  const lines = useSaid(result, said);
  // 06.1-44 (C-2): the named items, one row each, and (D-57, C-1) whether quick estimates can count at all.
  const readinessItems = result?.readiness?.items ?? NO_ITEMS;
  const rows = useMemo(() => readinessFixRows(readinessItems, today), [readinessItems, today]);
  const inputsNow = v3.inputs;
  const canUseEstimates = useMemo(() => inputsNow !== null && estimatesCanAnswer(inputsNow), [inputsNow]);
  // 06.1-68 (CB-11, CF-2): rows answered here show at once; they leave when the engine drops them or the answer is taken back.
  const rowIds = useMemo(() => (result === null ? null : rows.map((r) => r.id)), [result, rows]);
  const liveAnswers = v3.v3?.answers;
  const waiverKeys = useMemo(
    () => (liveAnswers === undefined ? NO_KEYS : new Set(liveAnswers.filter((a) => a.kind === 'readiness_waiver').map((a) => a.key))),
    [liveAnswers]
  );
  const householdId = rc.householdId;
  const linePending = useCallback((lineId: string): boolean => householdId !== null && cachedPendingLine(qc, householdId, lineId) !== null, [qc, householdId]);
  const { answered: answeredRows, mark: markAnswered } = useAnsweredRows({ rowIds, waiverKeys, linePending });

  if (step.status === 'not_found' || (step.status === 'ready' && row === null && !checks.isLoading)) return <CheckNotFound />;
  // 06.1-49 (A-ANS-2): no check yet, so no top bar; the loading state, never a blank screen.
  if (step.status === 'loading' || check === null || row === null) return <AnswerLoading />;

  const paydays = engine.paydays();
  const nextPayday = paydays.find((d) => d > today) ?? null;
  const purchase = check.purchaseDate ?? null;
  const when: WhenChoice = purchase === null || purchase <= today ? 'today' : nextPayday !== null && purchase === nextPayday ? 'payday' : 'date';
  const pay: PayMode = check.pay.mode === 'plan' ? 'plan' : 'cash';
  const options: OptionKey[] = [...(check.price === null ? [] : (['later', 'cheaper'] as const)), ...(pay === 'cash' && check.price !== null ? (['installments'] as const) : [])];
  const view: AnswerCheckView = {
    name: row.name,
    priceText: check.price === null ? '' : money(check.price),
    pay,
    when,
    dateText: when === 'date' && purchase !== null ? shortDay(purchase) : null,
    paydayText: nextPayday === null ? null : shortDay(nextPayday),
    purpose: check.purpose,
    options,
    country: v3.inputs?.region ?? rc.region,
    outcome: outcomeOf(row, t, shortMoment),
  };
  // 06.1-66 (CN-11): before the gate is done the frame shows its loading state under the gate, never a blank page.
  const frameStatus = !gated ? 'loading' : engine.status === 'error' ? 'error' : engine.status === 'loading' ? 'loading' : 'ready';
  const offlineDate = gated && !isOnline && engine.status === 'ready' ? fmt.formatDate(result?.recordsAsOf ?? today) : null;

  const edit = (next: (c: CheckV2) => CheckV2): void => {
    step.update(next);
    step.flush();
  };
  const setPurchaseDate = (d: LocalDate | null): void => edit((c) => ({ ...c, purchaseDate: d }));
  // 06.1-68 (from 06.1-57): the plan and its name in one step.update, so one write carries both (L0.plan_name, never a bare key).
  const usePlan = (planPay: Extract<PayV2, { mode: 'plan' }>, planName: string | null = null): void => {
    setSheet(null);
    edit((c) => withPlanName({ ...c, pay: planPay }, planName));
  };
  const closeSheet = (): void => setSheet(null);

  const onAction = (action: AnswerAction): void => {
    switch (action.kind) {
      case 'back':
        leave();
        return;
      case 'newCheck':
        openNewCheck('buy');
        return;
      case 'pay':
        if (action.mode === 'cash') edit((c) => ({ ...c, pay: { mode: 'once' } }));
        else if (check.pay.mode !== 'plan') setSheet('plan');
        return;
      case 'when':
        if (action.when === 'today') setPurchaseDate(null);
        else if (action.when === 'payday') {
          if (nextPayday !== null) setPurchaseDate(nextPayday);
        } else setDatePick({ current: purchase, set: (d) => setPurchaseDate(d) });
        return;
      case 'bought':
        pushOnce(asHref(`/decide/bought/${id}`));
        return;
      case 'saveFor':
        pushOnce(asHref(`/decide/save/${id}`));
        return;
      case 'notBuying':
        if (evaluation !== null && writes.notBuying({ row, evaluation }) !== null) goDecideHome(router);
        return;
      case 'retry':
        engine.refetch();
        return;
      case 'finishSetup':
        pushOnce(asHref('/decide/setup'));
        return;
      case 'deleteCheck': {
        // 06.1-66 (FQ6): the check goes, with one Undo, and the screen returns to Decide home.
        hapticLight();
        const stepId = remove(row);
        showToast({ kind: 'destructive', text: { key: 'decide.screens.common.toast.deleted', params: { item: row.name } }, stepId });
        goDecideHome(router);
        return;
      }
      case 'giveMore':
        setSheet('giveMore');
        return;
      case 'openPast':
        // 06.1-66 (FQ8): a decided check's Past decisions entry has the check's own id.
        pushOnce(asHref(`/decide/past/${id}`));
        return;
      case 'fromEstimates':
        // C-1: reachable only while estimates can count; the card shows no such control otherwise.
        if (!canUseEstimates) return;
        pushOnce(asHref(`/decide/setup/quick-estimates?returnTo=${encodeURIComponent(`/decide/answer/${id}`)}`));
        return;
    }
  };

  const saveWaiver = (rowId: string, waiver: ReadinessWaiver): void => {
    const saved = answers.save({ kind: 'readiness_waiver', waiver, at: today });
    if (saved === null) return;
    markAnswered(rowId, { waiverKey: safeWaiverKey(waiver) });
    hapticLight();
    showToast({ kind: 'ordinary', text: { key: 'decide.screens.answer.notReady.saved' }, stepId: saved.stepId });
  };
  const onReadinessChoice = (fixRow: ReadinessFixRow, choice: WaiverChoice): void => {
    // T-06.1-68-01: one answer per row; its choices are off from the first tap until the engine agrees.
    if (answeredRows.has(fixRow.id)) return;
    if (choice.waiver !== null) {
      saveWaiver(fixRow.id, choice.waiver);
      return;
    }
    // markSkipped: skip the pending line itself when it is cached; otherwise answer the occurrence by its waiver.
    const line = choice.lineId === null || rc.householdId === null ? null : cachedPendingLine(qc, rc.householdId, choice.lineId);
    if (line !== null && rc.userId !== null) {
      const stepId = writes.skipLine(line, rc.userId);
      if (stepId === null) return;
      const by: AnsweredBy = { lineId: line.id };
      markAnswered(fixRow.id, by);
      hapticLight();
      showToast({ kind: 'ordinary', text: { key: 'decide.screens.answer.notReady.saved' }, stepId });
      return;
    }
    const fallback = fallbackWaiver(fixRow.item);
    if (fallback !== null) saveWaiver(fixRow.id, fallback);
  };
  const onReadinessFix = (fixRow: ReadinessFixRow): void => {
    if (fixRow.fix.kind === 'linkEnvelope') {
      if (fixRow.fix.envelopeId !== null) setEnvelopeId(fixRow.fix.envelopeId);
      return;
    }
    // 06.1-71 (FQ10, CN-9): Activity on the item's month, with a banner naming what is missing there.
    pushOnce(asHref(`/activity?month=${fixRow.fix.month}&why=${fixRow.item.kind}`));
  };

  const onOption = (key: OptionKey): void => {
    if (key === 'later') setSheet('later');
    else if (key === 'cheaper') setSheet('cheaper');
    else if (check.pay.mode !== 'plan') setSheet('plan');
  };

  const factValues = (code: string, index: number, all: readonly { code: string }[]): Readonly<Record<string, unknown>> => {
    const nth = all.slice(0, index).filter((l) => l.code === code).length;
    return result?.facts.filter((f) => f.code === code)[nth]?.values ?? {};
  };
  const missingCodes = new Set(lines.missing.map((l) => l.code));
  const factOffset = lines.facts.length;
  const onFactChoice = (choice: FactActionChoice): void => {
    switch (choice.kind) {
      case 'addLimit':
      case 'noOverdraft':
        pushOnce(asHref(choice.accountId === null ? '/accounts' : `/accounts/${choice.accountId}`));
        return;
      case 'addIt':
      case 'setDueDay':
        pushOnce(asHref('/decide/setup/debts'));
        return;
      case 'none': {
        // 06.1-68 (CF-4): the answer shows it landed, with Undo (the flag's own undo step).
        const saved = answered.set({ flag: 'no_debts', on: true });
        if (saved === null) return;
        hapticLight();
        showToast({ kind: 'ordinary', text: { key: 'decide.screens.answer.fact.noneSaved' }, stepId: saved.stepId });
        return;
      }
      case 'changeAnswer': {
        // 06.1-68 (CC-8): the answer is on the check itself, so Undo puts the earlier value back on the check (a local undo).
        const before = check.volatileCover ?? null;
        edit((c) => ({ ...c, volatileCover: c.volatileCover === false }));
        hapticLight();
        showToast({ kind: 'ordinary', text: { key: 'decide.screens.answer.fact.coverChanged' }, onUndo: () => edit((c) => ({ ...c, volatileCover: before })) });
        return;
      }
      case 'unlockNet':
        pushOnce(asHref('/decide/safety-net'));
        return;
      case 'fixMissing':
        if (PRICE_STEP_FIXES.has(choice.code)) pushOnce(withFromAnswer(stepHref(2, id, 'back')));
        else pushOnce(asHref(FIX_ROUTE[choice.code] ?? '/decide/setup'));
        return;
    }
  };
  const renderAfterFact = (line: { code: string; text: string }, index: number): React.ReactNode => {
    const isMissing = index >= factOffset && missingCodes.has(line.code);
    return (
      <FactActions
        code={line.code}
        values={isMissing ? {} : factValues(line.code, index, lines.facts)}
        missing={isMissing}
        item={line.text}
        onChoose={onFactChoice}
      />
    );
  };

  const skippedRaw = check.layerAnswers[KEY_SKIPPED];
  const skipped = (Array.isArray(skippedRaw) ? skippedRaw : []).filter((n): n is ToldStep => n === 1 || n === 2 || n === 3);
  const kind = kindOf(check, row.name);
  const like = countsLikeOf(kind, check);
  const kindLabel =
    kind === null
      ? null
      : kind.startsWith('own:')
        ? (ownKindsOf(check).find((k) => `own:${k.id}` === kind)?.name ?? null)
        : like === null
          ? null
          : String(t(`decide.screens.stepper.kind.${kind as BuiltInKind}` as never));
  const runningMonthly = evaluation?.purchase?.runningMonthly ?? 0;
  const priceLine =
    check.pay.mode === 'plan'
      ? t('decide.screens.answer.told.onPlan', { monthly: money(evaluation?.purchase?.monthly ?? 0) })
      : t('decide.screens.answer.told.upFrontCash', { amount: money(check.price ?? 0) });
  const runningLine = runningMonthly > 0 ? t('decide.screens.answer.told.runningMonthly', { monthly: money(runningMonthly) }) : null;
  const runningValue = runningMonthly > 0 ? t('decide.screens.answer.runningSome', { monthly: money(runningMonthly) }) : t('decide.screens.answer.runningNone');

  // 06.1-67 (CS-5): the count is the number of lines the sheet lists (one helper for both). Answered readiness rows (06.1-68) sit on
  // the Not ready card, which has no More detail rows.
  const giveMoreCount = result === null ? 0 : countGiveMore(lines);
  const country = view.country ?? null;
  const showHelp = result !== null && result.facts.some((f) => f.code === 'free_help') && freeHelpFor(country) !== null;

  const onOpenRow = (rowKey: DetailRow): void => {
    switch (rowKey) {
      case 'running':
        pushOnce(withFromAnswer(stepHref(3, id, 'back')));
        return;
      case 'sideBySide':
        pushOnce(asHref(`/decide/compare/${id}`));
        return;
      default:
        setSheet(rowKey);
    }
  };

  const stopName = (stopId: string): string => {
    const stop = check.replaces?.stops.find((s) => s.id === stopId);
    const typed = lineNamesOf(check)[stopId];
    if (typed !== undefined && typed !== '') return typed;
    if (stop === undefined) return '';
    return stop.source.kind === 'bill' ? names.series?.(stop.source.seriesId) ?? '' : stop.source.categoryId === null ? '' : (names.category?.(stop.source.categoryId) ?? '');
  };
  const inputs = v3.inputs;
  const firstMonth = inputs?.months[0]?.month ?? null;
  const sources = {
    activityFrom: firstMonth === null ? null : `${firstMonth}-01`,
    activityTo: inputs === null ? null : (inputs.recordsAsOf ?? inputs.asOf),
    netSize: inputs?.safetyNet?.size ?? null,
    netLocked: inputs?.safetyNet?.locked ?? true,
    rulesCount: inputs?.limits.lines.length ?? 0,
  };
  const recordsUpTo = result?.recordsAsOf != null ? fmt.formatDate(result.recordsAsOf) : null;
  const accountName = (accounts.data ?? []).find((a) => a.deleted_at == null)?.name ?? '';

  // 06.1-66 (CS-2, DC-1): on every answer, verdict or Not ready, whichever way the check was made; each row opens its step from=answer.
  const told = (
    <WhatYouToldCard
      kindLabel={kindLabel}
      priceLine={priceLine}
      runningLine={runningLine}
      skipped={skipped}
      onEdit={(n) => pushOnce(withFromAnswer(stepHref(n, id, 'back')))}
    />
  );
  // 06.1-66 (FQ5, CS-8): the safety-net question put away unanswered is one line that opens it again.
  const netLine =
    netUnanswered && !netAnsweredHere ? (
      <View testID="answer-net-line">
        <Row label={t('decide.screens.answer.netLine')} chevron onPress={() => setNetOpen(true)} />
      </View>
    ) : null;
  const body =
    result === null ? undefined : isNotReady(result) ? (
      <>
        {netLine}
        {told}
      </>
    ) : (
      <>
        {netLine}
        {told}
        <MoreDetailRows
          runningValue={runningValue}
          showStops={check.replaces != null && (check.replaces.stops.length > 0 || check.replaces.sale != null)}
          giveMoreCount={giveMoreCount}
          showHelp={showHelp}
          showSideBySide={check.price !== null}
          updating={engine.updating}
          onOpen={onOpenRow}
        />
      </>
    );

  return (
    <>
      <AnswerFrame
        check={view}
        evaluation={evaluation}
        status={frameStatus}
        offlineDate={offlineDate}
        said={said}
        onAction={onAction}
        onOption={onOption}
        onCantSee={() => setSheet('about')}
        renderAfterFact={renderAfterFact}
        readinessRows={rows}
        canUseEstimates={canUseEstimates}
        onReadinessFix={onReadinessFix}
        onReadinessChoice={onReadinessChoice}
        updating={engine.updating}
        answeredRows={answeredRows}
      >
        {body}
      </AnswerFrame>

      {/* 06.1-66 (FQ5, CN-11): the gate over the frame's loading state, never on its own. */}
      {!gated ? renderGate(() => setGated(true)) : null}
      {netOpen
        ? renderNetQuestion((answered) => {
            setNetOpen(false);
            if (answered) setNetAnsweredHere(true);
          })
        : null}
      {sheet === 'later' ? (
        <BuyLaterSheet
          currency={currency}
          today={today}
          futures={engine.futures()}
          readyOn={engine.readyDate(0)}
          paydays={paydays}
          judgeOn={engine.judgeOn}
          chosen={purchase}
          onUseDate={(d) => {
            setSheet(null);
            setPurchaseDate(d);
          }}
          onCantSee={() => setSheet('about')}
          onClose={closeSheet}
        />
      ) : null}
      {sheet === 'cheaper' ? (
        <CheaperSheet
          currency={currency}
          price={check.price}
          cheaperPrice={check.value.cheaperPrice}
          useYears={check.value.useYears}
          onCheck={(v) => {
            setSheet(null);
            edit((c) => ({
              ...c,
              price: v.cheaperPrice as CheckV2['price'],
              value: { ...c.value, cheaperPrice: v.cheaperPrice as CheckV2['price'], useYears: v.useYears },
            }));
          }}
          onCantSee={() => setSheet('about')}
          onClose={closeSheet}
        />
      ) : null}
      {sheet === 'fullCost' && evaluation !== null ? (
        <FullCostSheet itemName={row.name} currency={currency} figures={fullCostFigures(evaluation, check)} foreign={check.foreign !== null} onClose={closeSheet} />
      ) : null}
      {sheet === 'monthAfter' && result !== null ? <MonthAfterSheet afterBuy={result.afterBuy} currency={currency} onClose={closeSheet} /> : null}
      {sheet === 'stops' && evaluation !== null && result !== null ? (
        <CostsThatStopSheet
          replaces={check.replaces ?? null}
          runningMonthly={runningMonthly}
          facts={result.facts}
          currency={currency}
          names={{ stop: stopName }}
          onAdd={() => {
            setSheet(null);
            pushOnce(withFromAnswer(stepHref(3, id, 'back')));
          }}
          onClose={closeSheet}
        />
      ) : null}
      {sheet === 'everyDate' && engine.timeline() !== null ? (
        <EveryDateSheet
          timeline={engine.timeline() as NonNullable<ReturnType<typeof engine.timeline>>}
          currency={currency}
          accountName={accountName}
          names={{ series: (x) => names.series?.(x) ?? '', debt: (x) => names.debt?.(x) ?? '' }}
          onClose={closeSheet}
        />
      ) : null}
      {sheet === 'monthByMonth' && result !== null ? (
        <MonthByMonthSheet bars={bars} ahead={aheadMonths(result.afterBuy, engine.futures(), result.code === 'not_yet')} saving={result.code === 'not_yet'} currency={currency} onClose={closeSheet} />
      ) : null}
      {sheet === 'worked' && picture !== null ? <HowWorkedOutSheet picture={picture} currency={currency} sources={sources} recordsUpTo={recordsUpTo} onClose={closeSheet} /> : null}
      {sheet === 'giveMore' && result !== null ? (
        <GiveMoreSheet
          nextStep={lines.nextStep}
          readiness={lines.readiness}
          missing={lines.missing}
          onOpenMissing={(code) => {
            setSheet(null);
            onFactChoice({ kind: 'fixMissing', code });
          }}
          onClose={closeSheet}
        />
      ) : null}
      {/* D-54: an envelope is linked to the account that holds it, never waived. */}
      <EnvelopeAccountSheet goalId={envelopeId ?? ''} visible={envelopeId !== null} onClose={() => setEnvelopeId(null)} setAccount={writes.setEnvelopeAccount} />
      {sheet === 'help' ? <FreeHelpSheet country={country} onClose={closeSheet} /> : null}
      {sheet === 'about' ? <AboutSheet result={result} country={country} said={{ currency, today }} recordsUpTo={recordsUpTo} onClose={closeSheet} /> : null}
      <InstallmentPlanSheet
        visible={gated && sheet === 'plan'}
        check={check}
        currency={currency}
        today={today}
        nextPayday={nextPayday}
        formatMoney={money}
        formatDate={(d) => fmt.formatDate(d)}
        onPickDate={(current, set) => setDatePick({ current, set })}
        onUse={usePlan}
        onDismiss={closeSheet}
      />
      <DatePickerSheet
        visible={datePick !== null}
        check={{ ...check, purchaseDate: datePick?.current ?? check.purchaseDate ?? null }}
        today={today}
        paydays={paydays}
        locale={fmt.locale}
        formatDate={(d) => fmt.formatDate(d)}
        onUse={(d) => {
          datePick?.set(d);
          setDatePick(null);
        }}
        onDismiss={() => setDatePick(null)}
      />
    </>
  );
}
