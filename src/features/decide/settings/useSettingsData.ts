/**
 * Plan 05.2-34: the figures Decide settings reads, gathered from the reads that already exist (setup facts, settings,
 * accounts, series, the v3 inputs and evaluation). Reads only; nothing is recomputed that the engine already owns.
 * Returns null until the setup facts are known, so the screen never draws a half-known picture.
 */
import { useMemo } from 'react';
import { useAccounts } from '@/data/queries/accounts';
import { useDecideSettings } from '@/data/queries/decide';
import { useDecideV3 } from '@/data/queries/decideV3';
import { useRecurringSeries } from '@/data/queries/recurringSeries';
import { monthlyEquivalent } from '@/engine/decide';
import { everydayByMonth } from '@/engine/decide/v3';
import { minorUnits } from '@/engine/money';
import { occurrencesBetween } from '@/engine/recurring/schedule';
import { seriesOfKind } from '@/features/income/seriesHelpers';
import { seriesStatusOf } from '@/features/record/entry/seriesStatus';
import { useRecordContext } from '@/features/record/useRecordContext';
import { recordsTypical } from '../setup/steps/EverydayStep';
import type { SetupFacts } from '../setup/setupFlow';
import { useSetupFacts } from '../setup/useSetupFacts';
import type { SettingsData } from './settingsRows';

/** The next pay is searched for up to the end of the year after next (covers a yearly pay). */
const lookaheadEnd = (today: string): string => `${Number(today.slice(0, 4)) + 2}-12-31`;

type SalaryRow = ReturnType<typeof seriesOfKind>[number];
type PickedPay = SalaryRow & { readonly status: 'live' | 'stopped' | 'paused'; readonly from: string | null };

/**
 * N-03: the current pay, never an ended one. A series stopped or paused from a future date still pays until then, so it is
 * current. With no current pay, the stopped or paused one with the latest "from" is returned so the row can say so.
 */
export function pickRegularPay(salary: readonly SalaryRow[], today: string): PickedPay | undefined {
  let fallback: PickedPay | undefined;
  for (const s of salary) {
    const st = seriesStatusOf(s);
    if (st.kind === 'live' || st.from > today) return { ...s, status: 'live', from: null };
    if (fallback === undefined || st.from > (fallback.from ?? '')) fallback = { ...s, status: st.kind, from: st.from };
  }
  return fallback;
}

export interface SettingsScreenData {
  readonly facts: SetupFacts;
  readonly data: SettingsData;
  readonly currency: string;
}

export function useSettingsData(): SettingsScreenData | null {
  const rc = useRecordContext();
  const facts = useSetupFacts();
  const settings = useDecideSettings(rc.userId ?? undefined).data ?? null;
  const accounts = useAccounts(rc.householdId ?? undefined).data;
  const rows = useRecurringSeries(rc.householdId ?? undefined).data;
  const { inputs, evaluation } = useDecideV3();
  const today = rc.today;

  return useMemo((): SettingsScreenData | null => {
    if (facts === null || accounts === undefined || rows === undefined) return null;

    const pay = pickRegularPay(seriesOfKind(rows, 'salary'), today);
    const nextDate =
      pay === undefined
        ? null
        : pay.status !== 'live'
          ? null
          : (occurrencesBetween(
            { anchorDate: pay.anchor_date, freq: pay.freq, endDate: pay.end_date, occurrenceCount: pay.occurrence_count },
            today,
            lookaheadEnd(today),
          )[0]?.date ?? null);

    const v3Series = inputs?.series ?? [];
    const live = (s: { status: string; endDate: string | null }) => s.status === 'live' && (s.endDate === null || s.endDate >= today);
    const savingIds = new Set(v3Series.filter((s) => (s.role === 'saving' || s.role === 'investing') && live(s)).map((s) => s.id));
    const savingRows = rows.filter((r) => savingIds.has(r.id) && r.deleted_at === null);
    // F-06: the v3 series amounts are already converted to the home currency, so a sum across currencies is in one currency.
    const savingAmount = new Map(v3Series.map((s) => [s.id, s.amount]));
    const modes = new Set(savingRows.map((r) => r.saving_mode ?? 'fixed'));
    const buckets = (inputs?.envelopes ?? []).filter((e) => e.bucket === true).length;

    const everydayStored = settings?.everyday_override ?? null;
    let everyday = everydayStored;
    if (everyday === null && inputs !== null) {
      const perMonth = new Map(everydayByMonth(inputs.months, inputs.series).map((e) => [e.month, Number(e.everyday)]));
      everyday = recordsTypical(inputs.months, perMonth, today);
    }

    const accountName = settings?.reserve_account_id != null ? (accounts.find((a) => a.id === settings.reserve_account_id)?.name ?? null) : null;
    const emergencyAmount = inputs?.emergency?.amount != null ? Number(inputs.emergency.amount) : (settings?.reserve ?? null);
    const unspentState = evaluation?.funds.unspent ?? null;

    const data: SettingsData = {
      settings,
      regularPay:
        pay === undefined
          ? null
          : { amount: Math.abs(pay.amount), currency: pay.currency, frequency: pay.freq, nextDate, status: pay.status, from: pay.from },
      otherIncomeCount: v3Series.filter((s) => s.role === 'other_income' && live(s)).length,
      regularConfirmed: v3Series.filter((s) => s.role === 'bill' && s.confirmed && live(s)).length,
      loansCount: (inputs?.debts ?? []).length,
      saving:
        savingRows.length === 0
          ? null
          : {
              monthly: savingRows.reduce((sum, r) => sum + Number(monthlyEquivalent(minorUnits(Math.abs(Number(savingAmount.get(r.id) ?? r.amount))), r.freq)), 0),
              mode: modes.size === 1 ? ((savingRows[0]?.saving_mode ?? 'fixed') as 'fixed' | 'flexible') : null,
              buckets,
            },
      everyday,
      accountUse: { set: facts.moneyAccountIds.filter((id) => facts.accountIdsWithUse.includes(id)).length, total: facts.moneyAccountIds.length },
      emergency: settings?.reserve == null && settings?.reserve_account_id == null ? null : { amount: emergencyAmount, accountName },
      envelopes: {
        amount: (inputs?.envelopes ?? []).reduce((sum, e) => sum + Number(e.saved), 0),
        count: (inputs?.envelopes ?? []).length,
      },
      unspent:
        settings?.unspent_anchor_at == null || settings.unspent_anchor == null
          ? null
          : { amount: unspentState !== null ? Number(unspentState.value) : settings.unspent_anchor, at: settings.unspent_anchor_at },
    };
    return { facts, data, currency: inputs?.currency ?? rc.homeCurrency };
  }, [facts, accounts, rows, inputs, evaluation, settings, today, rc.homeCurrency]);
}
