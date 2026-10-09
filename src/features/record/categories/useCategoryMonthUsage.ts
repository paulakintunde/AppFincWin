// REC-22, D-04, D-06: this month's usage and cap state per category. Counts paid and pending
// lines, net of refunds, in home currency (2026-10-09 decision) via the engine's categoryUsage.
import { useMemo } from 'react';
import { categoryUsage, type CategoryUsageResult, type UsageRow } from '@/engine/categorize';
import { monthOf } from '@/engine/time';
import { useCategoryLookup } from '@/data/queries/categories';
import { useMonthView } from '@/data/queries/activity';
import { useRecordContext } from '@/features/record/useRecordContext';
import type { useT } from '@/i18n';

type Translate = ReturnType<typeof useT>;

export type UsageTone = 'inkMuted' | 'warn1';

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
      if (row.category_id === null) continue;
      const list = byCategory.get(row.category_id) ?? [];
      list.push({
        amountHome: row.amountHome,
        status: row.status,
        isTransfer: row.transfer_id !== null,
        isRefund: row.is_refund,
      });
      byCategory.set(row.category_id, list);
    }
    const out = new Map<string, CategoryUsageResult>();
    for (const c of lookup.all) {
      out.set(c.id, categoryUsage(byCategory.get(c.id) ?? [], c.monthly_cap));
    }
    return out;
  }, [view.rows, lookup.all]);

  return { usage, isLoading: view.isLoading };
}

/** UI-SPEC 10 wording. Cap breach is warn1, never danger (Confirmed Decision 4). */
export function usageSubLabel(
  u: CategoryUsageResult,
  format: (minor: number) => string,
  t: Translate
): { text: string; tone: UsageTone } {
  switch (u.state) {
    case 'refundsExceed':
      return { text: t('categories.usage.refundsExceed', { amount: format(0 - u.spent) }), tone: 'inkMuted' };
    case 'over':
      return {
        text: t('categories.usage.ofCapOver', { spent: format(u.spent), cap: format(u.cap ?? 0), over: format(u.over) }),
        tone: 'warn1',
      };
    case 'capped':
      return { text: t('categories.usage.ofCap', { spent: format(u.spent), cap: format(u.cap ?? 0) }), tone: 'inkMuted' };
    case 'used':
      return { text: t('categories.usage.used', { count: u.count }), tone: 'inkMuted' };
    default:
      return { text: t('categories.usage.unused'), tone: 'inkMuted' };
  }
}
