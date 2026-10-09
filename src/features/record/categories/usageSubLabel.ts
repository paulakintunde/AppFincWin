// REC-22, UI-SPEC 10: the usage / cap sub-label wording, shared by the Categories screen and the
// entry-sheet picker. Pure: no data-layer imports.
import type { CategoryUsageResult } from '@/engine/categorize';
import type { useT } from '@/i18n';

type Translate = ReturnType<typeof useT>;

export type UsageTone = 'inkMuted' | 'warn1';

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
