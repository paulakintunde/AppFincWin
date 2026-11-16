// 08-19: small reads every sharing screen needs about one line: whether a settle-up covers it (D-14, D-15), the split stored
// for it, and which rule a new share starts with (HH-06). No cache keys are added: the stored split is read once per sheet.
import { useEffect, useState } from 'react';
import { useSettlements } from '@/data/queries/householdBalances';
import type { SettlementWithLines } from '@/db/settlements';
import { fetchSplitsForLines, type SplitDefaultRow } from '@/db/transactionSplits';
import type { CategoryRow } from '@/db/rows';
import { supabase } from '@/services/supabase';
import type { SplitRuleKey } from '../components/SplitRuleList';

/** 'settled': a confirmed (or written-off) settle-up covers the line. 'waiting': one is waiting for an answer. Null: open. */
export type LineCover = 'settled' | 'waiting' | null;

export function coverOf(settlements: readonly SettlementWithLines[] | undefined, lineId: string, now: number = Date.now()): LineCover {
  for (const s of settlements ?? []) {
    const line = s.lines.find((l) => l.transaction_id === lineId && l.live);
    if (!line) continue;
    if (s.status === 'confirmed' || s.status === 'written_off') return 'settled';
    // A waiting settle-up past its expiry no longer locks its lines (lazy lapse, D-20).
    if (s.status === 'pending' && (s.expires_at === null || Date.parse(s.expires_at) > now)) return 'waiting';
  }
  return null;
}

export function useLineCover(householdId: string | null | undefined, lineId: string | null | undefined): LineCover {
  const { data } = useSettlements(lineId ? householdId : null);
  return lineId ? coverOf(data, lineId) : null;
}

export interface StoredSplit {
  /** User ids on the line (former members are kept by key). */
  participants: string[];
  /** Positive minor units per participant (the stored share is signed like the line). */
  amounts: Record<string, number>;
}

/** The split stored for one shared line, read once. Null while loading, offline or when the line is not shared. */
export function useStoredSplit(lineId: string | null | undefined, enabled: boolean): StoredSplit | null {
  const [stored, setStored] = useState<StoredSplit | null>(null);
  useEffect(() => {
    if (!lineId || !enabled) return;
    let live = true;
    void fetchSplitsForLines(supabase, [lineId])
      .then((rows) => {
        if (!live) return;
        const participants: string[] = [];
        const amounts: Record<string, number> = {};
        for (const r of [...rows].sort((a, b) => a.position - b.position)) {
          const key = r.member_id ?? r.former_member_key;
          if (key === null) continue;
          participants.push(key);
          amounts[key] = Math.abs(r.share);
        }
        setStored({ participants, amounts });
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [lineId, enabled]);
  return stored;
}

/**
 * The rule a new share starts with: the category's default if the household set one, else the household default, else Even
 * (HH-06). 'mine' as a default is not a way of sharing, so a line being shared starts at Even.
 */
export function defaultRuleFor(
  defaults: readonly SplitDefaultRow[] | undefined,
  category: Pick<CategoryRow, 'id' | 'builtin_key'> | undefined,
): SplitRuleKey {
  const ref = category ? (category.builtin_key ? `builtin:${category.builtin_key}` : `custom:${category.id}`) : null;
  const byCategory = ref !== null ? defaults?.find((d) => d.category_ref === ref) : undefined;
  const household = defaults?.find((d) => d.category_ref === null);
  const rule = (byCategory ?? household)?.rule ?? 'even';
  return rule === 'mine' ? 'even' : rule;
}
