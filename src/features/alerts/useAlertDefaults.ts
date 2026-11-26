// 10-22 (ALR-02, D-10, D-12): suggested large and low amounts from the person's own last three months. The maths is
// engine/alerts; this hook only gathers paid outflows in the home currency.
import { useCallback, useMemo, useRef } from 'react';
import { suggestAlertAmounts, type AlertSpendLine, type SuggestedAmounts } from '@/engine/alerts';
import { minorUnits, resolveExponent } from '@/engine/money';
import { useTransactionsForMonth } from '@/data/queries/transactions';
import { useFxLatest } from '@/data/queries/fxLatest';
import { useAlertSettings } from '@/data/queries/alerts';
import { useSaveAlertSetting } from '@/data/mutations/alertSettings';
import { homeAmountFor, latestPerEur } from '@/data/queries/homeAmount';
import type { FxLatestRow, TransactionRow } from '@/db/rows';
import { useRecordContext } from '@/features/record/useRecordContext';

/** The month n steps before `month` ('YYYY-MM'). */
export function monthsBack(month: string, n: number): string {
  const [y = 1970, m = 1] = month.split('-').map(Number);
  const idx = y * 12 + (m - 1) - n;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`;
}

type Line = Pick<
  TransactionRow,
  'status' | 'transfer_id' | 'is_refund' | 'original_amount' | 'original_currency' | 'orig_per_eur' | 'home_amount' | 'home_currency' | 'local_date'
> & { is_settlement?: boolean; deleted_at?: string | null };

/** Paid outflows only: no transfers, refunds or settlements. Amounts in the home currency; a row with no rate yet is left out. */
export function spendLines(rows: readonly Line[], home: string, rates: readonly FxLatestRow[]): AlertSpendLine[] {
  const out: AlertSpendLine[] = [];
  for (const r of rows) {
    if (r.status !== 'paid' || r.transfer_id !== null || r.is_refund || r.is_settlement === true || r.deleted_at) continue;
    if (r.original_amount >= 0) continue;
    const amount = homeAmountFor(r, home, rates);
    if (amount === null || amount >= 0) continue;
    out.push({ magnitude: minorUnits(Math.abs(amount)), localDate: r.local_date });
  }
  return out;
}

export interface AlertDefaults {
  suggested: SuggestedAmounts;
  homeCurrency: string;
  /** D-12: a household member gets a saved (off) large threshold row so partner alerts use their own amount. Saved once. */
  ensurePartnerThreshold(): void;
}

export function useAlertDefaults(userId?: string): AlertDefaults {
  const ctx = useRecordContext();
  const home = ctx.homeCurrency;
  const thisMonth = ctx.today.slice(0, 7);
  const hid = ctx.householdId ?? undefined;
  const m0 = useTransactionsForMonth(hid, thisMonth).data;
  const m1 = useTransactionsForMonth(hid, monthsBack(thisMonth, 1)).data;
  const m2 = useTransactionsForMonth(hid, monthsBack(thisMonth, 2)).data;
  const m3 = useTransactionsForMonth(hid, monthsBack(thisMonth, 3)).data;
  const rates = useFxLatest().data;
  const settings = useAlertSettings(userId).data;
  const { saveAlertSetting } = useSaveAlertSetting();

  const suggested = useMemo(() => {
    const rows = [...(m0 ?? []), ...(m1 ?? []), ...(m2 ?? []), ...(m3 ?? [])] as Line[];
    const list = rates ?? [];
    return suggestAlertAmounts({
      expenses: spendLines(rows, home, list),
      today: ctx.today,
      homeCurrency: home,
      homeExponent: resolveExponent(home),
      homePerEur: latestPerEur(list, home),
    });
  }, [m0, m1, m2, m3, rates, home, ctx.today]);

  const saved = useRef(false);
  const ensurePartnerThreshold = useCallback(() => {
    if (saved.current || !userId || !hid || !settings) return;
    const large = settings.find((s) => s.kind === 'large_txn');
    if (!large || large.thresholdMinor !== null) return;
    saved.current = true;
    saveAlertSetting({
      userId,
      setting: { kind: 'large_txn', enabled: false, thresholdMinor: suggested.large.minor, thresholdCurrency: home, leadDays: null },
      baseVersion: large.version,
    });
  }, [userId, hid, settings, suggested, home, saveAlertSetting]);

  return { suggested, homeCurrency: home, ensurePartnerThreshold };
}
