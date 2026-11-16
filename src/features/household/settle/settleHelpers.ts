// 08-21: small pure helpers and one hook shared by the settle-up screens. Amounts are minor units of the household
// currency (the server stores and compares them in that currency); an account in another currency gets the rate line.
import { useCallback, useMemo } from 'react';
import type { SharedLineForBalance } from '@/engine/household/balances';
import { money } from '@/engine/money';
import { minorUnits } from '@/engine/money/types';
import type { PairLine } from '@/data/queries/householdBalances';
import { useAccounts } from '@/data/queries/accounts';
import type { AccountRow } from '@/db/rows';
import type { SettlementWithLines } from '@/db/settlements';
import { householdReasonKeyOrGeneric } from '@/ui/failedWriteLabels';
import { useT } from '@/i18n';
import { useMoneyFormatter } from '@/ui/money/useMoneyFormatter';
import { useHouseholdScope } from '../useHouseholdScope';

/**
 * A traced pair line as the engine's input. `signed` is from the viewer's side (positive: the other person owes the
 * viewer), so the payer is the viewer when it is positive and the other person when it is negative, and the one share is
 * the debtor's. settleUpTotal then nets exactly the ticked open lines.
 */
export function pairLineToBalanceLine(p: PairLine, viewerId: string, otherKey: string): SharedLineForBalance {
  const owedToViewer = p.signed > 0;
  return {
    lineId: p.line.id,
    payerKey: owedToViewer ? viewerId : otherKey,
    paidFromJoint: false,
    status: p.status,
    pendingSettlementId: p.pendingSettlementId,
    shares: [{ memberKey: owedToViewer ? otherKey : viewerId, amount: minorUnits(Math.abs(p.signed)) }],
  };
}

/** True when the settle-up was recorded within the last 24 hours (the Undo window, D-42). */
export function withinUndoWindow(s: Pick<SettlementWithLines, 'confirmed_at'>, now: number = Date.now()): boolean {
  if (!s.confirmed_at) return false;
  const at = Date.parse(s.confirmed_at);
  return Number.isFinite(at) && now - at < 24 * 60 * 60 * 1000;
}

/** A waiting settle-up that has not passed day 14 (the lazy lapse, D-20). */
export function isWaiting(s: Pick<SettlementWithLines, 'status' | 'expires_at'>, now: number = Date.now()): boolean {
  return s.status === 'pending' && (s.expires_at === null || Date.parse(s.expires_at) > now);
}

export interface SettleMoney {
  currency: string;
  /** "$42.00" for minor units of the household currency. */
  fmt: (minor: number) => string;
  /** The viewer's own accounts: not archived. (Tombstones never reach the list.) */
  myAccounts: AccountRow[];
  formatDate: (localDate: string) => string;
  online: boolean;
  userId: string | null;
  householdId: string | null;
}

export function useSettleMoney(): SettleMoney {
  const scope = useHouseholdScope();
  const { formatMoney, formatDate } = useMoneyFormatter(true);
  const currency = scope.household?.reporting_currency ?? 'USD';
  const accounts = useAccounts(scope.householdId ?? undefined).data;
  const myAccounts = useMemo(
    () => (accounts ?? []).filter((a) => a.created_by === scope.userId && a.archived_at === null),
    [accounts, scope.userId],
  );
  const fmt = useCallback((minor: number): string => formatMoney(money(minor, currency)), [formatMoney, currency]);
  const fmtDate = useCallback(
    (d: string): string => {
      try {
        return formatDate(d, 'short');
      } catch {
        return d;
      }
    },
    [formatDate],
  );
  return { currency, fmt, myAccounts, formatDate: fmtDate, online: scope.online, userId: scope.userId, householdId: scope.householdId };
}

/** Words for a refused settle-up call (offline and every server reason). Never a raw code. */
export function useRefusalText(): (reason: string) => string {
  const t = useT();
  return useCallback(
    (reason: string) => (t as (key: string) => string)(householdReasonKeyOrGeneric(reason)),
    [t],
  );
}
