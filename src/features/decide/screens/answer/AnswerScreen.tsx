// 06.1-23 (UX-03, UX-06, UX-07, UX-16, UX-23, FIN-29, APP-01, CMP-F03, CO-D-38, CO-D-43, CO-D-124, UX-33, CO-D-35): the one answer
// route body behind every answer board. It loads the stored check, waits for the first-answer gate (FirstAnswerGateBound, passed in
// by the shell because the gate's write may not be imported from features/decide), judges through useCheckEngine and renders the
// AnswerFrame with the More-detail rows, "What you told Decide", the fact action buttons and every detail and info sheet. Pay mode
// and date change in place on the stored draft; nothing navigates. Offline it answers from the cached records with "Records up to";
// an error shows no figure.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { router, type Href } from 'expo-router';
import { useCreateCheck, useMarkCheckSeen } from '@/data/mutations/decideChecks';
import { useRecordCheckHistory } from '@/data/mutations/decideHistory';
import { useSetDecideAnswered } from '@/data/mutations/decideSetup';
import { useAccounts } from '@/data/queries/accounts';
import { useDecideChecks } from '@/data/queries/decide';
import { useDecideV3 } from '@/data/queries/decideV3';
import { useSyncStatus } from '@/data/sync/useSyncStatus';
import type { DecideCheckRow } from '@/db/decideChecks';
import { freeHelpFor, type CheckV2, type Evaluation, type LocalDate, type PayV2 } from '@/engine/decide/v3';
import { money as makeMoney } from '@/engine/money';
import { CheckNotFound } from '@/features/decide/screens/ui/CheckNotFound';
import { openNewCheck } from '@/features/decide/home/checkHref';
import { useRecordContext } from '@/features/record/useRecordContext';
import { useT } from '@/i18n';
import { pushOnce } from '@/shell/navigation/pushOnce';
import { useMoneyFormatter } from '@/ui/money/useMoneyFormatter';
import { useCheckEngine } from '../engine/useCheckEngine';
import { useMonthPicture } from '../engine/useMonthPicture';
import { DatePickerSheet } from '../sheets/DatePickerSheet';
import { InstallmentPlanSheet } from '../sheets/InstallmentPlanSheet';
import { KEY_SKIPPED, countsLikeOf, kindOf, lineNamesOf, ownKindsOf, stepHref, useStepCheck, useStepData, type BuiltInKind } from '../check/useStepCheck';
import { AnswerFrame, type AnswerAction, type AnswerCheckView } from './AnswerFrame';
import type { PayMode, WhenChoice } from './AnswerTopBar';
import { FactActions, type FactActionChoice } from './FactActions';
import { MoreDetailRows, type DetailRow } from './MoreDetailRows';
import type { OptionKey } from './OptionChips';
import { useAnswerEffects } from './useAnswerEffects';
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
}

export interface AnswerScreenProps {
  id: string;
  /** A side picked on the compare screen: 'cash' judges as paid once, 'installments' opens the plan. */
  side?: 'cash' | 'installments' | null;
  /** The first-answer gate (shell/decide/FirstAnswerGateBound); it calls onDone at once when nothing is left to ask. */
  renderGate: (onDone: () => void) => React.ReactNode;
  writes: AnswerWrites;
}

const NO_ROWS: readonly DecideCheckRow[] = [];
const asHref = (path: string): Href => path as Href;

function leave(): void {
  if (router.canGoBack()) router.back();
  else router.replace(asHref('/decide'));
}

