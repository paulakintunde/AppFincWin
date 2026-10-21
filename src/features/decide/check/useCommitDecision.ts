/**
 * 05-29 (DCU-07, D-09, D-10, D-11, D-35): committing a decision from step 5.
 *
 * Go ahead asks once (ConfirmSheet listing exactly the `writtenLines` the write makes) and then writes through 05-20's
 * `useGoAhead`; Wait and Pass save straight away through `useWaitAndSave` / `usePass`. The categories and the card account
 * 05-20's `buildGoAheadWrite` needs are resolved here BEFORE the confirm opens: when one is missing, Go ahead is unavailable
 * with a one-line reason instead of the builder's defensive throw. The builder itself is the check (a dry run with throwaway
 * ids), so this hook and the real write can never disagree about what is missing.
 */
import { useCallback, useMemo, useState } from 'react';
import { useCategoryLookup } from '@/data/queries/categories';
import { useRecurringSeries } from '@/data/queries/recurringSeries';
import type { DecideCheckRow } from '@/db/decideChecks';
import type { RunningCosts } from '@/engine/decide';
import { useRecordContext } from '@/features/record/useRecordContext';
import { useT } from '@/i18n';
import { showToast } from '@/state/undoToast';
import { hapticMedium } from '@/ui/haptics';
import type { MoneyFormatter } from '@/ui/money/useMoneyFormatter';
import { runningCostCategoryIds, useCommitMutations, type GoAheadAssessment, type GoAheadContext } from './commitMutations';
import { moneyFn } from './steps/stepUi';
import { refText, type Translate } from './refText';
import { writtenLines, type WrittenFacts } from './writtenLines';
import type { CheckComputation, CheckInputs, SnapshotResult } from '../snapshot/types';

type Outcome = NonNullable<CheckInputs['outcome']>;

export interface CommitArgs {
  row: DecideCheckRow | null;
  inputs: CheckInputs;
  computation: CheckComputation | null;
  source: SnapshotResult | null;
  whole: MoneyFormatter;
  exact: MoneyFormatter;
  cashAccounts: readonly { id: string; name: string; balance: number }[];
  investAccounts: readonly { id: string; name: string; currency: string }[];
  /** Leaves the flow for Decide once a commit has been handed to the write queue. */
  onDone: () => void;
}

export interface CommitConfirm {
  visible: boolean;
  /** The sentences the write makes, one per line. */
  lines: string[];
  onConfirm: () => void;
  onCancel: () => void;
}

/** The cash account with the largest balance (A6); the first of equals. */
function largestCash(accounts: CommitArgs['cashAccounts']): string | null {
  let best: CommitArgs['cashAccounts'][number] | null = null;
  for (const a of accounts) if (best === null || a.balance > best.balance) best = a;
  return best === null ? null : best.id;
}

