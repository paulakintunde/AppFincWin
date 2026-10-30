// 05.3-34 (DSV-14): builds the engine's RefineInput from the cached reads and runs refine(). Nothing is written here.
// Known gap, recorded in the summary: the app stores no per-statement "paid in full" history, so cardStatements carries
// each card's stated habit with no history and the card-not-paid-in-full card cannot fire from this hook yet.
import { useMemo } from 'react';
import { refine, type RefineInput, type RefineResult } from '@/engine/decide/v3';
import { minorUnits } from '@/engine/money';
import { useDecideSettings, useDebts } from '@/data/queries/decide';
import { useChecksV3 } from '@/data/queries/decideCheckV3';
import { useRecordContext } from '@/features/record/useRecordContext';
import { useRegularCandidates } from '../../setup/steps/useRegularCandidates';

export interface RefineState {
  readonly result: RefineResult | null;
  /** True while a stored "Later" date is still in the future. */
  readonly snoozed: boolean;
  /** The engine's as-of date once the inputs are ready. */
  readonly asOf: string | null;
}

const dateOf = (v: string | null | undefined): string | null => (v === null || v === undefined || v === '' ? null : v.slice(0, 10));

export function useRefine(): RefineState {
  const rc = useRecordContext();
  const settings = useDecideSettings(rc.userId ?? undefined).data ?? null;
  const debts = useDebts(rc.householdId ?? undefined).data;
  const { inputs } = useChecksV3();
  const { rows } = useRegularCandidates();

  return useMemo((): RefineState => {
    if (inputs === null) return { result: null, snoozed: false, asOf: null };
    const snoozeUntil = dateOf(settings?.refine_snooze_until);
    const snoozed = snoozeUntil !== null && inputs.asOf < snoozeUntil;
    const input: RefineInput = {
      inputs,
      setupDoneAt: dateOf(settings?.setup_done_at),
      setupRough: settings?.rough_as_of != null,
      overrideAt: dateOf(settings?.everyday_override_at),
      lastAt: dateOf(settings?.refine_last_at),
      snoozeUntil,
      candidates: rows
        .filter((r) => r.state === 'unmarked')
        .map((r) => ({ key: r.candidate.key, occurrences: r.candidate.rowIds.length, amount: minorUnits(Number(r.candidate.amount)) })),
      cardStatements: (debts ?? [])
        .filter((d) => d.deleted_at === null && d.kind === 'card')
        .map((d) => ({ debtId: d.id, statedPaysInFull: d.pays_in_full ?? null, paidInFull: [] as readonly boolean[] })),
    };
    return { result: refine(input), snoozed, asOf: inputs.asOf };
  }, [inputs, settings, debts, rows]);
}
