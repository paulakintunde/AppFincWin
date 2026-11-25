// REC-22, D-04, D-06: this month's usage and cap state per category. Counts paid and pending
// lines, net of refunds, in home currency (2026-10-09 decision) via the engine's categoryUsage.
import { useMemo } from 'react';
import { categoryUsage, type CategoryUsageResult, type UsageRow } from '@/engine/categorize';
import { monthOf } from '@/engine/time';
import { homeCategoryAmounts } from '@/engine/parts';
import { toParts } from '@/db/categoryParts';
import { useCategoryLookup } from '@/data/queries/categories';
import { useMonthView } from '@/data/queries/activity';
import { useRecordContext } from '@/features/record/useRecordContext';
export { usageSubLabel, type UsageTone } from './usageSubLabel';

export function useCategoryMonthUsage(): { usage: ReadonlyMap<string, CategoryUsageResult>; isLoading: boolean } {
  const rc = useRecordContext();
  const lookup = useCategoryLookup(rc.userId ?? undefined);
  const view = useMonthView(
    { householdId: rc.householdId, homeCurrency: rc.homeCurrency, today: rc.today },
    monthOf(rc.today)
  );

  const usage = useMemo(() => {
    const byCategory = new Map<string, UsageRow[]>();
    for (const row of view.rows) {
      // 10.1-10 (D-05): caps count each category's part, never the whole split line.
      const amounts = homeCategoryAmounts(
        { id: row.id, amount: row.original_amount, categoryId: row.category_id, parts: toParts(row.category_parts ?? null) },
        row.amountHome
      );
      if (amounts === null) {
        // No home figure: the line keeps its old single-row shape (categoryUsage skips a null amountHome).
        if (row.category_id === null) continue;
        const list = byCategory.get(row.category_id) ?? [];
        list.push({ amountHome: null, status: row.status, isTransfer: row.transfer_id !== null, isRefund: row.is_refund });
        byCategory.set(row.category_id, list);
        continue;
      }
      for (const part of amounts) {
        if (part.categoryId === null) continue;
        const list = byCategory.get(part.categoryId) ?? [];
        list.push({
          amountHome: part.amount,
          status: row.status,
          isTransfer: row.transfer_id !== null,
          isRefund: row.is_refund,
        });
        byCategory.set(part.categoryId, list);
      }
    }
    const out = new Map<string, CategoryUsageResult>();
    for (const c of lookup.all) {
      out.set(c.id, categoryUsage(byCategory.get(c.id) ?? [], c.monthly_cap));
    }
    return out;
  }, [view.rows, lookup.all]);

  return { usage, isLoading: view.isLoading };
}
