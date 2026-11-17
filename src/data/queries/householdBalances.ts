// 08-15 (HH-07, D-23): who owes whom, read from the stored splits and the live settle-up lines, then worked out by the
// engine's pairBalances. Nothing here recomputes a share from today's weights (D-35): a share is what was stored when the
// line was shared. Owed money is a separate figure and never joins spendable money (ENG-25).
import { useQuery } from '@tanstack/react-query';
import { fetchJointAccountIds } from '@/db/accounts';
import {
  fetchOpenSharedLines,
  fetchSplitDefaults,
  fetchSplitsForLines,
  type SharedLineRow,
  type SplitRow,
} from '@/db/transactionSplits';
import { fetchLiveSettlementLines, fetchMySettlements, type LiveSettlementLine } from '@/db/settlements';
import { owedToMeTotal, pairBalances, type PairBalance, type SharedLineForBalance } from '@/engine/household/balances';
import { minorUnits, type MinorUnits } from '@/engine/money/types';
import { supabase } from '@/services/supabase';
import { queryKeys } from '../keys';
import { splitsByLineOf, type SplitsByLine } from './figureScope';

/** What one read of the household's shared lines returns. Plain data only, so the persisted cache can hold it. */
export interface BalanceInputs {
  lines: SharedLineRow[];
  splits: SplitRow[];
  live: LiveSettlementLine[];
  jointAccountIds: string[];
}

/** The payer of a line: paid_by, else the former key stamped when their account was deleted, else the creator (08-14). */
export function payerKeyOf(line: Pick<SharedLineRow, 'paid_by' | 'paid_by_former_key' | 'created_by'>): string | null {
  return line.paid_by ?? line.paid_by_former_key ?? line.created_by ?? null;
}

/** Where a live settle-up leaves its lines: written off, settled, still waiting (and not past day 14), or open again. */
function lineStatus(live: LiveSettlementLine | undefined, now: number): Pick<SharedLineForBalance, 'status' | 'pendingSettlementId'> {
  const s = live?.settlement;
  if (!live || !s) return { status: 'open', pendingSettlementId: null };
  if (s.status === 'written_off') return { status: 'written_off', pendingSettlementId: null };
  if (s.status === 'confirmed') return { status: 'settled', pendingSettlementId: null };
  // A waiting settle-up past its expiry no longer locks its lines (D-20, lazy lapse): the lines are owed again.
  if (s.status === 'pending' && (s.expires_at === null || Date.parse(s.expires_at) > now)) {
    return { status: 'pending', pendingSettlementId: live.settlement_id };
  }
  return { status: 'open', pendingSettlementId: null };
}

/**
 * Maps stored lines, splits and live settle-ups into the engine's input. Stored shares are signed like the line (an expense is
 * negative), so what a person owes is the negated share, the same sign the server's hh_pair_owed uses. A line with no known
 * payer or no splits is left out: nothing can be owed on it. Joint-account lines are kept and flagged: the engine skips them.
 */
export function toBalanceLines(inputs: BalanceInputs, now: number = Date.now()): SharedLineForBalance[] {
  const joint = new Set(inputs.jointAccountIds);
  const byLine = new Map<string, SplitRow[]>();
  for (const s of inputs.splits) {
    const list = byLine.get(s.transaction_id);
    if (list) list.push(s);
    else byLine.set(s.transaction_id, [s]);
  }
  const liveByLine = new Map<string, LiveSettlementLine>();
  for (const l of inputs.live) if (l.live) liveByLine.set(l.transaction_id, l);

  const out: SharedLineForBalance[] = [];
  for (const line of inputs.lines) {
    const payerKey = payerKeyOf(line);
    const splits = byLine.get(line.id);
    if (payerKey === null || !splits || splits.length === 0) continue;
    const shares: { memberKey: string; amount: MinorUnits }[] = [];
    for (const s of splits) {
      const memberKey = s.member_id ?? s.former_member_key;
      if (memberKey === null) continue;
      shares.push({ memberKey, amount: minorUnits(s.share === 0 ? 0 : -s.share) });
    }
    out.push({
      lineId: line.id,
      payerKey,
      paidFromJoint: joint.has(line.account_id),
      ...lineStatus(liveByLine.get(line.id), now),
      shares,
    });
  }
  return out;
}

export interface HouseholdBalances {
  /** One entry per person the viewer has an open balance with, by key (user id, or former key once deleted). */
  pairs: readonly PairBalance[];
  /** Sum of what others owe the viewer. Separate from spendable money (ENG-25). */
  owedToMe: MinorUnits;
}

