// 10.1-27 (D-14): who can be given an item on a shared line's scan review. The household's members (in member order, the order
// the split-by-item RPC gets) with the names the viewer sees, the people of the line's usual split (the stored split, or every
// member until it has loaded or when it cannot be read), and the line's rule for "Split {rule} as usual". Null on a private
// line, when split by item is off, or until the members have loaded; the review then shows no people controls.
import { useMemo } from 'react';
import { useHouseholdMembers } from '@/data/queries/household';
import type { TransactionRow } from '@/db/rows';
import { useMemberLabel } from '@/features/household/useMemberLabel';
import { useStoredSplit } from '@/features/household/sharing/sharedLineState';
import type { ReviewMember } from './scanModel';

export type ScanRule = 'even' | 'weight' | 'amount' | 'mine';

export interface ScanPeople {
  members: ReviewMember[];
  usual: string[];
  rule: ScanRule;
}

export function useScanPeople(line: TransactionRow | undefined, householdId: string, enabled: boolean): ScanPeople | null {
  const on = enabled && line !== undefined && line.is_shared === true;
  const members = useHouseholdMembers(on ? householdId : null).data;
  const label = useMemberLabel(on ? householdId : null);
  const stored = useStoredSplit(line?.id, on);
  const rule: ScanRule = line?.split_rule ?? 'even';
  return useMemo(() => {
    if (!on || !members || members.length === 0) return null;
    const list = members.map((m) => ({ id: m.user_id, name: label(m.user_id) }));
    const known = new Set(list.map((m) => m.id));
    const fromStored = (stored?.participants ?? []).filter((id) => known.has(id));
    return { members: list, usual: fromStored.length > 0 ? fromStored : list.map((m) => m.id), rule };
  }, [on, members, label, stored, rule]);
}
