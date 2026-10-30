// 05.3-34 (DSV-14): the writes behind the review screen. Nothing changes until the user chooses (T-05.3-34-01); a 'keep'
// writes nothing; every update goes through the 05.2 hook the matching setup step uses, so each is one Undo step
// (T-05.3-34-02). Analytics carry kind and choice only (T-05.3-34-03).
import { useCallback, useState } from 'react';
import * as Crypto from 'expo-crypto';
import type { RefineCard } from '@/engine/decide/v3';
import type { UndoLabelKey } from '@/engine/undo';
import { useAddDismissal } from '@/data/mutations/dismissals';
import { useSaveSetupStep } from '@/data/mutations/decideSetup';
import { useConfirmRegularCandidate } from '@/data/mutations/seriesAttributes';
import { useDebts, useDecideSettings, usePots } from '@/data/queries/decide';
import { useRecurringSeries } from '@/data/queries/recurringSeries';
import type { NewRecurringSeries } from '@/db/recurringSeries';
import type { SavingsGoalRow } from '@/db/savingsGoals';
import { undoLabelText } from '@/i18n/undoLabel';
import { getAnalytics } from '@/services/analytics';
import { showToast } from '@/state/undoToast';
import { useRecordContext } from '@/features/record/useRecordContext';
import { openDebtSheet } from '../../setup/debtSheetHost';
import { useRegularCandidates } from '../../setup/steps/useRegularCandidates';
import { setupSheetActions } from '../../setup/steps/setupSheetHost';
import { useUnspent } from '../../setup/useUnspent';
import { cardKey, type RefineDecision, type RefineIntent } from './refineIntents';

export interface RefineChoices {
  choose(card: RefineCard, intent: RefineIntent): void;
  readonly decided: ReadonlyMap<string, RefineDecision>;
  /** The saving bucket the user chose "Change it" on; the screen shows PotSheet for it. */
  readonly pot: SavingsGoalRow | null;
  closePot(): void;
}