export function AnswerScreen({ id, side = null, renderGate, writes }: AnswerScreenProps) {
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
  const sync = useSyncStatus();
  const accounts = useAccounts(rc.householdId ?? undefined);
  const { markSeen } = useMarkCheckSeen();
  const history = useRecordCheckHistory(rc.userId ?? '');
  const answered = useSetDecideAnswered(rc.userId ?? '');

  const [gated, setGated] = useState(false);
  // An installments side from the compare screen opens the plan sheet on arrival.
  const [sheet, setSheet] = useState<SheetKey | null>(side === 'installments' ? 'plan' : null);
  const [datePick, setDatePick] = useState<{ current: LocalDate | null; set: (d: LocalDate) => void } | null>(null);
  const evaluation = engine.evaluation;
  const result = engine.status === 'ready' && evaluation !== null ? evaluation.result : null;
  const currency = data.currency;
  const today = data.today as LocalDate;
  const money = useCallback((minor: number): string => fmt.formatMoney(makeMoney(minor, currency)), [fmt, currency]);

  // D-14: the safety-net question and intro come before any verdict. Hooks above run either way; the verdict mounts after.
  useAnswerEffects({
    row,
    result: gated ? result : null,
    writes: { markSeen, recordHistory: (a) => history.mutate(a) },
  });

  // A cash side picked on the compare screen, applied once.
  const sideDone = useRef(false);
  useEffect(() => {
    if (sideDone.current || side === null || check === null || !gated) return;
    sideDone.current = true;
    if (side === 'cash' && check.pay.mode === 'plan') {
      step.update((c) => ({ ...c, pay: { mode: 'once' } }));
      step.flush();
    }
  }, [side, check, gated, step]);

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

  if (step.status === 'not_found' || (step.status === 'ready' && row === null && !checks.isLoading)) return <CheckNotFound />;
  if (step.status === 'loading' || check === null || row === null) return null;
  if (!gated) return <>{renderGate(() => setGated(true))}</>;

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
    dateText: when === 'date' && purchase !== null ? fmt.formatDate(purchase) : null,
    purpose: check.purpose,
    options,
    country: v3.inputs?.region ?? rc.region,
  };
  const frameStatus = engine.status === 'error' ? 'error' : engine.status === 'loading' ? 'loading' : 'ready';
  const offlineDate = !sync.isOnline && engine.status === 'ready' ? fmt.formatDate(result?.recordsAsOf ?? today) : null;

  const edit = (next: (c: CheckV2) => CheckV2): void => {
    step.update(next);
    step.flush();
  };
  const setPurchaseDate = (d: LocalDate | null): void => edit((c) => ({ ...c, purchaseDate: d }));
  const usePlan = (planPay: Extract<PayV2, { mode: 'plan' }>): void => {
    setSheet(null);
    edit((c) => ({ ...c, pay: planPay }));
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
        if (evaluation !== null && writes.notBuying({ row, evaluation }) !== null) router.replace(asHref('/decide'));
        return;
      case 'retry':
        engine.refetch();
        return;
      case 'finishSetup':
        pushOnce(asHref('/decide/setup'));
        return;
      case 'fromEstimates':
        pushOnce(asHref(`/decide/setup/quick-estimates?returnTo=${encodeURIComponent(`/decide/answer/${id}`)}`));
        return;
    }
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
      case 'none':
        answered.set({ flag: 'no_debts', on: true });
        return;
      case 'changeAnswer':
        edit((c) => ({ ...c, volatileCover: c.volatileCover === false }));
        return;
      case 'unlockNet':
        pushOnce(asHref('/decide/safety-net'));
        return;
      case 'fixMissing':
        if (PRICE_STEP_FIXES.has(choice.code)) pushOnce(stepHref(2, id, 'back'));
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

  // D21: the check came through the stepper when it carries the stepper's keys.
  const throughStepper = check.layerAnswers[KEY_SKIPPED] !== undefined;
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
  const runningLine = runningMonthly > 0 ? t('decide.screens.answer.told.runningMonthly', { monthly: money(runningMonthly) }) : t('decide.screens.answer.told.runningNone');
  const runningValue = runningMonthly > 0 ? t('decide.screens.answer.runningSome', { monthly: money(runningMonthly) }) : t('decide.screens.answer.runningNone');

  const giveMoreCount = result === null ? 0 : (result.confidence.nextStep !== null ? 1 : 0) + lines.missing.length + lines.readiness.length;
  const country = view.country ?? null;
  const showHelp = result !== null && result.facts.some((f) => f.code === 'free_help') && freeHelpFor(country) !== null;

  const onOpenRow = (rowKey: DetailRow): void => {
    switch (rowKey) {
      case 'running':
        pushOnce(stepHref(3, id, 'back'));
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

  const body =
    result === null || result.readiness?.ready === false ? undefined : (
      <>
        {throughStepper ? (
          <WhatYouToldCard
            kindLabel={kindLabel}
            priceLine={priceLine}
            runningLine={runningLine}
            skipped={skipped}
            onEdit={(n) => pushOnce(stepHref(n, id, 'back'))}
          />
        ) : null}
        <MoreDetailRows
          runningValue={runningValue}
          showStops={check.replaces != null && (check.replaces.stops.length > 0 || check.replaces.sale != null)}
          giveMoreCount={giveMoreCount}
          showHelp={showHelp}
          showSideBySide={check.price !== null}
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
      >
        {body}
      </AnswerFrame>

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
            pushOnce(stepHref(3, id, 'back'));
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
      {sheet === 'help' ? <FreeHelpSheet country={country} onClose={closeSheet} /> : null}
      {sheet === 'about' ? <AboutSheet result={result} country={country} said={{ currency, today }} recordsUpTo={recordsUpTo} onClose={closeSheet} /> : null}
      <InstallmentPlanSheet
        visible={sheet === 'plan'}
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
