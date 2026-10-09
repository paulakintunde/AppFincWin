// REC-22, UI-SPEC 10 (last bullet): a save that moves a category from below its monthly cap to
// at or above it fires one warning haptic and one toast. Caps never block a save. The check
// reads the usage the sheet rendered with, which is the "before" state: the optimistic write
// that the save makes lands after the render, so the closure's usage has not seen it yet.
import { crossesCap } from '@/engine/categorize';
import { convertMinor, minorUnits, money, resolveExponent } from '@/engine/money';
import { monthOf } from '@/engine/time';
import { useCategoryLookup } from '@/data/queries/categories';
import { useFxLatest } from '@/data/queries/fxLatest';
import { latestPerEur } from '@/data/queries/homeAmount';
import { categoryName } from '@/features/record/categoryName';
import { useCategoryMonthUsage } from '@/features/record/categories/useCategoryMonthUsage';
import { useRecordContext } from '@/features/record/useRecordContext';
import { useT } from '@/i18n';
import { showToast } from '@/state/undoToast';
import { useMoneyFormatter } from '@/ui/money/useMoneyFormatter';
import { hapticWarning } from '@/ui/haptics';

export interface CapCheckInput {
  categoryId: string | null;
  localDate: string;
  /** The line's signed amount in its own currency (expenses negative, refunds and income positive). */
  amountMinor: number;
  currency: string;
  /** An edit: what the line contributed before, so only the change counts. */
  previous?: { categoryId: string | null; localDate: string; amountMinor: number; currency: string };
  /** Keeps the Undo action on the toast when the save recorded an undo step. */
  stepId?: string | null;
}

export function useCapCrossing(): { check(input: CapCheckInput): boolean } {
  const t = useT();
  const rc = useRecordContext();
  const { usage } = useCategoryMonthUsage();
  const lookup = useCategoryLookup(rc.userId ?? undefined);
  const rates = useFxLatest().data ?? [];
  const formatter = useMoneyFormatter(rc.showCents);

  const toHome = (amountMinor: number, currency: string): number | null => {
    if (currency === rc.homeCurrency) return amountMinor;
    const from = latestPerEur(rates, currency);
    const to = latestPerEur(rates, rc.homeCurrency);
    if (from === null || to === null) return null;
    try {
      return convertMinor(minorUnits(amountMinor), from, resolveExponent(currency), to, resolveExponent(rc.homeCurrency));
    } catch {
      return null;
    }
  };

  const check = (input: CapCheckInput): boolean => {
    if (input.categoryId === null) return false;
    const current = usage.get(input.categoryId);
    if (!current || current.cap === null) return false;
    // Usage covers this month only (useCategoryMonthUsage); other months have no cap reading.
    if (monthOf(input.localDate) !== monthOf(rc.today)) return false;

    const delta = toHome(input.amountMinor, input.currency);
    if (delta === null) return false;
    let previous = 0;
    const p = input.previous;
    if (p && p.categoryId === input.categoryId && monthOf(p.localDate) === monthOf(input.localDate)) {
      const prevHome = toHome(p.amountMinor, p.currency);
      if (prevHome === null) return false;
      previous = prevHome;
    }

    // Expenses are negative, so a bigger expense raises spend.
    const spentBefore = current.spent;
    const spentAfter = spentBefore - (delta - previous);
    if (!crossesCap(spentBefore, spentAfter, current.cap)) return false;

    const category = lookup.all.find((c) => c.id === input.categoryId);
    hapticWarning();
    showToast({
      kind: input.stepId ? 'ordinary' : 'info',
      stepId: input.stepId ?? null,
      text: {
        key: 'categories.cap.overToast',
        params: {
          category: category ? categoryName(category, t) : '',
          amount: formatter.formatMoney(money(spentAfter - current.cap, rc.homeCurrency)),
        },
      },
    });
    return true;
  };

  return { check };
}