export function useCommitDecision(args: CommitArgs): {
  requestCommit(outcome: Outcome): void;
  /** The i18n key of the one-line reason the chosen outcome cannot be committed yet, or null. */
  blockedKey: string | null;
  confirm: CommitConfirm;
  written: WrittenFacts;
} {
  const { row, inputs, computation, source, whole, exact, cashAccounts, investAccounts, onDone } = args;
  const t = useT() as Translate;
  const rc = useRecordContext();
  const lookup = useCategoryLookup(rc.userId ?? undefined);
  const seriesQuery = useRecurringSeries(rc.householdId ?? undefined);
  const mutations = useCommitMutations();
  const [asking, setAsking] = useState(false);

  const verdict = computation?.verdict ?? null;
  const assessed = verdict !== null && verdict.state !== 'missing' ? verdict : null;
  const logged = computation !== null && computation.status === 'logged';

  const ctx = useMemo<GoAheadContext | null>(() => {
    if (rc.householdId === null || source === null) return null;
    const cashAccountId = inputs.goAccountId ?? largestCash(cashAccounts);
    if (cashAccountId === null) return null;
    const card = inputs.card.accountId === null ? null : (source.cards.find((c) => c.accountId === inputs.card.accountId) ?? null);
    const investAccount =
      inputs.kind === 'invest' && inputs.method === 'lump' && inputs.investAccountId !== null
        ? (investAccounts.find((a) => a.id === inputs.investAccountId && a.currency === source.currency) ?? null)
        : null;
    const replacedIds = new Set(inputs.replaces.map((l) => l.seriesId).filter((id): id is string => id !== null));
    const replacedSeries = (seriesQuery.data ?? []).filter((s) => replacedIds.has(s.id)).map((s) => ({ id: s.id, version: s.version }));
    return {
      householdId: rc.householdId,
      currency: source.currency,
      timeZone: rc.timeZone,
      today: rc.today,
      cashAccountId,
      cardAccountId: card === null ? null : card.accountId,
      debtCategoryId: lookup.builtinIds.get('Debt') ?? null,
      savingsCategoryId: lookup.builtinIds.get('Savings') ?? null,
      transferCategoryId: lookup.transferCategoryId,
      investAccount: investAccount === null ? null : { id: investAccount.id, currency: investAccount.currency },
      replacedSeries,
      runningCostCategoryIds: runningCostCategoryIds(lookup.builtinIds),
    };
  }, [rc.householdId, rc.timeZone, rc.today, source, inputs, cashAccounts, investAccounts, lookup, seriesQuery.data]);

  /** Why Go ahead cannot be written yet: the full-month rule first, then what 05-20's builder would refuse. */
  const goBlocked = useMemo<string | null>(() => {
    if (computation !== null && (computation.status === 'first_read' || computation.status === 'none')) return 'decide.decision.goNeedsMonth';
    if (!logged || assessed === null) return 'decide.decision.goUnavailable';
    if (ctx === null) return 'decide.decision.goNeedsAccount';
    // CR-C04: the series a replaced bill ends are only known once the series list has loaded.
    if (seriesQuery.data === undefined && inputs.replaces.some((l) => l.counted && l.seriesId !== null)) return 'decide.decision.goSeriesLoading';
    if (
      mutations.canWrite({
        inputs,
        assessment: assessed,
        running: computation?.running ?? null,
        ctx,
      })
    )
      return null;
    if (inputs.kind === 'invest' && inputs.method === 'monthly' && ctx.savingsCategoryId === null)
      return 'decide.decision.goNeedsSavingsCategory';
    if (inputs.kind === 'buy' && inputs.method === 'card' && ctx.cardAccountId === null) return 'decide.decision.goNeedsCard';
    if (ctx.debtCategoryId === null) return 'decide.decision.goNeedsDebtCategory';
    return 'decide.decision.goUnavailable';
  }, [logged, assessed, ctx, inputs, computation, mutations, seriesQuery.data]);

  /** What the write will do beyond the inputs, shared with Step 5's "What gets written" so both lists match the write. */
  const written = useMemo<WrittenFacts>(
    () => ({ transferCategoryAvailable: lookup.transferCategoryId !== null, endedSeriesIds: ctx === null ? [] : ctx.replacedSeries.map((s) => s.id) }),
    [lookup.transferCategoryId, ctx]
  );

  const waitBlocked = computation?.waitPlan == null ? 'decide.decision.waitNeedsPlan' : null;
  const blockedKey = inputs.outcome === 'go' ? goBlocked : inputs.outcome === 'wait' ? waitBlocked : null;

  const lines = useMemo<string[]>(() => {
    if (!asking || computation === null || source === null || ctx === null) return [];
    const fmtWhole = moneyFn(whole, source.currency);
    const fmtExact = moneyFn(exact, source.currency);
    const account = cashAccounts.find((a) => a.id === ctx.cashAccountId);
    const into = ctx.investAccount === null ? null : (investAccounts.find((a) => a.id === ctx.investAccount?.id)?.name ?? null);
    const cardName = source.cards.find((c) => c.accountId === ctx.cardAccountId)?.name ?? '';
    return writtenLines({ ...inputs, outcome: 'go' }, computation, {
      fmtWhole,
      fmtExact,
      formatDate: (d) => whole.formatDate(d),
      today: ctx.today,
      accountName: account?.name ?? '',
      cardName,
      investAccountName: into,
      ...written,
    }).map((r) => refText(t, r));
  }, [asking, computation, source, ctx, whole, exact, cashAccounts, investAccounts, inputs, t, written]);

  const cancel = useCallback(() => setAsking(false), []);

  const confirmGo = useCallback((): void => {
    setAsking(false);
    if (row === null || ctx === null || assessed === null || rc.userId === null || goBlocked !== null) return;
    const assessment: GoAheadAssessment = assessed;
    const running: RunningCosts | null = computation?.running ?? null;
    const stepId = mutations.goAhead({
      checkId: row.id,
      ownerId: rc.userId,
      homeCurrency: rc.homeCurrency,
      inputs,
      assessment,
      running,
      ctx,
    });
    hapticMedium();
    showToast({
      kind: 'ordinary',
      text: {
        key: assessed.state === 'fits' ? 'decide.toast.written' : 'decide.toast.writtenBroke',
      },
      stepId,
    });
    onDone();
  }, [row, ctx, assessed, rc.userId, rc.homeCurrency, goBlocked, computation, mutations, inputs, onDone]);

  const requestCommit = useCallback(
    (outcome: Outcome): void => {
      if (row === null || computation === null) return;
      const verdictState = verdict === null ? 'missing' : verdict.state;
      const coolingOff = inputs.coolingOff && verdict !== null && verdict.state !== 'missing' && verdict.size === 'needs_spreading';
      if (outcome === 'go') {
        if (goBlocked === null) setAsking(true);
        return;
      }
      if (outcome === 'wait') {
        const plan = computation.waitPlan;
        if (plan === null || source === null) return;
        hapticMedium();
        void mutations
          .waitAndSave({
            check: row,
            verdict: verdictState,
            currency: source.currency,
            monthlyAmount: plan.monthlyAmount,
            readyBy: plan.readyBy,
            today: rc.today,
            goalTarget: plan.target,
            coolingOff,
          })
          .then((result) => {
            if (result.reminder === 'set' && plan.readyBy !== null) {
              showToast({
                kind: 'ordinary',
                text: {
                  key: 'decide.toast.waitSaved',
                  params: { date: whole.formatDate(plan.readyBy) },
                },
              });
            } else if (result.reminder === 'off') {
              showToast({
                kind: 'ordinary',
                text: { key: 'decide.toast.waitNoNotify' },
              });
            } else {
              showToast({
                kind: 'ordinary',
                text: { key: 'decide.toast.saved' },
              });
            }
          });
        onDone();
        return;
      }
      mutations.pass({ check: row, verdict: verdictState, coolingOff });
      showToast({ kind: 'ordinary', text: { key: 'decide.toast.passed' } });
      onDone();
    },
    [row, computation, verdict, inputs.coolingOff, goBlocked, source, mutations, rc.today, whole, onDone],
  );

  return {
    requestCommit,
    blockedKey,
    confirm: { visible: asking, lines, onConfirm: confirmGo, onCancel: cancel },
    written,
  };
}