export function computeBalances(inputs: BalanceInputs, viewerId: string, now: number = Date.now()): HouseholdBalances {
  const pairs = pairBalances(toBalanceLines(inputs, now), viewerId);
  return { pairs, owedToMe: owedToMeTotal(pairs) };
}

/** One line behind a balance, for the pair sheet (D-23: every number traces to lines). */
export interface PairLine {
  line: SharedLineRow;
  /** Positive: the other person owes the viewer for this line. Negative: the viewer owes them. */
  signed: MinorUnits;
  status: SharedLineForBalance['status'];
  pendingSettlementId: string | null;
}

export function computePairLines(inputs: BalanceInputs, viewerId: string, otherKey: string, now: number = Date.now()): PairLine[] {
  const balance = computeBalances(inputs, viewerId, now).pairs.find((p) => p.otherKey === otherKey);
  if (!balance) return [];
  const wanted = new Set(balance.lineIds);
  const byId = new Map(inputs.lines.map((l) => [l.id, l] as const));
  const out: PairLine[] = [];
  for (const bl of toBalanceLines(inputs, now)) {
    if (!wanted.has(bl.lineId) || bl.paidFromJoint) continue;
    const line = byId.get(bl.lineId);
    if (!line) continue;
    let signed = 0;
    for (const s of bl.shares) {
      if (s.memberKey === bl.payerKey) continue;
      if (bl.payerKey === viewerId && s.memberKey === otherKey) signed += s.amount;
      else if (s.memberKey === viewerId && bl.payerKey === otherKey) signed -= s.amount;
    }
    out.push({ line, signed: minorUnits(signed), status: bl.status, pendingSettlementId: bl.pendingSettlementId });
  }
  return out;
}

async function loadBalanceInputs(householdId: string): Promise<BalanceInputs> {
  const lines = await fetchOpenSharedLines(supabase, householdId);
  const ids = lines.map((l) => l.id);
  const [splits, live, jointAccountIds] = await Promise.all([
    fetchSplitsForLines(supabase, ids),
    fetchLiveSettlementLines(supabase, ids),
    fetchJointAccountIds(supabase, householdId),
  ]);
  return { lines, splits, live, jointAccountIds };
}

function balanceQuery(householdId: string | null | undefined) {
  return {
    // Under ['transactions', householdId], so any transaction write or settle-up call refreshes it.
    queryKey: queryKeys.householdBalances(householdId ?? ''),
    queryFn: () => loadBalanceInputs(householdId as string),
    enabled: Boolean(householdId),
  };
}

/** Who owes whom for the viewer, from the engine over stored splits and live settle-up lines (HH-07, D-23). */
export function useHouseholdBalances(householdId: string | null | undefined, viewerId: string | null | undefined) {
  return useQuery({
    ...balanceQuery(householdId),
    enabled: Boolean(householdId) && Boolean(viewerId),
    select: (inputs: BalanceInputs): HouseholdBalances => computeBalances(inputs, viewerId as string),
  });
}

/**
 * 08-25 (HH-09): the stored splits of the household's shared lines, by line, from the same cached read as the balances (one
 * fetch, one key). Mine figures read the viewer's share from these; enabled only when some row on screen needs them.
 */
export function useSharedSplits(householdId: string | null | undefined, enabled: boolean) {
  return useQuery({
    ...balanceQuery(householdId),
    enabled: Boolean(householdId) && enabled,
    select: selectSplitsByLine,
  });
}

function selectSplitsByLine(inputs: BalanceInputs): SplitsByLine {
  return splitsByLineOf(inputs.splits);
}

/** The lines behind one pair's balance (the pair sheet). `otherKey` is a user id, or a former key once deleted. */
export function usePairLines(householdId: string | null | undefined, viewerId: string | null | undefined, otherKey: string | null | undefined) {
  return useQuery({
    ...balanceQuery(householdId),
    enabled: Boolean(householdId) && Boolean(viewerId) && Boolean(otherKey),
    select: (inputs: BalanceInputs): PairLine[] => computePairLines(inputs, viewerId as string, otherKey as string),
  });
}

/** The household's split rules: the default and one per category (08-10). */
export function useSplitDefaults(householdId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.splitDefaults(householdId ?? ''),
    queryFn: () => fetchSplitDefaults(supabase, householdId as string),
    enabled: Boolean(householdId),
  });
}

/** The settle-ups the caller is a party to, newest first, with their lines. */
export function useSettlements(householdId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.settlements(householdId ?? ''),
    queryFn: () => fetchMySettlements(supabase, householdId as string),
    enabled: Boolean(householdId),
  });
}