export function useRefineChoices(): RefineChoices {
  const rc = useRecordContext();
  const userId = rc.userId ?? '';
  const householdId = rc.householdId ?? '';
  const today = rc.today;
  const saver = useSaveSetupStep(userId); // 05.2-13: setup/steps/EverydayStep.tsx, SteadyStep style settings saves
  const unspent = useUnspent(); // 05.2-28: setup/useUnspent.ts
  const confirmer = useConfirmRegularCandidate(householdId, userId); // 05.2-24: setup/steps/RegularStep.tsx
  const dismisser = useAddDismissal(householdId, userId); // 05.2-24: setup/steps/RegularStep.tsx
  const series = useRecurringSeries(rc.householdId ?? undefined).data;
  const settings = useDecideSettings(rc.userId ?? undefined).data ?? null;
  const debts = useDebts(rc.householdId ?? undefined).data;
  const pots = usePots(rc.userId ?? undefined, rc.householdId ?? undefined).data;
  const { rows: candidates } = useRegularCandidates();

  const [decided, setDecided] = useState<ReadonlyMap<string, RefineDecision>>(new Map());
  const [pot, setPot] = useState<SavingsGoalRow | null>(null);

  const toast = (label: UndoLabelKey, stepId: string | null, name?: string): void => {
    if (stepId !== null) showToast({ kind: 'ordinary', text: undoLabelText(label, name === undefined ? {} : { name }), stepId });
  };

  // True when the choice was applied (or needs nothing); false when it could not be, so the card stays To check.
  const apply = (card: RefineCard): boolean => {
    const suggested = card.suggested === null ? null : Number(card.suggested);
    const seriesRow = card.ref === null ? undefined : (series ?? []).find((s) => s.id === card.ref && s.deleted_at === null);
    // The series edit (05.2) is reached through the setup sheet registry, which the shell host fills in (depcruise).
    const editAmount = (label: 'payUpdated' | 'seriesEdited'): boolean => {
      if (seriesRow === undefined || suggested === null) return false;
      const stepId = setupSheetActions().updateSeriesAmount({ series: seriesRow, amount: suggested, labelKey: label, ownerId: userId, from: today });
      if (stepId === null) return false;
      toast(label, stepId, seriesRow.name);
      return true;
    };
    const saveSettings = (patch: Parameters<typeof saver.save>[0]['patch'], label: UndoLabelKey): boolean => {
      const r = saver.save({ labelKey: label, patch });
      toast(label, r?.stepId ?? null);
      return true;
    };
    switch (card.kind) {
      case 'pay': // 05.2 series edit, 'Pay updated'
        return editAmount('payUpdated');
      case 'series_drift': // 05.2 series edit
        return editAmount('seriesEdited');
      case 'pay_stopped': {
        // User-led: the person pauses the pay, nothing is paused for them until they choose it.
        if (seriesRow === undefined) return false;
        const stepId = setupSheetActions().pauseSeries({ series: seriesRow, from: today, ownerId: userId });
        if (stepId === null) return false;
        toast('seriesPaused', stepId, seriesRow.name);
        return true;
      }
      case 'everyday': // 05.2 EverydayStep: everyday_override + today
        return suggested !== null && saveSettings({ everyday_override: suggested, everyday_override_at: today }, 'setupStepSaved');
      case 'everyday_override_expiring': // re-confirms the typed figure by stamping today
        return card.current !== null && saveSettings({ everyday_override: Number(card.current), everyday_override_at: today }, 'setupStepSaved');
      case 'steady_above_income':
      case 'changing_income': // part of the contract, not emitted yet
        return suggested !== null && saveSettings({ steady_amount: suggested }, 'setupStepSaved');
      case 'unspent': {
        // 05.2-28 useUnspent.confirm adds the held-back money so the engine reads back exactly this figure.
        if (suggested === null) return false;
        const r = unspent.confirm(suggested);
        toast('unspentConfirmed', r?.stepId ?? null);
        return unspent.ready;
      }
      case 'new_regular': {
        const row = candidates.find((c) => c.candidate.key === card.ref);
        if (row === undefined) return false;
        const { candidate } = row;
        if (row.accountId === null) return false;
        const next: NewRecurringSeries = {
          id: Crypto.randomUUID(),
          household_id: householdId,
          account_id: row.accountId,
          name: candidate.name,
          amount: Number(candidate.amount),
          currency: row.currency,
          category_id: row.categoryId,
          payment_type: null,
          freq: row.freq,
          anchor_date: candidate.anchorDate,
          time_zone: rc.timeZone,
          end_date: null,
          occurrence_count: null,
          is_automatic: false,
        };
        const { stepId } = confirmer.confirm({
          series: next,
          direction: candidate.direction,
          linkTransactionIds: candidate.rowIds,
          attributes: candidate.direction === 'in' ? { counts_as: 'available' } : {},
          dismissalToClear: row.dismissal,
        });
        toast('paymentMarkedRegular', stepId, candidate.name);
        return true;
      }
      case 'saving_bucket': {
        // Change it: the pot sheet opens; the sheet makes its own undoable save.
        const found = (pots?.live ?? []).find((p) => p.id === card.ref);
        if (found === undefined) return false;
        setPot(found);
        return true;
      }
      case 'card_not_paid_in_full': {
        const debt = (debts ?? []).find((d) => d.id === card.ref);
        if (debt === undefined) return false;
        openDebtSheet({ mode: 'edit', debt });
        return true;
      }
      case 'under_logged_month': {
        if (card.month === null) return false;
        const marks = { ...(settings?.month_marks ?? {}), [card.month]: 'out' as const };
        return saveSettings({ month_marks: marks }, 'setupStepSaved');
      }
    }
  };

  // The not-regular side of the new_regular card is a dismissal, not an update of a figure.
  const dismiss = (card: RefineCard): boolean => {
    const row = candidates.find((c) => c.candidate.key === card.ref);
    if (row === undefined) return false;
    const { stepId } = dismisser.dismiss({ payeeKey: row.candidate.key, direction: row.candidate.direction, name: row.candidate.name });
    toast('paymentDismissed', stepId, row.candidate.name);
    return true;
  };

  const choose = useCallback(
    (card: RefineCard, intent: RefineIntent): void => {
      // new_regular: "It's regular" (index 0) updates, "Not regular" (index 1) is the keep that records the dismissal.
      const ok = intent === 'update' ? apply(card) : card.kind === 'new_regular' ? dismiss(card) : true;
      if (!ok) return;
      const decision: RefineDecision = intent === 'update' ? 'updated' : 'kept';
      setDecided((prev) => new Map(prev).set(cardKey(card), decision));
      getAnalytics().track('decide_refine_choice', { kind: card.kind, choice: decision === 'updated' ? 'updated' : 'kept' });
    },
    // apply and dismiss close over the hook values above; they are re-created each render on purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [series, candidates, pots, debts, settings, unspent, today, userId, householdId]
  );

  return { choose, decided, pot, closePot: () => setPot(null) };
}

