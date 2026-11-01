// 05.3-34 (DSV-14): builds the engine's RefineInput from the cached reads and runs refine(). Nothing is written here.
// 05.3-80: each card's paid-in-full history is derived from its account's records (cardPaidInFullHistory); a card with no
// linked account has none.
import { useMemo } from 'react';
import { cardPaidInFullHistory, refine, type RefineInput, type RefineResult } from '@/engine/decide/v3';
import { minorUnits } from '@/engine/money';
import { DECIDE_LOOKBACK_MONTHS, useDecideSettings, useDebts, useDecideSnapshot } from '@/data/queries/decide';
import { useChecksV3 } from '@/data/queries/decideCheckV3';
import { useRecordContext } from '@/features/record/useRecordContext';
import { localDayOf } from '../model/localDay';
import { useRegularCandidates } from '../../setup/steps/useRegularCandidates';

export interface RefineState {
  readonly result: RefineResult | null;
  /** True while a stored "Later" date is still in the future. */
  readonly snoozed: boolean;
  /** The engine's as-of date once the inputs are ready. */
  readonly asOf: string | null;
}

/** 'YYYY-MM' of asOf moved back by n months. */
function monthsBack(asOf: string, n: number): string {
  const total = Number(asOf.slice(0, 4)) * 12 + (Number(asOf.slice(5, 7)) - 1) - n;
  return `${String(Math.floor(total / 12)).padStart(4, '0')}-${String((total % 12) + 1).padStart(2, '0')}`;
}

const dateOf = (v: string | null | undefined): string | null => (v === null || v === undefined || v === '' ? null : v.slice(0, 10));

export function useRefine(): RefineState {
  const rc = useRecordContext();
  const settings = useDecideSettings(rc.userId ?? undefined).data ?? null;
  const debts = useDebts(rc.householdId ?? undefined).data;
  const { inputs } = useChecksV3();
  const { rows } = useRegularCandidates();
  const source = useDecideSnapshot().source;

  return useMemo((): RefineState => {
    if (inputs === null) return { result: null, snoozed: false, asOf: null };
    const snoozeUntil = localDayOf(settings?.refine_snooze_until, rc.timeZone);
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
        .map((d) => {
          let paidInFull: readonly boolean[] = [];
          const account = source === null || d.account_id === null ? undefined : source.accounts.find((a) => a.id === d.account_id);
          const balance = source === null || d.account_id === null ? undefined : source.balances[d.account_id];
          if (source !== null && account !== undefined && balance !== undefined) {
            const lines = [...source.rows, ...source.upcomingRows]
              .filter((r) => r.account_id === d.account_id && r.status === 'paid' && r.deleted_at === null && r.original_currency === account.currency)
              .map((r) => ({ date: r.local_date, amount: minorUnits(r.original_amount) }));
            try {
              paidInFull = cardPaidInFullHistory({
                asOf: inputs.asOf,
                balanceNow: minorUnits(balance),
                lines,
                fromMonth: monthsBack(inputs.asOf, DECIDE_LOOKBACK_MONTHS),
              });
            } catch {
              paidInFull = []; // an out-of-range balance hides this card only
            }
          }
          return { debtId: d.id, statedPaysInFull: d.pays_in_full ?? null, paidInFull };
        }),
    };
    return { result: refine(input), snoozed, asOf: inputs.asOf };
  }, [inputs, settings, debts, rows, source, rc.timeZone]);
}
